import test from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '../src/db.js'
import { startWatchdog } from '../src/watchdog.js'

const wait = (ms) => new Promise(r => setTimeout(r, ms))
const dev = (id) => ({ device_id: id, name: id, type: 'sensor', description: '', proto_ver: 1, caps_json: '{}' })

test('setAllOffline 把所有设备置离线（启动后靠 retain 重放纠正）', () => {
  const db = createDb(':memory:')
  db.upsertDevice(dev('a'))
  db.upsertDevice(dev('b'))
  assert.equal(db.setAllOffline(), 2)
  assert.equal(db.getDevice('a').online, 0)
  assert.equal(db.getDevice('b').online, 0)
})

test('看门狗：last_seen 过期的在线设备被置离线，新鲜设备保留', async () => {
  const db = createDb(':memory:')
  db.upsertDevice(dev('old'))
  db.upsertDevice(dev('fresh'))
  db.touch('old', new Date(Date.now() - 3600_000).toISOString()) // 1 小时没消息
  const job = startWatchdog({ db, staleMs: 15 * 60_000, intervalMs: 50 })
  await wait(100)
  assert.equal(db.getDevice('old').online, 0)
  assert.equal(db.getDevice('fresh').online, 1)
  job.stop()
})

test('staleMs=0 时看门狗关闭，不动数据', async () => {
  const db = createDb(':memory:')
  db.upsertDevice(dev('x'))
  db.touch('x', new Date(Date.now() - 7200_000).toISOString())
  const job = startWatchdog({ db, staleMs: 0, intervalMs: 50 })
  await wait(100)
  assert.equal(db.getDevice('x').online, 1)
  job.stop()
})
