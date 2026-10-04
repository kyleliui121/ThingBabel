// 冻结任务集（metrics-definitions.md 纪律 1）：算 SHA-256 写入 eval/tasks.frozen.json
// 定稿后运行一次；此后 tasks.json 任何改动都会导致哈希不符——防止"事后挑数据"
// 用法：npm run freeze-tasks
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const tasksPath = path.join(dir, '..', 'eval', 'tasks.json')
const spec = JSON.parse(fs.readFileSync(tasksPath, 'utf8'))
const sha256 = createHash('sha256').update(fs.readFileSync(tasksPath)).digest('hex')

const frozen = { version: spec.version, sha256, frozen_at: new Date().toISOString(), task_count: spec.tasks.length }
fs.writeFileSync(path.join(dir, '..', 'eval', 'tasks.frozen.json'), JSON.stringify(frozen, null, 1))
console.log('[freeze-tasks] 已冻结:', JSON.stringify(frozen))
console.log('提醒: 论文附录需附任务集全文与该哈希；再改 tasks.json 必须升 version 并重新冻结')
