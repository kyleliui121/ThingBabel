import fs from 'node:fs'
import path from 'node:path'

export function loadConfig(file = 'config.json') {
  const p = path.resolve(process.cwd(), file)
  if (!fs.existsSync(p)) {
    console.error(`缺少配置文件 ${p}，请复制 config.example.json 为 config.json 后修改`)
    process.exit(1)
  }
  const c = JSON.parse(fs.readFileSync(p, 'utf8'))
  return {
    port: c.port ?? 3000,
    mqttUrl: c.mqttUrl ?? 'mqtt://127.0.0.1:1883',
    dbFile: c.dbFile ?? 'data.db',
    adminPassword: c.adminPassword ?? 'lab123',
    jwtSecret: c.jwtSecret ?? 'dev-secret-change-me',
    retentionDays: c.retentionDays ?? 90 // 遥测/事件保留天数，0 = 不清理
  }
}
