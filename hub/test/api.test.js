import test from 'node:test'
import assert from 'node:assert/strict'
import { createApi } from '../src/api.js'
import { createDb } from '../src/db.js'
import { createActions } from '../src/actions.js'

async function startApi() {
  const db = createDb(':memory:')
  const config = { adminPassword: 'pw', jwtSecret: 'test-secret' }
  const actions = createActions({ publish: () => {}, db, timeoutMs: 100 })
  const app = createApi({ db, actions, config })
  const server = app.listen(0)
  await new Promise(r => server.on('listening', r))
  const base = `http://127.0.0.1:${server.address().port}`
  const call = (method, path, body, token) => fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  return { db, base, call, close: () => server.close() }
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
