// 保留清理：按天数定时删除老遥测/事件并 checkpoint 收编 WAL（优化报告 #2）
export function startPruneJob({ db, retentionDays, intervalMs = 24 * 60 * 60 * 1000 }) {
  if (!retentionDays || retentionDays <= 0) return { stop: () => {} } // 0 = 关闭保留清理

  const run = () => {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
    const r = db.prune(cutoff)
    if (r.telemetry || r.events)
      console.log(`[prune] 清理 ${r.telemetry} 条遥测、${r.events} 条事件（早于 ${retentionDays} 天）`)
  }
  const first = setTimeout(run, 5000) // 启动后避开初始化高峰再跑第一次
  const timer = setInterval(run, intervalMs)
  first.unref(); timer.unref() // 不阻止进程退出（进程由 HTTP/MQTT 服务保活）
  return { stop: () => { clearTimeout(first); clearInterval(timer) } }
}
