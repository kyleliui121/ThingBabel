import test from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '../src/db.js'

const intro = {
  proto_ver: 1, device_id: 'sensor-01', name: '实验室温湿度', type: 'sensor',
  description: '', properties: [], actions: [], events: []
}

test('discovery upsert 设备并可查询', () => {
  const db = createDb(':memory:')
  db.upsertDevice({ ...intro, caps_json: JSON.stringify(intro) })
  db.upsertDevice({ ...intro, name: '改名了', caps_json: JSON.stringify(intro) })
  const d = db.getDevice('sensor-01')
  assert.equal(d.name, '改名了')
  assert.equal(d.online, 1)
  assert.equal(db.listDevices().length, 1)
})

test('遥测入库与最新值/历史查询', () => {
  const db = createDb(':memory:')
  db.insertTelemetry('sensor-01', 'temperature', '23.5', '2026-10-04T10:00:00Z')
  db.insertTelemetry('sensor-01', 'temperature', '24.0', '2026-10-04T10:00:05Z')
  db.insertTelemetry('sensor-01', 'humidity', '45', '2026-10-04T10:00:05Z')
  const latest = db.latestProps('sensor-01')
  assert.equal(latest.find(p => p.key === 'temperature').value, '24.0')
  const hist = db.propHistory('sensor-01', 'temperature', 10)
  assert.equal(hist.length, 2)
  assert.equal(hist[0].value, '24.0')
})

test('指令日志状态机：pending→ok，迟到回执不覆盖 timeout', () => {
  const db = createDb(':memory:')
  db.createAction({ action_id: 'a1', device_id: 'sensor-01', action_name: 'reboot', params_json: '{}' })
  db.updateAction('a1', { status: 'ok', message: '' })
  assert.equal(db.getAction('a1').status, 'ok')
  db.createAction({ action_id: 'a2', device_id: 'sensor-01', action_name: 'reboot', params_json: '{}' })
  db.updateAction('a2', { status: 'timeout', message: 'x' })
  db.updateAction('a2', { status: 'ok', message: '' })
  assert.equal(db.getAction('a2').status, 'timeout')
})

test('启动时把 pending 指令清为 timeout', () => {
  const db = createDb(':memory:')
  db.createAction({ action_id: 'a3', device_id: 'sensor-01', action_name: 'reboot', params_json: '{}' })
  db.failPendingActions()
  assert.equal(db.getAction('a3').status, 'timeout')
})
