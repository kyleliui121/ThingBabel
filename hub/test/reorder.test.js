import test from 'node:test'
import assert from 'node:assert/strict'
import { startStack, waitFor } from '../test-support/stack.js'

const wait = (ms) => new Promise(r => setTimeout(r, ms)) // TTL 过期测试必须真实等待 5 秒

// 复现真实时序：QoS 0 遥测先于 QoS 1 discovery 到达（新设备上电三连发 / retain 重放均会出现），
// 重排缓冲应把先到的未知设备消息暂存，登记成功后补处理
test('乱序到达：props 先于 discovery，重排缓冲补处理不丢数据', async () => {
  const s = await startStack()
  // 故意倒序：先发遥测（设备不存在）再发自介绍
  s.device.publish('lab/devices/late-01/props/temperature', '21.5', { retain: true }) // QoS 0 抢跑
  s.device.publish('lab/discovery/late-01', JSON.stringify({
    proto_ver: 1, device_id: 'late-01', name: '乱序设备', type: 'sensor',
    description: '', properties: [{ key: 'temperature', name: '温度', unit: '°C', type: 'number' }],
    actions: [], events: []
  }), { retain: true, qos: 1 })
  try {
  await waitFor(() => s.db.getDevice('late-01'), { label: '乱序设备登记' })
  assert.ok(s.db.getDevice('late-01'), '设备应已登记')
  const p = s.db.latestProps('late-01').find(x => x.key === 'temperature')
  assert.equal(p?.value, '21.5', '抢跑的遥测应被重排缓冲补入库')
  } finally { await s.close() }
})

test('TTL 内等不到 discovery 的消息最终被丢弃，不堆积', async () => {
  const s = await startStack()
  try {
    s.device.publish('lab/devices/ghost-01/props/temperature', '99', { retain: false }) // 幽灵设备
    await wait(300)
    assert.ok(!s.db.getDevice('ghost-01'))
    await wait(5500) // 超过默认 TTL 5s
    assert.ok(!s.db.getDevice('ghost-01'), '仍不应登记')
  } finally { await s.close() }
})
