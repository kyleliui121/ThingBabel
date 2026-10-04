import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createApi } from '../src/api.js'
import { createDb } from '../src/db.js'
import { createActions } from '../src/actions.js'

async function startApi() {
  const db = createDb(':memory:')
  const config = { adminPassword: 'pw', jwtSecret: 'test-secret' }
  const bus = new EventEmitter()
  const actions = createActions({ publish: () => {}, db, timeoutMs: 100 })
  const app = createApi({ db, actions, config, bus })
  const server = app.listen(0)
  await new Promise(r => server.on('listening', r))
  const base = `http://127.0.0.1:${server.address().port}`
  const call = (method, path, body, token) => fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  // closeAllConnections：SSE 长连接不关会拖住测试进程
  const close = () => { server.closeAllConnections?.(); server.close() }
  return { db, bus, base, call, close }
}

const intro = { proto_ver: 1, device_id: 'sensor-01', name: '温湿度', type: 'sensor', description: '', properties: [{ key: 'temperature', name: '温度', unit: '°C', type: 'number' }], actions: [{ name: 'reboot', description: '重启', params: [] }], events: [] }

test('登录换 token，错误密码 401', async () => {
  const s = await startApi()
  assert.equal((await s.call('POST', '/api/login', { password: 'wrong' })).status, 401)
  const r = await s.call('POST', '/api/login', { password: 'pw' })
  assert.equal(r.status, 200)
  assert.ok((await r.json()).data.token)
  s.close()
})

test('未带 token 访问设备列表 401', async () => {
  const s = await startApi()
  assert.equal((await s.call('GET', '/api/devices')).status, 401)
  s.close()
})

test('设备列表带最新遥测，详情带 caps，历史可查', async () => {
  const s = await startApi()
  const { data: { token } } = await (await s.call('POST', '/api/login', { password: 'pw' })).json()
  s.db.upsertDevice({ ...intro, caps_json: JSON.stringify(intro) })
  s.db.insertTelemetry('sensor-01', 'temperature', '23.5', new Date().toISOString())

  const list = (await (await s.call('GET', '/api/devices', null, token)).json()).data
  assert.equal(list[0].device_id, 'sensor-01')
  assert.equal(list[0].props.temperature.value, '23.5')

  const detail = (await (await s.call('GET', '/api/devices/sensor-01', null, token)).json()).data
  assert.equal(detail.caps.properties[0].key, 'temperature')

  const hist = (await (await s.call('GET', '/api/devices/sensor-01/props/history?key=temperature&limit=10', null, token)).json()).data
  assert.equal(hist.length, 1)
  s.close()
})

test('历史 limit 负数不会退化为整表返回', async () => {
  const s = await startApi()
  const { data: { token } } = await (await s.call('POST', '/api/login', { password: 'pw' })).json()
  s.db.upsertDevice({ ...intro, caps_json: JSON.stringify(intro) })
  for (let i = 0; i < 150; i++) // 播种 >100 条：limit=-1 在 SQLite 里是无限制，会整表吐出
    s.db.insertTelemetry('sensor-01', 'temperature', String(20 + i), new Date().toISOString())

  const hist = (await (await s.call('GET', '/api/devices/sensor-01/props/history?key=temperature&limit=-1', null, token)).json()).data
  assert.ok(hist.length <= 100, `limit=-1 应有下界，不应整表返回（实际 ${hist.length} 条）`)
  s.close()
})

test('下发指令返回 action_id，超时后可查状态', async () => {
  const s = await startApi()
  const { data: { token } } = await (await s.call('POST', '/api/login', { password: 'pw' })).json()
  s.db.upsertDevice({ ...intro, caps_json: JSON.stringify(intro) })
  const r = await (await s.call('POST', '/api/devices/sensor-01/actions', { name: 'reboot' }, token)).json()
  assert.ok(r.data.action_id)
  await new Promise(r2 => setTimeout(r2, 200))
  const a = (await (await s.call('GET', `/api/actions/${r.data.action_id}`, null, token)).json()).data
  assert.equal(a.status, 'timeout')
  s.close()
})

test('CORS 头存在（uni-app H5 需要）', async () => {
  const s = await startApi()
  const r = await s.call('GET', '/api/devices')
  assert.equal(r.headers.get('access-control-allow-origin'), '*')
  s.close()
})

test('SSE 流：无 token 401，有 token 收到实时推送', async () => {
  const s = await startApi()
  const { data: { token } } = await (await s.call('POST', '/api/login', { password: 'pw' })).json()

  assert.equal((await fetch(s.base + '/api/stream')).status, 401)

  const ac = new AbortController()
  const res = await fetch(`${s.base}/api/stream?token=${token}`, { signal: ac.signal })
  assert.ok(res.headers.get('content-type').includes('text/event-stream'))
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  const readUntil = async (pred) => {
    for (let i = 0; i < 10 && !pred(buf); i++) buf += dec.decode((await reader.read()).value)
  }

  s.bus.emit('push', { type: 'props', device_id: 'sensor-01', key: 'temperature', value: '23.5', ts: 'now' })
  await readUntil(b => b.includes('"type":"props"'))
  assert.match(buf, /data: \{"type":"props","device_id":"sensor-01","key":"temperature","value":"23.5"/)

  s.bus.emit('push', { type: 'status', device_id: 'sensor-01', online: false })
  await readUntil(b => b.includes('"type":"status"'))
  assert.match(buf, /"online":false/)
  ac.abort()
  await reader.cancel().catch(() => {})
  s.close()
})
