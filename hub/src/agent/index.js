// C2 编排循环（论文实验设计 §3.3）：自然语言任务 → LLM 规划 → 指令下发 → 回执 → 汇报。
// callLLM 为注入的模型适配器（测试注入脚本化假模型，生产用 llm.js 的 GLM 适配器）
import { buildRegistry } from './map.js'

export function createAgent({ db, actions, callLLM, confirm = async () => true, maxSteps = 5, resultWaitMs = 6500 }) {
  async function run(task) {
    const reg = buildRegistry(db)
    const messages = [
      { role: 'system', content: reg.prompt },
      { role: 'user', content: task }
    ]
    const log = []
    for (let step = 1; step <= maxSteps; step++) {
      const res = await callLLM(messages, reg.tools)
      const calls = res?.tool_calls || []
      if (!calls.length) return { answer: res?.content || '', steps: step, log }

      messages.push({ role: 'assistant', content: res?.content || '', tool_calls: calls })
      for (const tc of calls) {
        const out = await execTool(tc, { db, actions, confirm, resultWaitMs })
        log.push({ tool: tc.function.name, ...out })
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out) })
      }
    }
    return { answer: '已达步数上限，任务中止。', steps: maxSteps, log, aborted: true }
  }
  return { run }
}

async function execTool(tc, { db, actions, confirm, resultWaitMs }) {
  let args = {}
  try { args = JSON.parse(tc.function.arguments || '{}') } catch {}
  const name = tc.function.name

  if (name === 'lab_get_device_state') {
    const d = db.getDevice(args.device_id)
    if (!d) return { status: 'error', message: `设备 ${args.device_id} 不存在` }
    const props = Object.fromEntries(db.latestProps(d.device_id).map(p => [p.key, p.value]))
    return { status: 'ok', device_id: d.device_id, name: d.name, online: !!d.online, props }
  }

  const sep = name.indexOf('__')
  if (sep < 0) return { status: 'error', message: `未知工具 ${name}` }
  const deviceId = name.slice(0, sep)
  const actionName = name.slice(sep + 2)

  const d = db.getDevice(deviceId)
  if (!d) return { status: 'error', message: `设备 ${deviceId} 不存在` }
  if (!d.online) return { status: 'error', message: `设备 ${deviceId} 离线，指令未下发` }

  if (!(await confirm({ device_id: deviceId, action: actionName, params: args })))
    return { status: 'rejected', message: '人工确认拒绝执行' }

  const { action_id } = actions.dispatch(deviceId, actionName, args)
  const fin = await waitResult(db, action_id, resultWaitMs)
  return { status: fin.status, message: fin.message || '', action_id }
}

// 轮询指令状态直到非 pending 或超时（hub 自身 5 秒超时兜底，此处略晚于它）
function waitResult(db, actionId, deadlineMs) {
  return new Promise(resolve => {
    const t0 = Date.now()
    const tick = () => {
      const a = db.getAction(actionId)
      if (!a) return resolve({ status: 'error', message: '指令记录丢失' })
      if (a.status !== 'pending') return resolve(a)
      if (Date.now() - t0 > deadlineMs) return resolve({ status: 'timeout', message: '等待回执超时' })
      setTimeout(tick, 150)
    }
    tick()
  })
}
