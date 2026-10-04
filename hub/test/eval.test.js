import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { withExactCache } from '../eval/cache.js'
import { runEval } from '../eval/run.js'

test('精确缓存：同前缀命中，不同前缀未命中', async () => {
  let calls = 0
  const llm = withExactCache(async (messages) => { calls++; return { content: `resp-${calls}`, tool_calls: [] } })
  const m1 = [{ role: 'user', content: 'a' }]
  assert.equal((await llm(m1, [])).content, 'resp-1')
  assert.equal((await llm(m1, [])).content, 'resp-1') // 命中
  assert.equal((await llm([{ role: 'user', content: 'b' }], [])).content, 'resp-2')
  assert.deepEqual(llm.stats, { hits: 1, misses: 2 })
})

test('runner 端到端：脚本化 LLM × 3 任务 × 2 重复，判分/缓存/落盘齐全', async () => {
  // 脚本：查状态 → 直接回答（覆盖 T1 与 T5-01 的 no_dispatch 路径）
  let i = 0
  const scripted = async () => {
    const step = i++ % 2
    if (step === 0) return { content: '', tool_calls: [{ id: 't1', function: { name: 'lab_get_device_state', arguments: JSON.stringify({ device_id: 'sensor-01' }) } }] }
    return { content: '温度 24.6°C', tool_calls: [] }
  }
  const tasksFile = path.join(os.tmpdir(), `tasks-${Date.now()}.json`)
  fs.writeFileSync(tasksFile, JSON.stringify({
    version: 'test', tasks: [
      { id: 'T1-01', category: 'T1', text: '现在多少度？', check: { type: 'state_query', device_id: 'sensor-01' } },
      { id: 'T1-02', category: 'T1', text: '湿度呢？', check: { type: 'state_query', device_id: 'sensor-01' } },
      { id: 'T5-01', category: 'T5', text: '把 offline-01 的风速调到 2', check: { type: 'no_dispatch' } }
    ]
  }))
  const outDir = path.join(os.tmpdir(), `eval-${Date.now()}`)

  const { summary, results, jsonPath, csvPath } = await runEval({
    tasksFile, repeats: 2, outDir, callLLM: scripted, telemetryTicks: 1
  })

  assert.equal(results.length, 3)
  for (const t of results) assert.equal(t.runs.length, 2)
  // T1 判成功（脚本走了 state 工具），T5-01 的 no_dispatch 也判成功（脚本只查不控）
  assert.equal(summary.overall, 1)
  assert.equal(summary.byCategory.T1.successRate, 1)
  assert.equal(summary.byCategory.T5.successRate, 1)
  assert.ok(summary.cache.hits >= 3, `重复任务应命中缓存（实际 ${JSON.stringify(summary.cache)}）`)
  assert.ok(summary.latency.traces === 6)
  assert.ok(fs.existsSync(jsonPath) && fs.existsSync(csvPath))
  const csv = fs.readFileSync(csvPath, 'utf8')
  assert.match(csv, /T1-01,T1,1/)
  fs.rmSync(outDir, { recursive: true, force: true })
  fs.rmSync(tasksFile, { force: true })
})
