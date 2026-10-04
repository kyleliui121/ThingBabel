// 导出全部 agent trace 为论文附录用的 JSON 包（实验设计 §3.5 回放清单）
// 用法：npm run export-traces
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfigOrExit } from '../src/config.js'
import { createDb } from '../src/db.js'

const config = loadConfigOrExit()
const db = createDb(config.dbFile)
const list = db.listTraces(500)
const traces = list.map(t => ({ trace_id: t.trace_id, task: t.task, spans: db.getTrace(t.trace_id) }))

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'eval', 'results')
fs.mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, `traces-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(out, JSON.stringify({
  exported_at: new Date().toISOString(),
  gen_ai_system: 'bigmodel',
  trace_format: 'OpenTelemetry GenAI semantic conventions compatible (development)',
  trace_count: traces.length,
  traces
}, null, 1))
console.log(`[export-traces] ${traces.length} 条 trace 已写入 ${out}`)
