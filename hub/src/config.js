import fs from 'node:fs'
import path from 'node:path'

export function loadConfig(file = 'config.json') {
  const p = path.resolve(process.cwd(), file)
  if (!fs.existsSync(p)) {
    console.error(`缺少配置文件 ${p}，请复制 config.example.json 为 config.json 后修改`)
    process.exit(1)
  }
  const c = JSON.parse(fs.readFileSync(p, 'utf8'))
  const merged = {
    port: c.port ?? 3000,
    mqttUrl: c.mqttUrl ?? 'mqtt://127.0.0.1:1883',
    dbFile: c.dbFile ?? 'data.db',
    adminPassword: c.adminPassword ?? 'lab123',
    jwtSecret: c.jwtSecret ?? 'dev-secret-change-me',
    retentionDays: c.retentionDays ?? 90, // 遥测/事件保留天数，0 = 不清理
    staleOfflineMinutes: c.staleOfflineMinutes ?? 15 // last_seen 超过该分钟数判离线，0 = 关闭看门狗
  }
  for (const w of configWarnings(merged)) console.warn(`[config] ${w}`)
  return merged
}

// 默认值告警（BACKLOG #3）：纯函数便于测试
export function configWarnings(c) {
  const w = []
  if (c.adminPassword === 'lab123') w.push('adminPassword 使用默认值 lab123，局域网内任何人可登录')
  if (c.jwtSecret === 'dev-secret-change-me') w.push('jwtSecret 使用默认值，token 可被伪造')
  return w
}
