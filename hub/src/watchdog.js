// 在线状态看门狗（BACKLOG #1）：周期性把 last_seen 超时的"在线"设备判为离线，
// 兜住设备假死无遗嘱（TCP 未断、LWT 不触发）的场景；启动置离线由 index.js 的 setAllOffline 完成
export function startWatchdog({ db, staleMs, intervalMs = 60000 }) {
  if (!staleMs || staleMs <= 0) return { stop: () => {} } // 0 = 关闭

  const run = () => {
    const cutoff = new Date(Date.now() - staleMs).toISOString()
    const n = db.setOnlineWhereStale(cutoff)
    if (n) console.log(`[watchdog] ${n} 台设备 last_seen 超时，标记离线`)
  }
  const timer = setInterval(run, intervalMs)
  timer.unref?.() // 不阻止进程退出
  run() // 启动即查一次
  return { stop: () => clearInterval(timer) }
}
