import test from 'node:test'
import assert from 'node:assert/strict'
import { startStack, wait } from '../test-support/stack.js'

// props/status 对未登记设备直接忽略，因此测试先发一条合法 discovery
const intro = {
  proto_ver: 1, device_id: 'sensor-01', name: '实验室温湿度', type: 'sensor',
  description: '门口货架',
  properties: [{ key: 'temperature', name: '温度', unit: '°C', type: 'number' }],
  actions: [{ name: 'reboot', description: '重启', params: [] }],
  events: []
}

test('props 遥测入库且刷新 last_seen', async () => {
  const s = await startStack()
  s.device.publish('lab/discovery/sensor-01', JSON.stringify(intro), { retain: true, qos: 1 })
  await wait(150)
  s.device.publish('lab/devices/sensor-01/props/temperature', '23.5', { retain: true })
  s.device.publish('lab/devices/sensor-01/props/humidity', '45', { retain: true })
  s.device.publish('lab/devices/sensor-01/props/door', '"open"', { retain: true })
  await wait(200)
  const latest = s.db.latestProps('sensor-01')
  assert.equal(latest.find(p => p.key === 'temperature').value, '23.5')
  assert.equal(latest.find(p => p.key === 'door').value, '"open"')
  await s.close()
})

test('status 遗嘱下线', async () => {
  const s = await startStack()
  s.device.publish('lab/discovery/sensor-01', JSON.stringify(intro), { retain: true, qos: 1 })
  await wait(150)
  s.device.publish('lab/devices/sensor-01/status', 'online', { retain: true })
  await wait(100)
  s.device.publish('lab/devices/sensor-01/status', 'offline', { retain: true })
  await wait(150)
  assert.equal(s.db.getDevice('sensor-01').online, 0)
  await s.close()
})
