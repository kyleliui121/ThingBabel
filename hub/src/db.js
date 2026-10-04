import Database from 'better-sqlite3'

const now = () => new Date().toISOString()

export function createDb(file = ':memory:') {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL') // WAL 下官方推荐档：省掉每次提交的 fsync，断电最多丢最后一批提交、库不损坏
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
    CREATE TABLE IF NOT EXISTS traces(
      trace_id TEXT NOT NULL, span_id TEXT NOT NULL, parent_span_id TEXT,
      name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'INTERNAL',
      start_ms INTEGER NOT NULL, end_ms INTEGER, attributes_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'unset', status_message TEXT DEFAULT '');
    CREATE INDEX IF NOT EXISTS idx_traces ON traces(trace_id, start_ms);
  `)

  const insertTeleStmt = db.prepare('INSERT INTO telemetry(device_id,key,value,ts) VALUES(?,?,?,?)')
  // 同一轮事件循环内到达的遥测合并为一个事务落盘（突发即批量，优化报告 #1）；
  // 读路径先冲刷，保证 API/测试永远读不到滞留的内存数据
  let pendingTele = []
  const flushTele = () => {
    if (!pendingTele.length) return
    const rows = pendingTele
    pendingTele = []
    db.transaction(rows => {
      for (const r of rows) insertTeleStmt.run(r.deviceId, r.key, r.value, r.ts)
    })(rows)
  }

  function getRootAttr(db, traceId, key) {
    // root = trace 里唯一的 parent_span_id IS NULL 的 span（前提：所有子 span 正确挂树，见 agent/index.js）
    const row = db.prepare('SELECT attributes_json FROM traces WHERE trace_id = ? AND parent_span_id IS NULL LIMIT 1').get(traceId)
    if (!row) return null
    try { return JSON.parse(row.attributes_json)[key] ?? null } catch { return null }
  }

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
    setAllOffline() {
      return db.prepare('UPDATE devices SET online=0, updated_at=?').run(now()).changes
    },
    setOnlineWhereStale(cutoffIso) {
      return db.prepare(`UPDATE devices SET online=0, updated_at=?
        WHERE online=1 AND (last_seen IS NULL OR last_seen < ?)`).run(now(), cutoffIso).changes
    },
    touch(deviceId, ts = now()) {
      db.prepare('UPDATE devices SET last_seen=? WHERE device_id=?').run(ts, deviceId)
    },
    getDevice(id) {
      return db.prepare('SELECT * FROM devices WHERE device_id=?').get(id)
    },
    listDevices() {
      return db.prepare('SELECT * FROM devices ORDER BY device_id').all()
    },
    insertTelemetry(deviceId, key, value, ts) {
      pendingTele.push({ deviceId, key, value: String(value), ts })
      process.nextTick(flushTele)
    },
    latestProps(deviceId) {
      flushTele()
      return db.prepare(`SELECT key, value, ts FROM telemetry
        WHERE device_id=? AND id IN (SELECT MAX(id) FROM telemetry WHERE device_id=? GROUP BY key)`)
        .all(deviceId, deviceId)
    },
    propHistory(deviceId, key, limit = 100) {
      flushTele()
      return db.prepare('SELECT value, ts FROM telemetry WHERE device_id=? AND key=? ORDER BY id DESC LIMIT ?')
        .all(deviceId, key, limit)
    },
    countTelemetry() {
      flushTele()
      return db.prepare('SELECT COUNT(*) AS c FROM telemetry').get().c
    },
    countActions() {
      return db.prepare('SELECT COUNT(*) AS c FROM actions_log').get().c
    },
    prune(cutoffIso) {
      flushTele()
      const t = db.prepare('DELETE FROM telemetry WHERE ts < ?').run(cutoffIso)
      const e = db.prepare('DELETE FROM events WHERE ts < ?').run(cutoffIso)
      db.pragma('wal_checkpoint(TRUNCATE)') // 清理后收编 WAL 文件（优化报告 #2）
      return { telemetry: t.changes, events: e.changes }
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
    },
    recentEvents({ deviceId, limit = 50 } = {}) {
      const stmt = deviceId
        ? db.prepare('SELECT device_id, name, payload_json, ts FROM events WHERE device_id = ? ORDER BY id DESC LIMIT ?')
        : db.prepare('SELECT device_id, name, payload_json, ts FROM events ORDER BY id DESC LIMIT ?')
      return deviceId ? stmt.all(deviceId, limit) : stmt.all(limit)
    },
    insertSpan(s) {
      db.prepare(`INSERT INTO traces(trace_id,span_id,parent_span_id,name,kind,start_ms,end_ms,attributes_json,status,status_message)
        VALUES(@trace_id,@span_id,@parent_span_id,@name,@kind,@start_ms,@end_ms,@attributes_json,@status,@status_message)`)
        .run({ parent_span_id: null, end_ms: null, status_message: '', ...s }) // 默认值在前，s 的真实字段必须覆盖它们
    },
    getTrace(traceId) {
      return db.prepare('SELECT * FROM traces WHERE trace_id = ? ORDER BY start_ms, rowid').all(traceId)
    },
    listTraces(limit = 20) {
      const rows = db.prepare(`SELECT trace_id, COUNT(*) AS spans, MIN(start_ms) AS started, MAX(end_ms) AS ended
        FROM traces GROUP BY trace_id ORDER BY started DESC LIMIT ?`).all(limit)
      return rows.map(r => ({ ...r, task: getRootAttr(db, r.trace_id, 'lab.task') }))
    }
  }
}
