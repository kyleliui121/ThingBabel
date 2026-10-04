// 评测 runner（实验设计 §4）：任务集 → agent → trace 判分 → M2/M4 指标输出。
// 自包含栈（内嵌 broker + 内存库），真实 LLM 走 config.llm；测试注入脚本化假模型。
// 用法：node eval/run.js [--tasks eval/tasks.json] [--repeats 5] [--tool-mode all|grouped]
//                   [--baseline ours|b2] [--out eval/results]
import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import aedes from 'aedes'
import mqtt from 'mqtt'
import { loadConfig } from '../src/config.js'
import { createDb } from '../src/db.js'
import { createActions } from '../src/actions.js'
import { makeHandlers, route } from '../src/router.js'
import { createReorderBuffer } from '../src/reorder.js'
import { createAgent } from '../src/agent/index.js'
import { buildRegistry } from '../src/agent/map.js'
import { createLlm } from '../src/agent/llm.js'
import { withExactCache } from './cache.js'

const DEFAULT_TASKS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tasks.json')
// B2 基线：无发现层——设备清单硬编码进 prompt（功能性等价，但来源是手写而非 discovery）
const B2_CAPS = [{
  device_id: 'sensor-01', name: '温湿度', type: 'sensor',
  actions: [{ name: 'reboot', description: '重启设备', params: [] }]
}, {
  device_id: 'fan-01', name: '风扇', type: 'actuator',
  actions: [{ name: 'set_speed', description: '设置风速', params: [{ name: 'level', type: 'number', required: true }] }]
}]

export async function runEval(options = {}) {
  const o = {
    tasksFile: DEFAULT_TASKS,
    repeats: 5,
    toolMode: 'all',
    baseline: 'ours',
    extraSensors: 0, // M5：额外虚拟传感器数量（工具数 = 4 + extraSensors）
    outDir: path.join(path.dirname(fileURLToPath(import.meta.url)), 'results'),
    callLLM: null, // 注入点：测试用脚本化假模型；缺省用 config.llm 真调用
    telemetryTicks: 1,
    ...options
  }
  const spec = JSON.parse(fs.readFileSync(o.tasksFile, 'utf8'))

  // ── 内嵌栈（同 soak：broker + db + 路由 + 重排缓冲）──
  const broker = aedes()
  const server = net.createServer(broker.handle)
  await new Promise(r => server.listen(0, r))
  const port = server.address().port
  const db = createDb(':memory:')
  const hub = mqtt.connect(`mqtt://127.0.0.1:${port}`)
  const actions = createActions({ publish: (t, p, x) => hub.publish(t, p, { qos: 1, ...x }), db, timeoutMs: 5000 })
  const handlers = makeHandlers({ db, actions })
  const reorder = createReorderBuffer()
  hub.on('connect', () => hub.subscribe('lab/#'))
  hub.on('message', (t, m) => {
    const parts = t.split('/'); const payload = m.toString()
    const safe = () => { try { route(parts, payload, handlers) } catch (e) { console.error('[route]', t, e.message) } }
    if (parts[0] !== 'lab') return
    if (parts[1] === 'discovery' && parts.length === 3) { safe(); if (db.getDevice(parts[2])) reorder.flush(parts[2]); return }
    if (parts[1] === 'devices' && parts.length >= 4 && !db.getDevice(parts[2])) return reorder.stash(parts[2], safe)
    safe()
  })

  // ── 虚拟设备：sensor-01（遥测）/ fan-01（执行器，指令即回 ok）/ offline-01（登记后离线）──
  const mkDevice = (id, intro, onAction) => {
    const c = mqtt.connect(`mqtt://127.0.0.1:${port}`, { clientId: id, will: { topic: `lab/devices/${id}/status`, payload: 'offline', retain: true, qos: 1 } })
    c.on('connect', () => {
      c.publish(`lab/discovery/${id}`, JSON.stringify(intro), { retain: true, qos: 1 })
      c.publish(`lab/devices/${id}/status`, 'online', { retain: true, qos: 1 })
      c.subscribe(`lab/devices/${id}/actions/+`)
    })
    c.on('message', (topic, msg) => {
      let req = {}; try { req = JSON.parse(msg.toString()) } catch {}
      c.publish(`${topic}/result`, JSON.stringify({ action_id: req.action_id, status: 'ok', message: '' }), { qos: 1 })
      onAction?.(req)
    })
    return c
  }
  const sensorIntro = { proto_ver: 1, device_id: 'sensor-01', name: '温湿度', type: 'sensor', description: '', properties: [{ key: 'temperature', name: '温度', unit: '°C', type: 'number' }, { key: 'humidity', name: '湿度', unit: '%', type: 'number' }], actions: [{ name: 'reboot', description: '重启设备', params: [] }], events: [] }
  const fanIntro = { proto_ver: 1, device_id: 'fan-01', name: '风扇', type: 'actuator', description: '', properties: [{ key: 'speed', name: '风速', unit: '档', type: 'number' }], actions: [{ name: 'set_speed', description: '设置风速', params: [{ name: 'level', type: 'number', required: true }] }], events: [] }
  const offlineIntro = { proto_ver: 1, device_id: 'offline-01', name: '离线传感器', type: 'sensor', description: '', properties: [{ key: 'temperature', name: '温度', unit: '°C', type: 'number' }], actions: [{ name: 'reboot', description: '重启设备', params: [] }], events: [] }
  const devs = []
  devs.push(mkDevice('sensor-01', sensorIntro))
  devs.push(mkDevice('fan-01', fanIntro))
  devs.push(mkDevice('offline-01', offlineIntro))
  // M5 规模设备（extraSensors 台额外传感器，各带 1 个 reboot 动作 → 工具数 = 4 + extraSensors）
  for (let i = 1; i <= (o.extraSensors || 0); i++) {
    const id = `fleet-m-${String(i).padStart(3, '0')}`
    devs.push(mkDevice(id, { proto_ver: 1, device_id: id, name: `群传感器 ${i}`, type: 'sensor', description: 'M5 规模实验', properties: [{ key: 'temperature', name: '温度', unit: '°C', type: 'number' }], actions: [{ name: 'reboot', description: '重启设备', params: [] }], events: [] }))
  }
  await new Promise(r => setTimeout(r, 400))
  db.setOnline('offline-01', false) // 协议外模拟：直接置离线（遗嘱效果等价）
  // 喂一拍遥测，让 T1 有数据可查
  for (let i = 0; i < o.telemetryTicks; i++) {
    hub.publish('lab/devices/sensor-01/props/temperature', '24.6', { retain: true })
    hub.publish('lab/devices/sensor-01/props/humidity', '52', { retain: true })
    hub.publish('lab/devices/fan-01/props/speed', '1', { retain: true })
    hub.publish('lab/devices/offline-01/props/temperature', '18.0', { retain: true })
    await new Promise(r => setTimeout(r, 150))
  }

  // ── 落盘目录 + discovery 快照（实验设计 §3.5：工具 schema 本身是实验状态的一部分）──
  fs.mkdirSync(o.outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  fs.writeFileSync(path.join(o.outDir, `${stamp}-discovery.json`), JSON.stringify({
    snapshot_at: new Date().toISOString(), baseline: o.baseline, tool_mode: o.toolMode, extra_sensors: o.extraSensors || 0,
    devices: db.listDevices().map(d => { let caps = {}; try { caps = JSON.parse(d.caps_json) } catch {}; return { device_id: d.device_id, online: !!d.online, caps } })
  }, null, 1))

  // ── agent + 基线/缓存 ──
  // B2（无发现层）：能力清单手写进 prompt 与 tools——这正是 B2 要量的"手写接入"本体
  const b2Reg = {
    tools: [
      { type: 'function', function: { name: 'lab_get_device_state', description: '查询一台设备的最新遥测与在线状态', parameters: { type: 'object', properties: { device_id: { type: 'string', description: '设备 id，如 sensor-01' } }, required: ['device_id'] } } },
      { type: 'function', function: { name: 'sensor-01__reboot', description: '[温湿度] 重启设备', parameters: { type: 'object', properties: {}, required: [] } } },
      { type: 'function', function: { name: 'fan-01__set_speed', description: '[风扇] 设置风速', parameters: { type: 'object', properties: { level: { type: 'number', description: 'level' } }, required: ['level'] } } }
    ],
    prompt: `你是实验室设备编排助手。设备：${JSON.stringify(B2_CAPS)}。规则：只使用提供的工具；执行结果以工具返回为准。`
  }

  let callLLM = o.callLLM ?? createLlm(loadConfig().llm)
  callLLM = withExactCache(callLLM) // k 次重复的成本杠杆（实验设计 §3.3 纪律②）

  const agent = createAgent({
    db, actions, callLLM, toolMode: o.toolMode,
    registry: o.baseline === 'b2' ? b2Reg : null,
    llmInfo: { system: 'bigmodel', model: loadConfig().llm.model }
  })

  // ── 执行 + 判分 ──
  const judge = (task, run, dispatchCount) => {
    const c = task.check || { type: 'answer' }
    const toolLogs = run.log
    const actionLogs = toolLogs.filter(l => l.action_id)
    switch (c.type) {
      case 'state_query': return toolLogs.some(l => l.tool === 'lab_get_device_state' && l.status === 'ok' && (!c.device_id || l.device_id === c.device_id))
      case 'action': return actionLogs.some(l => l.device_id === c.device_id && l.tool.endsWith(`__${c.action}`) && l.status === 'ok')
      case 'no_dispatch': return dispatchCount === 0
      case 'error_seen': return toolLogs.some(l => l.status && l.status !== 'ok')
      case 'min_tools': return toolLogs.length >= c.n
      case 'answer': return typeof run.answer === 'string' && run.answer.trim().length > 0
      default: return false
    }
  }

  const results = []
  for (const task of spec.tasks) {
    const runs = []
    for (let k = 0; k < o.repeats; k++) {
      const before = db.countActions()
      const r = await agent.run(task.text)
      const after = db.countActions()
      runs.push({ k, success: judge(task, r, after - before), answer: r.answer, steps: r.steps, trace_id: r.trace_id, log: r.log })
    }
    results.push({ id: task.id, category: task.category, text: task.text, runs, successRate: runs.filter(x => x.success).length / runs.length })
  }

  // ── M4 延迟分解（从 trace span 汇总）──
  let llmMs = 0, toolMs = 0, traceCount = 0
  for (const t of results) for (const run of t.runs) {
    const spans = db.getTrace(run.trace_id)
    traceCount++
    for (const s of spans) {
      if (!s.end_ms) continue
      if (s.name === 'gen_ai.chat') llmMs += s.end_ms - s.start_ms
      else if (s.name.startsWith('tool ')) toolMs += s.end_ms - s.start_ms
    }
  }

  const byCategory = {}
  for (const t of results) (byCategory[t.category] ??= { tasks: 0, successRate: 0, _acc: 0 })._acc += t.successRate
  for (const k of Object.keys(byCategory)) { byCategory[k].tasks = results.filter(t => t.category === k).length; byCategory[k].successRate = +(byCategory[k]._acc / byCategory[k].tasks).toFixed(3); delete byCategory[k]._acc }

  const summary = {
    overall: +(results.reduce((a, t) => a + t.successRate, 0) / results.length).toFixed(3),
    byCategory,
    cache: callLLM.stats,
    latency: { llm_ms_total: llmMs, protocol_ms_total: toolMs, traces: traceCount },
    m1_access_cost: m1Cost(o.baseline, db.listDevices().length),
    config: { repeats: o.repeats, toolMode: o.toolMode, baseline: o.baseline, extraSensors: o.extraSensors || 0, tasks: spec.tasks.length, tasksVersion: spec.version }
  }

  // ── 落盘 ──
  const jsonPath = path.join(o.outDir, `${stamp}.json`)
  fs.writeFileSync(jsonPath, JSON.stringify({ summary, results }, null, 1))
  const csvPath = path.join(o.outDir, `${stamp}.csv`)
  fs.writeFileSync(csvPath, 'id,category,success_rate\n' + results.map(t => `${t.id},${t.category},${t.successRate}`).join('\n'))

  for (const c of devs) c.end(true)
  hub.end(true)
  await new Promise(r => server.close(r))
  broker.close()

  return { summary, results, jsonPath, csvPath }
}

// M1 接入成本（metrics-definitions.md）：各基线为接入设备所需的人工产物；ours 的卖点是增量 0
function m1Cost(baseline, nDevices) {
  if (baseline === 'b1') {
    const schema = [{ name: 'x__action', description: '[设备] 动作说明', parameters: { type: 'object', properties: { level: { type: 'number', description: '参数' } }, required: ['level'] } }]
    const schemaLines = JSON.stringify(schema, null, 2).split('\n').length
    const regLines = 4
    return { mode: 'b1 手工接入', schema_lines_per_device: schemaLines, registration_lines_per_device: regLines, total_lines: nDevices * (schemaLines + regLines), devices: nDevices }
  }
  if (baseline === 'b2') return { mode: 'b2 无发现层（硬编码清单）', note: '手写成本与 b1 同级（见 run.js b2Reg）；b2 隔离的是发现层的运行时贡献' }
  if (baseline === 'b4') return { mode: 'b4 MCP 手工注册', note: '见 eval/b4-manifest.json：每设备每动作需人工声明 name/description/inputSchema/dispatch' }
  return { mode: 'ours（discovery 零转换）', per_device_lines: 0, config_entries: 0, adapter_lines_total: 90, note: '适配层为一次性成本（map.js），此后每台新设备 0 行 0 配置' }
}

// CLI 入口（被 import 时不执行）
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt }
  const { summary, jsonPath } = await runEval({
    tasksFile: arg('tasks', DEFAULT_TASKS),
    repeats: Number(arg('repeats', 5)),
    toolMode: arg('tool-mode', 'all'),
    baseline: arg('baseline', 'ours'),
    extraSensors: Number(arg('extra-sensors', 0))
  })
  console.log(JSON.stringify(summary, null, 1))
  console.log('结果已写入', jsonPath)
}
