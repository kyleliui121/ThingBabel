export function handleStatus(db, bus, deviceId, payload) {
  if (!db.getDevice(deviceId)) return
  const online = payload.trim() === 'online'
  db.setOnline(deviceId, online)
  bus?.emit('push', { type: 'status', device_id: deviceId, online })
}
