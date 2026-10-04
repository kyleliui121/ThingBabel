import fs from 'node:fs'
import path from 'node:path'

// 库代码不杀进程（评审第五轮）：缺文件/解析失败抛错，由调用方决定处置；
// process.exit 只允许出现在 CLI 入口（用 loadConfigOrExit）
export function loadConfig(file = 'config.json') {
  const p = path.resolve(process.cwd(), file)
  if (!fs.existsSync(p)) {
    throw new Error(`缺少配置文件 ${p}，请复制 config.example.json 为 config.json 后修改`)
  }
  const c = JSON.parse(fs.readFileSync(p, 'utf8'))
  const merged = {
    port: c.port ?? 3000,
    mqttUrl: c.mqttUrl ?? 'mqtt://127.0.0.1:1883',
    dbFile: c.dbFile ?? 'data.db',
    adminPassword: c.adminPassword ?? 'lab123',
    jwtSecret: c.jwtSecret ?? 'dev-secret-change-me',
    retentionDays: c.retentionDays ?? 90, // 遥测/事件保留天数，0 = 不清理
    staleOfflineMinutes: c.staleOfflineMinutes ?? 15, // last_seen 超过该分钟数判离线，0 = 关闭看门狗
    anomalyZ: c.anomalyZ ?? 3.5, // 遥测异常检测 z 阈值，0 = 关闭（事件入 events 表，agent/手机端可消费）
    llm: {
      apiKey: c.llm?.apiKey ?? '', // AI 编排用，空 = agent 不可用
      model: c.llm?.model ?? 'glm-4.7-flash',
      baseUrl: c.llm?.baseUrl ?? 'https://open.bigmodel.cn/api/paas/v4'
    }
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

// CLI 入口专用：加载失败打印并退出；库代码一律用 loadConfig() 并捕获异常
export function loadConfigOrExit(file = 'config.json') {
  try { return loadConfig(file) }
  catch (e) { console.error('[config]', e.message); process.exit(1) }
}
