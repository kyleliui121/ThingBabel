import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import http from 'node:http'
import { WebSocketServer, createWebSocketStream } from 'ws'
import aedes from 'aedes'
import mqtt from 'mqtt'
import { createDb } from '../src/db.js'
import { createActions } from '../src/actions.js'
import { makeHandlers, route } from '../src/router.js'
import { createReorderBuffer } from '../src/reorder.js'

const wait = (ms) => new Promise(r => setTimeout(r, ms))

// 复刻 scripts/dev.js 的 WS 接法（mqtt 子协议回显 + createWebSocketStream 包装），
// 锁进测试套件：升级 aedes/ws 时若接法失效，这里第一时间红——浏览器/电视是这条路径的唯一用户
test('浏览器路径（MQTT over WebSocket）：discovery/props/status 全链路 + 遗嘱', async () => {
  const broker = aedes()
  const tcp = net.createServer(broker.handle)
  await new Promise(r => tcp.listen(0, r))
  const httpServer = http.createServer()
  const wss = new WebSocketServer({
    server: httpServer,
    handleProtocols: protocols => (protocols.has('mqtt') ? 'mqtt' : false)
  })
  const wsSockets = new Set()
  wss.on('connection', socket => {
    wsSockets.add(socket)
    socket.on('close', () => wsSockets.delete(socket))
    broker.handle(createWebSocketStream(socket))
  })
  await new Promise(r => httpServer.listen(0, r))

  const db = createDb(':memory:')
  const hub = mqtt.connect(`mqtt://127.0.0.1:${tcp.address().port}`)
  const actions = createActions({
    publish: (t, p, o) => hub.publish(t, p, { qos: 1, ...o }),
    db, timeoutMs: 200
  })
  const handlers = makeHandlers({ db, actions })
  const reorder = createReorderBuffer() // 与 src/index.js 相同的入口逻辑（含重排缓冲）
  hub.on('connect', () => hub.subscribe('lab/#'))
  hub.on('message', (t, m) => {
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

  const intro = {
    proto_ver: 1, device_id: 'ws-01', name: 'WS 传感器', type: 'sensor',
    description: '', properties: [{ key: 'temperature', name: '温度', unit: '°C', type: 'number' }],
    actions: [], events: []
  }
  const device = mqtt.connect(`ws://127.0.0.1:${httpServer.address().port}`, {
    clientId: 'ws-sensor',
    will: { topic: 'lab/devices/ws-01/status', payload: 'offline', retain: true, qos: 1 }
  })
  await wait(150)
  device.publish('lab/discovery/ws-01', JSON.stringify(intro), { retain: true, qos: 1 })
  device.publish('lab/devices/ws-01/status', 'online', { retain: true, qos: 1 })
  device.publish('lab/devices/ws-01/props/temperature', '24.6', { retain: true })
  await wait(300)

  const d = db.getDevice('ws-01')
  assert.equal(d?.name, 'WS 传感器')
  assert.equal(d.online, 1)
  assert.equal(db.latestProps('ws-01').find(p => p.key === 'temperature').value, '24.6')

  device.end(true) // 强断 → broker 代发遗嘱 offline
  await wait(400)
  assert.equal(db.getDevice('ws-01').online, 0)

  hub.end(true)
  for (const s of wsSockets) s.terminate() // 残留 WS 连接不掐，httpServer.close 的回调永远不回来
  await new Promise(r => tcp.close(r))
  await new Promise(r => httpServer.close(r))
  wss.close()
  broker.close()
})
