import mqtt from 'mqtt'
import { EventEmitter } from 'node:events'
import { loadConfig } from './config.js'
import { createDb } from './db.js'
import { createActions } from './actions.js'
import { makeHandlers, route } from './router.js'
import { createApi } from './api.js'
import { startPruneJob } from './prune.js'
import { startWatchdog } from './watchdog.js'

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

client.on('connect', () => {
  client.subscribe('lab/#') // 简报漏写实际订阅，仅凭日志无法收消息；补上（与 test/helpers.js 一致）
  console.log(`[mqtt] 已连接 ${config.mqttUrl}，订阅 lab/#`)
})
client.on('message', (t, m) => {
  // 单条消息处理故障只丢弃该条，不拖垮整个 hub（协议 §4.5）
  try { route(t.split('/'), m.toString(), handlers) }
  catch (e) { console.error('[route]', t, e.message) }
})

const app = createApi({ db, actions, config, bus })
app.listen(config.port, () => console.log(`[api]  http://<本机IP>:${config.port}`))

startPruneJob({ db, retentionDays: config.retentionDays }) // 遥测/事件按保留天数清理（优化报告 #2）
startWatchdog({ db, staleMs: config.staleOfflineMinutes * 60_000 }) // last_seen 超时判离线（BACKLOG #1）
