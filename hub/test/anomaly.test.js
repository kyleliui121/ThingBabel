import test from 'node:test'
import assert from 'node:assert/strict'
import { createAnomalyDetector } from '../src/anomaly.js'

test('Welford：稳态漂移不报警，尖峰超过 z 阈值报警', () => {
  const hits = []
  const d = createAnomalyDetector({ zThreshold: 3, minSamples: 10, onAnomaly: i => hits.push(i) })
  for (let i = 0; i < 30; i++) d.observe('s1', 'temperature', 23 + Math.random() * 0.2) // 稳态 ~23
  assert.equal(hits.length, 0)
  d.observe('s1', 'temperature', 35) // 尖峰
  assert.equal(hits.length, 1)
  assert.equal(hits[0].device_id, 's1')
  assert.equal(hits[0].key, 'temperature')
  assert.ok(hits[0].z >= 3)
  assert.ok(hits[0].message.includes('σ'))
  d.observe('s1', 'temperature', 23.1) // 回落后不再报
  assert.equal(hits.length, 1)
})

test('minSamples 未到不判异常；非数值与非有限值忽略；0 阈值关闭', () => {
  const hits = []
  const d = createAnomalyDetector({ zThreshold: 1, minSamples: 5, onAnomaly: i => hits.push(i) })
  for (let i = 0; i < 4; i++) d.observe('s', 't', 100) // 只有 4 个样本
  d.observe('s', 't', 1)
  assert.equal(hits.length, 0, '样本不足不判')
  d.observe('s', 't', 'not-a-number')
  d.observe('s', 't', NaN)
  assert.equal(hits.length, 0)

  const off = createAnomalyDetector({ zThreshold: 0, minSamples: 1, onAnomaly: i => hits.push(i) })
  off.observe('x', 't', 999)
  assert.equal(hits.length, 0, 'zThreshold=0 关闭')
})

test('per-device/key 独立统计', () => {
  const d = createAnomalyDetector({ zThreshold: 3, minSamples: 10 })
  for (let i = 0; i < 20; i++) { d.observe('a', 't', 20); d.observe('b', 't', 50) }
  assert.equal(d.size(), 2)
  const hit = d.observe('a', 't', 60) // a 的统计里 60 是尖峰；与 b 无关
  assert.ok(hit && hit.z >= 3)
  const noHit = d.observe('b', 't', 50)
  assert.equal(noHit, null)
})
