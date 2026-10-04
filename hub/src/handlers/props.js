// 遥测：JSON 标量原样入库（协议 §4），未知设备忽略
export function handleProps(db, deviceId, key, payload) {
  if (!db.getDevice(deviceId)) return
  db.insertTelemetry(deviceId, key, payload, new Date().toISOString())
  db.touch(deviceId)
}
