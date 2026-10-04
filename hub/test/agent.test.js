import test from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '../src/db.js'
import { createAgent } from '../src/agent/index.js'

const caps = {
  proto_ver: 1, device_id: 'sensor-01', name: '温湿度', type: 'sensor',
  properties: [{ key: 'temperature', name: '温度', unit: '°C', type: 'number' }],
  actions: [{ name: 'reboot', description: '重启设备', params: [] }],
  events: []
}

function mkStack({ online = 1 } = {}) {
  const db = createDb(':memory:')
  db.upsertDevice({ device_id: 'sensor-01', name: '温湿度', type: 'sensor', description: '', proto_ver: 1, caps_json: JSON.stringify(caps) })
  db.insertTelemetry('sensor-01', 'temperature', '23.5', new Date().toISOString())
  if (!online) db.setOnline('sensor-01', false)

  const dispatched = []
  let n = 0
  const actions = {
    dispatch: (deviceId, name, params) => {
      const action_id = `a${++n}`
      db.createAction({ action_id, device_id: deviceId, action_name: name, params_json: JSON.stringify(params) })
      db.updateAction(action_id, { status: 'ok' }) // 假设备立即回 ok
      dispatched.push({ deviceId, name, params })
      return { action_id }
    }
  }
  return { db, actions, dispatched }
}

const scripted = (responses) => { let i = 0; return async () => responses[Math.min(i++, responses.length - 1)] }
const call = (id, name, args) => ({ id, function: { name, arguments: JSON.stringify(args) } })

test('查询链路：查状态工具返回真实遥测，LLM 据实汇报', async () => {
  const s = mkStack()
  const agent = createAgent({
    db: s.db, actions: s.actions,
    callLLM: scripted([
      { content: '', tool_calls: [call('t1', 'lab_get_device_state', { device_id: 'sensor-01' })] },
      { content: '当前温度 23.5°C', tool_calls: [] }
    ])
  })
  const r = await agent.run('现在多少度？')
  assert.equal(r.answer, '当前温度 23.5°C')
  assert.equal(s.dispatched.length, 0) // 查询不下发指令
  assert.equal(r.log[0].status, 'ok')
  assert.equal(r.log[0].props.temperature, '23.5')
})

test('控制链路：确认通过 → dispatch → 回执 ok 回填给 LLM', async () => {
  const s = mkStack()
  const agent = createAgent({
    db: s.db, actions: s.actions,
    callLLM: scripted([
      { content: '', tool_calls: [call('t1', 'sensor-01__reboot', {})] },
      { content: '已重启传感器', tool_calls: [] }
    ])
  })
  const r = await agent.run('重启一下传感器')
  assert.equal(s.dispatched.length, 1)
  assert.equal(s.dispatched[0].name, 'reboot')
  assert.equal(r.log[0].status, 'ok')
  assert.ok(r.log[0].action_id)
  assert.equal(r.answer, '已重启传感器')
})

test('人工确认拒绝：不下发指令，回执 rejected', async () => {
  const s = mkStack()
  const agent = createAgent({
    db: s.db, actions: s.actions, confirm: async () => false,
    callLLM: scripted([
      { content: '', tool_calls: [call('t1', 'sensor-01__reboot', {})] },
      { content: '用户拒绝了操作', tool_calls: [] }
    ])
  })
  const r = await agent.run('重启传感器')
  assert.equal(s.dispatched.length, 0)
  assert.equal(r.log[0].status, 'rejected')
})

test('设备离线：不下发直接返回 error（T5 异常处置路径）', async () => {
  const s = mkStack({ online: 0 })
  const agent = createAgent({
    db: s.db, actions: s.actions,
    callLLM: scripted([
      { content: '', tool_calls: [call('t1', 'sensor-01__reboot', {})] },
      { content: '设备离线了，无法执行', tool_calls: [] }
    ])
  })
  const r = await agent.run('重启传感器')
  assert.equal(s.dispatched.length, 0)
  assert.equal(r.log[0].status, 'error')
  assert.match(r.log[0].message, /离线/)
})

test('未知工具名：返回 error 不崩', async () => {
  const s = mkStack()
  const agent = createAgent({
    db: s.db, actions: s.actions,
    callLLM: scripted([
      { content: '', tool_calls: [call('t1', 'bogus_tool', {})] },
      { content: '工具不存在', tool_calls: [] }
    ])
  })
  const r = await agent.run('随便试试')
  assert.equal(r.log[0].status, 'error')
  assert.match(r.log[0].message, /未知工具/)
})

test('步数上限：连续工具调用超过 maxSteps 时中止', async () => {
  const s = mkStack()
  const agent = createAgent({
    db: s.db, actions: s.actions, maxSteps: 2,
    callLLM: scripted([{ content: '', tool_calls: [call('t1', 'lab_get_device_state', { device_id: 'sensor-01' })] }])
  })
  const r = await agent.run('无限查')
  assert.equal(r.aborted, true)
  assert.equal(r.steps, 2)
})

test('事件工具：lab_get_recent_events 返回已入库事件（异常→编排地基）', async () => {
  const s = mkStack()
  s.db.insertEvent('sensor-01', 'anomaly', '{"severity":"warn"}', new Date().toISOString())
  const agent = createAgent({
    db: s.db, actions: s.actions,
    callLLM: scripted([
      { content: '', tool_calls: [call('t1', 'lab_get_recent_events', { device_id: 'sensor-01' })] },
      { content: '有一条温度异常告警', tool_calls: [] }
    ])
  })
  const r = await agent.run('有什么异常吗？')
  assert.equal(r.log[0].status, 'ok')
  assert.equal(r.log[0].events.length, 1)
  assert.equal(r.log[0].events[0].name, 'anomaly')
})

test('授权边界（P0）：设备未声明的动作被拒绝下发，到不了 MQTT', async () => {
  const s = mkStack()
  const agent = createAgent({
    db: s.db, actions: s.actions,
    callLLM: scripted([
      { content: '', tool_calls: [call('t1', 'sensor-01__format_disk', {})] }, // 幻觉/注入动作
      { content: '设备没有这个功能', tool_calls: [] }
    ])
  })
  const r = await agent.run('帮我把磁盘格式化')
  assert.equal(s.dispatched.length, 0, '未声明动作不得下发')
  assert.equal(r.log[0].status, 'rejected')
  assert.match(r.log[0].message, /未声明/)
})

test('分组注入下同样受授权边界保护（toolMode=grouped 绕不过 caps 校验）', async () => {
  const s = mkStack()
  const agent = createAgent({
    db: s.db, actions: s.actions, toolMode: 'grouped',
    callLLM: scripted([
      { content: '', tool_calls: [call('t1', 'sensor-01__open_door', {})] },
      { content: '无法执行', tool_calls: [] }
    ])
  })
  const r = await agent.run('把门打开')
  assert.equal(s.dispatched.length, 0)
  assert.equal(r.log[0].status, 'rejected')
})
