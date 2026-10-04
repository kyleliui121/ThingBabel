// 事件：原文入库（协议 §6），未知设备忽略
export function handleEvent(db, bus, deviceId, name, payload) {
  if (!db.getDevice(deviceId)) return
  db.insertEvent(deviceId, name, payload, new Date().toISOString())
  db.touch(deviceId)
  bus?.emit('push', { type: 'event', device_id: deviceId, name, payload })
}
