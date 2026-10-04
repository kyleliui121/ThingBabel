// 遥测：JSON 标量原样入库（协议 §4），未知设备忽略
export function handleProps(db, bus, deviceId, key, payload) {
  if (!db.getDevice(deviceId)) return
  const ts = new Date().toISOString()
  db.insertTelemetry(deviceId, key, payload, ts)
  db.touch(deviceId)
  bus?.emit('push', { type: 'props', device_id: deviceId, key, value: payload, ts })
}
