export function handleStatus(db, deviceId, payload) {
  db.setOnline(deviceId, payload.trim() === 'online')
}
