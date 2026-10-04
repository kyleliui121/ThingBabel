import test from 'node:test'
import assert from 'node:assert/strict'
import { startStack, wait } from './helpers.js'
import { createActions, __test } from '../src/actions.js'
import { createDb } from '../src/db.js'
import { handleResult } from '../src/handlers/result.js'

test('dispatch 生成 action_id 并发 MQTT；设备回 ok 后状态更新', async () => {
  const s = await startStack({ timeoutMs: 300 })
  s.device.subscribe('lab/devices/sensor-01/actions/#')
  s.device.on('message', (t, m) => {
    if (t.endsWith('/result')) return
    const req = JSON.parse(m.toString())
    s.device.publish(`${t}/result`, JSON.stringify({ action_id: req.action_id, status: 'ok', message: '' }))
  })
  s.publish('lab/discovery/sensor-01', JSON.stringify({
    proto_ver: 1, device_id: 'sensor-01', name: 't', type: 'sensor',
    properties: [], actions: [], events: []
  }), { retain: true })
  await wait(150)

  const { action_id } = s.actions.dispatch('sensor-01', 'reboot', {})
  await wait(200)
  assert.equal(s.db.getAction(action_id).status, 'ok')
  await s.close()
})

test('5 秒（测试中 300ms）无回执置 timeout', async () => {
  const s = await startStack({ timeoutMs: 300 })
  s.db.upsertDevice({ device_id: 'sensor-01', name: 't', type: 'sensor', description: '', proto_ver: 1, caps_json: '{}' })
  const { action_id } = s.actions.dispatch('sensor-01', 'reboot', {})
  await wait(400)
  assert.equal(s.db.getAction(action_id).status, 'timeout')
  await s.close()
})

test('result 消息走路由更新回执', async () => {
  const s = await startStack({ timeoutMs: 1000 })
  s.db.upsertDevice({ device_id: 'sensor-01', name: 't', type: 'sensor', description: '', proto_ver: 1, caps_json: '{}' })
  const { action_id } = s.actions.dispatch('sensor-01', 'move', { x: 1 })
  s.device.publish('lab/devices/sensor-01/actions/move/result',
    JSON.stringify({ action_id, status: 'error', message: '越界' }))
  await wait(200)
  const a = s.db.getAction(action_id)
  assert.equal(a.status, 'error')
  assert.equal(a.message, '越界')
  await s.close()
})

test('handleResult 忽略非法载荷不抛错', () => {
  const db = createDb(':memory:')
  const actions = createActions({ publish: () => {}, db, timeoutMs: 1000 })
  const { action_id } = actions.dispatch('d1', 'reboot', {})
  handleResult(actions, 'd1', 'reboot', 'null')
  handleResult(actions, 'd1', 'reboot', JSON.stringify({ action_id, status: 'ok', message: { bad: 1 } }))
  const a = db.getAction(action_id)
  assert.equal(a.status, 'ok')
  assert.equal(a.message, '')
})
