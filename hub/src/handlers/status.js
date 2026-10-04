export function handleStatus(db, deviceId, payload) {
  if (!db.getDevice(deviceId)) return
  db.setOnline(deviceId, payload.trim() === 'online')
}
