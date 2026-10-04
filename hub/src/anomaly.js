// 中枢侧轻量异常检测（第三轮调研 A3 定位：agent 的"主动告警"能力，不是论文主张）。
// 每设备每属性维护 Welford 滚动均值/方差（零训练、可解释），|z| 超阈值产生一条 event，
// 经 bus 推给手机端/SSE，agent 可经事件列表消费。
export function createAnomalyDetector({ zThreshold = 3.5, minSamples = 10, onAnomaly = () => {} } = {}) {
  const state = new Map() // `${deviceId} ${key}` -> { n, mean, m2 }
  const enabled = zThreshold > 0 // 0/负数 = 关闭

  function observe(deviceId, key, value) {
    if (!enabled) return null
    const num = Number(value)
    if (!Number.isFinite(num)) return null // 只看数值属性
    const k = `${deviceId} ${key}`
    const s = state.get(k) || { n: 0, mean: 0, m2: 0 }

    // 先判异常（用旧统计），再更新（Welford）——阈值内的漂移本身就是训练数据
    let z = 0
    if (s.n >= minSamples) {
      const sd = Math.sqrt(s.m2 / (s.n - 1))
      if (sd > 0) z = Math.abs(num - s.mean) / sd
      else if (num !== s.mean) z = 1e6 // 零方差序列出现任何偏离：视为极端异常
    }
    s.n++
    const delta = num - s.mean
    s.mean += delta / s.n
    s.m2 += delta * (num - s.mean)
    state.set(k, s)

    if (z >= zThreshold) {
      const info = { device_id: deviceId, key, value: num, mean: +s.mean.toFixed(3), z: +z.toFixed(2), severity: 'warn', message: `${key} 偏离滚动均值 ${z.toFixed(1)}σ` }
      onAnomaly(info)
      return info
    }
    return null
  }

  return { observe, size: () => state.size }
}
