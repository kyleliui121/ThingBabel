// 长稳自测（soak）：内存 broker + hub 全链路（含重排缓冲/看门狗）+ N 台虚拟传感器
// 用法：npm run soak            （默认 10 分钟、5 台设备）
//       SOAK_MINUTES=0.05 npm run soak   （快速冒烟）
// 运行到 60% 时长时杀掉一台设备，验证 LWT 遗嘱与看门狗真实生效；结束打印汇总 JSON。
// 数据落盘 soak.db（结束后保留供检查，可手动删除）
import net from 'node:net'
import aedes from 'aedes'
import mqtt from 'mqtt'
import { createDb } from '../src/db.js'
import { createActions } from '../src/actions.js'
import { makeHandlers, route } from '../src/router.js'
import { createReorderBuffer } from '../src/reorder.js'
import { startWatchdog } from '../src/watchdog.js'

const MINS = Number(process.env.SOAK_MINUTES || 10)
const DEVICES = Number(process.env.SOAK_DEVICES || 5)
const INTERVAL = 5000
const t0 = Date.now()

const broker = aedes()
const server = net.createServer(broker.handle)
await new Promise(r => server.listen(0, r))
const port = server.address().port

const db = createDb('soak.db')
const hub = mqtt.connect(`mqtt://127.0.0.1:${port}`)
const actions = createActions({
  publish: (t, p, o) => hub.publish(t, p, { qos: 1, ...o }),
  db, timeoutMs: 5000
})
const handlers = makeHandlers({ db, actions })
const reorder = createReorderBuffer()
const watchdog = startWatchdog({ db, staleMs: 20000, intervalMs: 10000 })

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

const devices = []
for (let i = 1; i <= DEVICES; i++) {
  const id = `soak-sensor-${String(i).padStart(2, '0')}`
  const c = mqtt.connect(`mqtt://127.0.0.1:${port}`, {
    clientId: id,
    will: { topic: `lab/devices/${id}/status`, payload: 'offline', retain: true, qos: 1 }
  })
  const intro = {
    proto_ver: 1, device_id: id, name: `长稳传感器 ${i}`, type: 'sensor',
    description: 'soak 虚拟设备', properties: [
      { key: 'temperature', name: '温度', unit: '°C', type: 'number' },
      { key: 'humidity', name: '湿度', unit: '%', type: 'number' }
    ], actions: [], events: []
  }
  let temp = 20 + Math.random() * 10, hum = 40 + Math.random() * 20, timer = null
  c.on('connect', () => {
    c.publish(`lab/discovery/${id}`, JSON.stringify(intro), { retain: true, qos: 1 })
    c.publish(`lab/devices/${id}/status`, 'online', { retain: true, qos: 1 })
    if (!timer) timer = setInterval(() => {
      temp = Math.max(-40, Math.min(85, temp + (Math.random() - 0.5) * 0.4))
      hum = Math.max(0, Math.min(100, hum + (Math.random() - 0.5)))
      c.publish(`lab/devices/${id}/props/temperature`, temp.toFixed(1), { retain: true })
      c.publish(`lab/devices/${id}/props/humidity`, Math.round(hum).toString(), { retain: true })
    }, INTERVAL)
  })
  devices.push({ id, c })
}

const stat = () => {
  const online = db.listDevices().filter(d => d.online).length
  const rss = (process.memoryUsage().rss / 1024 / 1024).toFixed(1)
  console.log(`[stat] t=${((Date.now() - t0) / 1000).toFixed(0)}s 设备=${db.listDevices().length}(在线${online}) 遥测=${db.countTelemetry()} RSS=${rss}MB`)
}
const statTimer = setInterval(stat, 30000)
stat()

const killAt = MINS * 60000 * 0.6
setTimeout(() => {
  const victim = devices[0]
  console.log(`[soak] 杀掉 ${victim.id}（验证 LWT 遗嘱 → 看门狗不复活）`)
  victim.c.end(true)
}, killAt)

setTimeout(async () => {
  clearInterval(statTimer)
  watchdog.stop()
  for (const d of devices) d.c.end(true)
  hub.end(true)
  await new Promise(r => server.close(r))
  broker.close()
  const online = db.listDevices().filter(d => d.online).length
  console.log('[soak] 汇总', JSON.stringify({
    运行分钟: MINS, 设备数: devices.length, 结束时在线: online,
    遥测总行数: db.countTelemetry(), RSS_MB: (process.memoryUsage().rss / 1024 / 1024).toFixed(1),
    备注: '结束时在线应 = 设备数-1（被杀那台不再上报）'
  }))
  process.exit(0)
}, MINS * 60000)
