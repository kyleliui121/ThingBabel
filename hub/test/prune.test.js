import test from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '../src/db.js'
import { startPruneJob } from '../src/prune.js'

const wait = (ms) => new Promise(r => setTimeout(r, ms))

test('定时清理任务删除过期数据，保留新数据', async () => {
  const db = createDb(':memory:')
  db.insertTelemetry('d', 't', 'old', '2026-01-01T00:00:00Z')
  db.insertTelemetry('d', 't', 'new', new Date().toISOString())
  const job = startPruneJob({ db, retentionDays: 30, intervalMs: 50 })
  await wait(300)
  const hist = db.propHistory('d', 't', 10)
  assert.equal(hist.length, 1)
  assert.equal(hist[0].value, 'new')
  job.stop()
})

test('retentionDays=0 时任务关闭，不动数据', async () => {
  const db = createDb(':memory:')
  db.insertTelemetry('d', 't', 'old', '2026-01-01T00:00:00Z')
  const job = startPruneJob({ db, retentionDays: 0, intervalMs: 50 })
  await wait(150)
  assert.equal(db.propHistory('d', 't', 10).length, 1)
  job.stop()
})
