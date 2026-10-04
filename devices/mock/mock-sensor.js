import mqtt from 'mqtt'

const URL = process.env.MQTT_URL || 'mqtt://127.0.0.1:1883'
const ID = process.env.DEVICE_ID || 'sensor-01'
// 协议 0.2 仿真（docs/protocol-0.2-deadband-draft.md）：设置 DEADBAND 后差值上报 + 心跳兜底。
// DEADBAND=数值（温度阈值，默认 0.5）；心跳间隔 HEARTBEAT_S（默认 60，须 ≪ 中枢 staleOfflineMinutes）
const DEADBAND = process.env.DEADBAND ? Number(process.env.DEADBAND) : null
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_S || 60) * 1000

const intro = {
  proto_ver: 1,
  device_id: ID,
  name: '实验室温湿度（模拟）',
  type: 'sensor',
  description: 'mock 设备：随机游走的温湿度',
  properties: [
    { key: 'temperature', name: '温度', unit: '°C', type: 'number' },
    { key: 'humidity', name: '湿度', unit: '%', type: 'number' }
  ],
  actions: [{ name: 'reboot', description: '重启设备', params: [] }],
  events: []
}

const client = mqtt.connect(URL, {
  clientId: ID,
  will: { topic: `lab/devices/${ID}/status`, payload: 'offline', retain: true, qos: 1 } // 协议 §7 遗嘱
})

let temp = 23.0, hum = 45.0
let telemetryTimer = null // mqtt.js 每次重连都会重发 connect，定时器只建一次防叠加
let lastTemp = null, lastHum = null, lastPubAt = 0 // deadband 状态：上次已发布值与时间

client.on('connect', () => {
  client.publish(`lab/discovery/${ID}`, JSON.stringify(intro), { retain: true, qos: 1 })
  client.publish(`lab/devices/${ID}/status`, 'online', { retain: true, qos: 1 })
  client.subscribe(`lab/devices/${ID}/actions/+`)
  if (!telemetryTimer) telemetryTimer = setInterval(publishTelemetry, 5000)
})

const shouldPublish = (last, now) =>
  DEADBAND == null || last == null ||                     // 未启用 / 首拍必发
  Math.abs(now - last) > DEADBAND ||                      // 差值超阈值才发
  Date.now() - lastPubAt >= HEARTBEAT_MS                  // 心跳兜底

function publishTelemetry() {
  temp = Math.max(-40, Math.min(85, temp + (Math.random() - 0.5) * 0.4)) // 钳位：长跑不漂出物理范围
  hum = Math.max(0, Math.min(100, hum + (Math.random() - 0.5)))
  const tChanged = shouldPublish(lastTemp, temp)
  const hChanged = shouldPublish(lastHum, hum)
  if (!tChanged && !hChanged) return // 稳态静默，等心跳（协议 0.2）
  if (tChanged) { client.publish(`lab/devices/${ID}/props/temperature`, temp.toFixed(1), { retain: true }); lastTemp = temp }   // 协议 §4
  if (hChanged) { client.publish(`lab/devices/${ID}/props/humidity`, Math.round(hum).toString(), { retain: true }); lastHum = hum }
  lastPubAt = Date.now()
}

client.on('message', (topic, msg) => {
  const m = topic.match(/^lab\/devices\/[^/]+\/actions\/([^/]+)$/)
  if (!m) return
  let req = {}
  try { req = JSON.parse(msg.toString()) } catch {}
  const reply = (status, message = '') =>
    client.publish(`${topic}/result`, JSON.stringify({ action_id: req.action_id, status, message }), { qos: 1 })
  if (m[1] === 'reboot') {
    reply('ok')
    setTimeout(() => client.publish(`lab/discovery/${ID}`, JSON.stringify(intro), { retain: true, qos: 1 }), 2000)
  } else {
    reply('rejected', `未知指令 ${m[1]}`)
  }
})

client.on('error', e => console.error('[mock]', e.message))
