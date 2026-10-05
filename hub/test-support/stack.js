import net from 'node:net'
import aedes from 'aedes'
import mqtt from 'mqtt'
import { createDb } from '../src/db.js'
import { createActions } from '../src/actions.js'
import { makeHandlers, route } from '../src/router.js'
import { createReorderBuffer } from '../src/reorder.js'

export const wait = (ms) => new Promise(r => setTimeout(r, ms))

// 条件等待：轮询直到 fn() 返回真值（CI 慢机器上固定 sleep 会踩空——评审第五轮 CI 实测）
export async function waitFor(fn, { timeoutMs = 5000, intervalMs = 50, label = 'condition' } = {}) {
  const t0 = Date.now()
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() - t0 > timeoutMs) throw new Error(`waitFor 超时: ${label}`)
    await wait(intervalMs)
  }
}

export async function startStack({ timeoutMs = 200 } = {}) {
  const broker = aedes()
  const server = net.createServer(broker.handle)
  await new Promise(r => server.listen(0, r))
  const port = server.address().port

  const db = createDb(':memory:')
  const hubClient = mqtt.connect(`mqtt://127.0.0.1:${port}`)
  const publish = (t, p, opts = {}) => hubClient.publish(t, p, { qos: 1, ...opts })
  const actions = createActions({ publish, db, timeoutMs })
  const handlers = makeHandlers({ db, actions })
  const reorder = createReorderBuffer() // 与 src/index.js 相同的入口逻辑（含重排缓冲）

  hubClient.on('connect', () => hubClient.subscribe('lab/#'))
  hubClient.on('message', (t, m) => {
    const parts = t.split('/')
    const payload = m.toString()
    const safe = () => { try { route(parts, payload, handlers) } catch (e) { console.error('[route]', t, e.message) } }

    if (parts[0] !== 'lab') return
    if (parts[1] === 'discovery' && parts.length === 3) {
      safe()
      if (db.getDevice(parts[2])) reorder.flush(parts[2])
      return
    }
    if (parts[1] === 'devices' && parts.length >= 4 && !db.getDevice(parts[2])) return reorder.stash(parts[2], safe)
    safe()
  })

  const device = mqtt.connect(`mqtt://127.0.0.1:${port}`, { clientId: 'test-device' })
  await wait(150)

  return {
    port, db, actions, device, publish,
    close: async () => {
      device.end(true); hubClient.end(true)
      await new Promise(r => server.close(r)); broker.close()
    }
  }
}
