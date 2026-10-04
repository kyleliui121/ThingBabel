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

function mkStack() {
  const db = createDb(':memory:')
  db.upsertDevice({ device_id: 'sensor-01', name: '温湿度', type: 'sensor', description: '', proto_ver: 1, caps_json: JSON.stringify(caps) })
  db.insertTelemetry('sensor-01', 'temperature', '23.5', new Date().toISOString())
  const dispatched = []
  const actions = {
    dispatch: (deviceId, name, params) => {
      const action_id = 'a1'
      db.createAction({ action_id, device_id: deviceId, action_name: name, params_json: JSON.stringify(params) })
      db.updateAction(action_id, { status: 'ok' })
      dispatched.push({ deviceId, name, params })
      return { action_id }
    }
  }
  return { db, actions, dispatched }
}

const scripted = (responses) => { let i = 0; return async () => responses[Math.min(i++, responses.length - 1)] }
const call = (id, name, args) => ({ id, function: { name, arguments: JSON.stringify(args) } })

test('trace：root→gen_ai.chat→tool 父子链与属性齐全，可经 db 查询', async () => {
  const s = mkStack()
  const agent = createAgent({
    db: s.db, actions: s.actions, llmInfo: { system: 'bigmodel', model: 'glm-test' },
    callLLM: scripted([
      { content: '', tool_calls: [call('t1', 'sensor-01__reboot', {})] },
      { content: '已重启', tool_calls: [] }
    ])
  })
  const r = await agent.run('重启传感器')
  assert.ok(r.trace_id)

  const spans = s.db.getTrace(r.trace_id)
  assert.equal(spans.length, 4) // root + 2×gen_ai.chat + 1×tool
  const root = spans.find(x => x.name === 'agent.task')
  const chats = spans.filter(x => x.name === 'gen_ai.chat')
  const tool = spans.find(x => x.name.startsWith('tool '))

  assert.equal(root.parent_span_id, null)
  const rootAttrs = JSON.parse(root.attributes_json)
  assert.equal(rootAttrs['lab.task'], '重启传感器')
  assert.equal(rootAttrs['gen_ai.system'], 'bigmodel')
  assert.equal(rootAttrs['lab.steps'], 2)
  assert.ok(rootAttrs['lab.answer'].includes('重启'))

  const c0 = JSON.parse(chats[0].attributes_json)
  assert.equal(c0['gen_ai.operation.name'], 'chat')
  assert.equal(c0['gen_ai.request.model'], 'glm-test')
  assert.equal(c0['gen_ai.response.tool_calls'], 1)
  assert.ok(c0['gen_ai.request.tool_count'] >= 2) // 内置状态工具 + reboot
  for (const c of chats) assert.equal(c.parent_span_id, root.span_id, 'chat span 必须挂在 root 下（否则 listTraces 的 root 识别会认错行）')

  assert.equal(tool.parent_span_id, chats[0].span_id, 'tool span 应挂在产生它的那次 LLM 调用下')
  const tAttrs = JSON.parse(tool.attributes_json)
  assert.equal(tAttrs['lab.status'], 'ok')
  assert.equal(tAttrs['lab.action_id'], 'a1')
  assert.ok(tool.end_ms >= tool.start_ms)
})

test('listTraces：摘要带任务文本；getTrace 空返回空数组', async () => {
  const s = mkStack()
  const agent = createAgent({
    db: s.db, actions: s.actions,
    callLLM: scripted([{ content: '好的', tool_calls: [] }])
  })
  await agent.run('现在多少度')
  const list = s.db.listTraces(10)
  assert.equal(list.length, 1)
  assert.equal(list[0].task, '现在多少度')
  assert.ok(list[0].spans >= 2)
  assert.deepEqual(s.db.getTrace('no-such-trace'), [])
})

test('traces REST API：列表与详情', async () => {
  const { createApi } = await import('../src/api.js')
  const { EventEmitter } = await import('node:events')
  const db = createDb(':memory:')
  const config = { adminPassword: 'pw', jwtSecret: 't' }
  const actions = { dispatch: () => ({ action_id: 'x' }) }
  const app = createApi({ db, actions, config, bus: new EventEmitter() })
  const server = app.listen(0)
  await new Promise(r => server.on('listening', r))
  const base = `http://127.0.0.1:${server.address().port}`
  const { data: { token } } = await (await fetch(base + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'pw' })
  })).json()

  const agent = createAgent({ db, actions, callLLM: scripted([{ content: 'ok', tool_calls: [] }]) })
  const r = await agent.run('api 测试任务')

  const list = (await (await fetch(base + '/api/traces', { headers: { Authorization: `Bearer ${token}` } })).json()).data
  assert.equal(list.length, 1)
  assert.equal(list[0].task, 'api 测试任务')

  const detail = (await (await fetch(`${base}/api/traces/${r.trace_id}`, { headers: { Authorization: `Bearer ${token}` } })).json()).data
  assert.ok(detail.some(x => x.name === 'agent.task'))

  assert.equal((await fetch(base + '/api/traces/nope', { headers: { Authorization: `Bearer ${token}` } })).status, 404)
  server.closeAllConnections?.()
  server.close()
})
