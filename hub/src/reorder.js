// 重排缓冲：QoS 0 遥测可能抢在 QoS 1 discovery 完成握手前到达（retain 重放时
// lab/devices/* 主题也排在 lab/discovery 之前），"未知设备忽略"规则会把这批消息误吞。
// 未知设备的消息先暂存，discovery 登记成功后 flush 补处理；TTL 后丢弃防泄漏。
export function createReorderBuffer(ttlMs = 5000) {
  const pending = new Map() // device_id -> [task]

  return {
    stash(deviceId, task) {
      const q = pending.get(deviceId) || []
      q.push(task)
      pending.set(deviceId, q)
      setTimeout(() => {
        const cur = (pending.get(deviceId) || []).filter(t => t !== task)
        if (cur.length) pending.set(deviceId, cur); else pending.delete(deviceId)
      }, ttlMs).unref?.()
    },
    flush(deviceId) {
      const q = pending.get(deviceId)
      if (!q) return 0
      pending.delete(deviceId)
      for (const t of q) t()
      return q.length
    },
    size() { return pending.size }
  }
}
