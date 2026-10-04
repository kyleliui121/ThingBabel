// AI 编排 CLI：node src/agent/cli.js "自然语言任务"
// 需 hub 的 broker 可达（默认本机 1883）且 config.json 已填 llm.apiKey
import mqtt from 'mqtt'
import { loadConfig } from '../config.js'
import { createDb } from '../db.js'
import { createActions } from '../actions.js'
import { createAgent } from './index.js'
import { createLlm } from './llm.js'

const task = process.argv.slice(2).join(' ')
if (!task) { console.error('用法：node src/agent/cli.js "自然语言任务"'); process.exit(1) }

const config = loadConfig()
if (!config.llm.apiKey) { console.error('请先在 hub/config.json 的 llm.apiKey 填入 BigModel API Key'); process.exit(1) }

const db = createDb(config.dbFile)
const client = mqtt.connect(config.mqttUrl)
const actions = createActions({
  publish: (t, p, opts) => client.publish(t, p, { qos: 1, ...opts }),
  db, timeoutMs: 5000
})

// 安全策略（实验设计 §3.4）：sensor 类设备动作直接放行，其余类型人工 y/N 确认
const confirm = async ({ device_id, action }) => {
  const d = db.getDevice(device_id)
  if (d && d.type === 'sensor') return true
  process.stdout.write(`即将对 ${device_id} 执行 ${action}，确认？(y/N) `)
  const r = await new Promise(res => process.stdin.once('data', d2 => res(d2.toString().trim().toLowerCase())))
  return r === 'y'
}

client.on('connect', async () => {
  try {
    const agent = createAgent({
      db, actions, callLLM: createLlm(config.llm), confirm,
      llmInfo: { system: 'bigmodel', model: config.llm.model } // 进 trace 的 gen_ai.* 属性
    })
    console.log(JSON.stringify(await agent.run(task), null, 2))
  } catch (e) {
    console.error('[agent]', e.message)
    process.exitCode = 1
  }
  client.end(true)
  process.exit()
})
