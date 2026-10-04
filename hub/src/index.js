import mqtt from 'mqtt'
import { EventEmitter } from 'node:events'
import { loadConfig } from './config.js'
import { createDb } from './db.js'
import { createActions } from './actions.js'
import { makeHandlers, route } from './router.js'
import { createApi } from './api.js'
import { startPruneJob } from './prune.js'
import { startWatchdog } from './watchdog.js'
import { createReorderBuffer } from './reorder.js'
import { createAnomalyDetector } from './anomaly.js'

const config = loadConfig()
const db = createDb(config.dbFile)
db.failPendingActions() // 重启时清空悬挂指令（设计稿 §7）
db.setAllOffline() // 启动一律视为离线，retain 重放（status/props）纠正真实在线者——消除重放顺序依赖（BACKLOG #1）

const client = mqtt.connect(config.mqttUrl)
const actions = createActions({
  publish: (t, p, opts) => client.publish(t, p, { qos: 1, ...opts }),
  db, timeoutMs: 5000
})
const bus = new EventEmitter() // 设备消息 → SSE 推送（/api/stream）
const handlers = makeHandlers({ db, actions, bus })
const reorder = createReorderBuffer() // QoS0 抢在 discovery 前到达的消息暂存（见 reorder.js）
const anomaly = createAnomalyDetector({ // 数值遥测偏离滚动均值 → event（agent/手机端可消费）
  zThreshold: config.anomalyZ,
  onAnomaly: info => {
    db.insertEvent(info.device_id, 'anomaly', JSON.stringify(info), new Date().toISOString())
    bus.emit('push', { type: 'event', device_id: info.device_id, name: 'anomaly', payload: JSON.stringify(info) })
    console.warn(`[anomaly] ${info.device_id}.${info.key}=${info.value} (${info.message})`)
  }
})

client.on('connect', () => {
  client.subscribe('lab/#') // 简报漏写实际订阅，仅凭日志无法收消息；补上（与 test/helpers.js 一致）
  console.log(`[mqtt] 已连接 ${config.mqttUrl}，订阅 lab/#`)
})
client.on('message', (t, m) => {
  // 单条消息处理故障只丢弃该条，不拖垮整个 hub（协议 §4.5）
  const parts = t.split('/')
  const payload = m.toString()
  const safe = () => { try { route(parts, payload, handlers) } catch (e) { console.error('[route]', t, e.message) } }

  if (parts[0] !== 'lab') return
  if (parts[1] === 'discovery' && parts.length === 3) {
    safe()
    if (db.getDevice(parts[2])) reorder.flush(parts[2]) // 登记成功 → 补处理此前被暂存的消息
    return
  }
  if (parts[1] === 'devices' && parts.length >= 4 && !db.getDevice(parts[2])) {
    return reorder.stash(parts[2], safe) // 未知设备：等 discovery，TTL 内没等到就丢弃
  }
  if (parts[1] === 'devices' && parts.length === 5 && parts[3] === 'props') {
    anomaly.observe(parts[2], parts[4], payload) // 已登记设备的数值遥测进入异常检测
  }
  safe()
})

const app = createApi({ db, actions, config, bus })
app.listen(config.port, () => console.log(`[api]  http://<本机IP>:${config.port}`))

startPruneJob({ db, retentionDays: config.retentionDays }) // 遥测/事件按保留天数清理（优化报告 #2）
startWatchdog({ db, staleMs: config.staleOfflineMinutes * 60_000 }) // last_seen 超时判离线（BACKLOG #1）
