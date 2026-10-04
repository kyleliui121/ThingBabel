// M5 批量采集：工具数 10/50/100/200 → extraSensors = 目标-4，各跑一轮评测
// ⚠️ 真实 LLM 下 200 工具 × 30 任务 × k 重复有真实费用——先用 --repeats 1 冒烟
// 用法：node eval/m5.js [--repeats 1] [--tool-mode all]
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runEval } from './run.js'

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt }
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'results', 'm5')
const rows = []

for (const target of [10, 50, 100, 200]) {
  const extraSensors = target - 4 // 4 = 状态工具 + 3 台核心设备各 1 动作
  console.log(`\n[m5] 目标工具数 ${target}（extraSensors=${extraSensors}）`)
  const { summary } = await runEval({
    extraSensors, repeats: Number(arg('repeats', 1)), toolMode: arg('tool-mode', 'all'),
    baseline: arg('baseline', 'ours'), outDir
  })
  rows.push({ target_tool_count: target, actual_tool_count: 4 + extraSensors, overall: summary.overall, byCategory: summary.byCategory, llm_ms: summary.latency.llm_ms_total })
  console.log(`[m5] overall=${summary.overall}`)
}

const fs = await import('node:fs')
const out = path.join(outDir, `m5-summary-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(out, JSON.stringify(rows, null, 1))
console.log('\n[m5] 曲线数据已写入', out)
