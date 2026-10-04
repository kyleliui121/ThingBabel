import Database from 'better-sqlite3'

const now = () => new Date().toISOString()

export function createDb(file = ':memory:') {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL, type TEXT NOT NULL, description TEXT DEFAULT '',
      proto_ver INTEGER NOT NULL, caps_json TEXT NOT NULL,
      online INTEGER NOT NULL DEFAULT 1,
      last_seen TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS telemetry(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, ts TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_telemetry ON telemetry(device_id, key, id);
    CREATE TABLE IF NOT EXISTS actions_log(
      action_id TEXT PRIMARY KEY, device_id TEXT NOT NULL, action_name TEXT NOT NULL,
      params_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'pending',
      message TEXT DEFAULT '', created_at TEXT, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS events(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL, name TEXT NOT NULL, payload_json TEXT NOT NULL, ts TEXT NOT NULL);
  `)

  return {
    upsertDevice(d) {
      db.prepare(`INSERT INTO devices(device_id,name,type,description,proto_ver,caps_json,online,last_seen,created_at,updated_at)
        VALUES(@device_id,@name,@type,@description,@proto_ver,@caps_json,1,@ts,@ts,@ts)
        ON CONFLICT(device_id) DO UPDATE SET
          name=@name, type=@type, description=@description, proto_ver=@proto_ver,
          caps_json=@caps_json, online=1, last_seen=@ts, updated_at=@ts`)
        .run({ ...d, ts: now() })
    },
    setOnline(deviceId, online) {
      db.prepare('UPDATE devices SET online=?, last_seen=?, updated_at=? WHERE device_id=?')
        .run(online ? 1 : 0, now(), now(), deviceId)
    },
    touch(deviceId) {
      db.prepare('UPDATE devices SET last_seen=? WHERE device_id=?').run(now(), deviceId)
    },
    getDevice(id) {
      return db.prepare('SELECT * FROM devices WHERE device_id=?').get(id)
    },
    listDevices() {
      return db.prepare('SELECT * FROM devices ORDER BY device_id').all()
    },
    insertTelemetry(deviceId, key, value, ts) {
      db.prepare('INSERT INTO telemetry(device_id,key,value,ts) VALUES(?,?,?,?)')
        .run(deviceId, key, String(value), ts)
    },
    latestProps(deviceId) {
      return db.prepare(`SELECT key, value, ts FROM telemetry
        WHERE device_id=? AND id IN (SELECT MAX(id) FROM telemetry WHERE device_id=? GROUP BY key)`)
        .all(deviceId, deviceId)
    },
    propHistory(deviceId, key, limit = 100) {
      return db.prepare('SELECT value, ts FROM telemetry WHERE device_id=? AND key=? ORDER BY id DESC LIMIT ?')
        .all(deviceId, key, limit)
    },
    createAction(a) {
      db.prepare(`INSERT INTO actions_log(action_id,device_id,action_name,params_json,status,created_at,updated_at)
        VALUES(@action_id,@device_id,@action_name,@params_json,'pending',@ts,@ts)`)
        .run({ ...a, ts: now() })
    },
    updateAction(actionId, { status, message = '' }) {
      db.prepare(`UPDATE actions_log SET status=?, message=?, updated_at=?
        WHERE action_id=? AND status='pending'`).run(status, message, now(), actionId)
    },
    getAction(actionId) {
      return db.prepare('SELECT * FROM actions_log WHERE action_id=?').get(actionId)
    },
    failPendingActions() {
      db.prepare(`UPDATE actions_log SET status='timeout', message='中枢重启，指令作废', updated_at=?
        WHERE status='pending'`).run(now())
    },
    insertEvent(deviceId, name, payloadJson, ts) {
      db.prepare('INSERT INTO events(device_id,name,payload_json,ts) VALUES(?,?,?,?)')
        .run(deviceId, name, payloadJson, ts)
    }
  }
}
