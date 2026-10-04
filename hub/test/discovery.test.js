import test from 'node:test'
import assert from 'node:assert/strict'
import { startStack, wait } from '../test-support/stack.js'

const intro = {
  proto_ver: 1, device_id: 'sensor-01', name: '实验室温湿度', type: 'sensor',
  description: '门口货架',
  properties: [{ key: 'temperature', name: '温度', unit: '°C', type: 'number' }],
  actions: [{ name: 'reboot', description: '重启', params: [] }],
  events: []
}

test('合法 discovery 自动登记设备', async () => {
  const s = await startStack()
  s.device.publish('lab/discovery/sensor-01', JSON.stringify(intro), { retain: true, qos: 1 })
  await wait(200)
  const d = s.db.getDevice('sensor-01')
  assert.ok(d, '设备应已登记')
  assert.equal(d.name, '实验室温湿度')
  assert.equal(d.type, 'sensor')
  assert.equal(d.online, 1)
  await s.close()
})

test('重复 discovery 覆盖旧介绍', async () => {
  const s = await startStack()
  s.device.publish('lab/discovery/sensor-01', JSON.stringify(intro), { retain: true, qos: 1 })
  await wait(150)
  s.device.publish('lab/discovery/sensor-01', JSON.stringify({ ...intro, name: '新名字' }), { retain: true, qos: 1 })
  await wait(150)
  assert.equal(s.db.getDevice('sensor-01').name, '新名字')
  await s.close()
})

test('非法 discovery 被丢弃不崩溃', async () => {
  const s = await startStack()
  s.device.publish('lab/discovery/bad-01', 'not json', { qos: 1 })
  s.device.publish('lab/discovery/bad-02', JSON.stringify({ proto_ver: 1 }), { qos: 1 }) // 缺字段
  s.device.publish('lab/discovery/bad-03', JSON.stringify({ ...intro, device_id: '别的' }), { qos: 1 }) // 与主题不符
  await wait(200)
  assert.equal(s.db.getDevice('bad-01'), undefined)
  assert.equal(s.db.getDevice('bad-02'), undefined)
  assert.equal(s.db.getDevice('bad-03'), undefined)
  await s.close()
})

test('载荷为 null / [] 的 discovery 被丢弃且 hub 不崩', async () => {
  const s = await startStack()
  // JSON.parse('null') 得到 null， typeof null.x 曾直接抛 TypeError 打挂整个 hub（协议 §4.5）
  s.device.publish('lab/discovery/null-01', 'null', { qos: 1 })
  s.device.publish('lab/discovery/null-02', '[]', { qos: 1 })
  await wait(200)
  assert.equal(s.db.getDevice('null-01'), undefined)
  assert.equal(s.db.getDevice('null-02'), undefined)
  // 栈仍存活：后续合法 discovery 照常登记
  s.device.publish('lab/discovery/sensor-01', JSON.stringify(intro), { retain: true, qos: 1 })
  await wait(200)
  assert.ok(s.db.getDevice('sensor-01'), 'hub 应存活并登记后续合法 discovery')
  await s.close()
})
