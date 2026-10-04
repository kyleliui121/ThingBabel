import express from 'express'
import jwt from 'jsonwebtoken'

const wrap = (res, data) => res.json({ code: 0, data })
const fail = (res, status, message) => res.status(status).json({ code: 1, message })

export function createApi({ db, actions, config }) {
  const app = express()
  app.use(express.json())

  // H5 开发期跨域
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })

  app.post('/api/login', (req, res) => {
    const { password } = req.body || {}
    if (password !== config.adminPassword) return fail(res, 401, '密码错误')
    const token = jwt.sign({ role: 'admin' }, config.jwtSecret, { expiresIn: '7d' })
    return wrap(res, { token })
  })

  app.use('/api', (req, res, next) => {
    const h = req.headers.authorization || ''
    try { jwt.verify(h.replace(/^Bearer /, ''), config.jwtSecret); next() }
    catch { return fail(res, 401, '未登录或登录已过期') }
  })

  const findDevice = (res, id) => {
    const d = db.getDevice(id)
    if (!d) { fail(res, 404, `设备 ${id} 不存在`); return null }
    return d
  }

  app.get('/api/devices', (req, res) => {
    const list = db.listDevices().map(d => ({
      device_id: d.device_id, name: d.name, type: d.type,
      online: !!d.online, last_seen: d.last_seen,
      props: Object.fromEntries(db.latestProps(d.device_id).map(p => [p.key, { value: p.value, ts: p.ts }]))
    }))
    return wrap(res, list)
  })

  app.get('/api/devices/:id', (req, res) => {
    const d = findDevice(res, req.params.id)
    if (!d) return
    let caps = {}
    try { caps = JSON.parse(d.caps_json) } catch {}
    return wrap(res, { device_id: d.device_id, name: d.name, type: d.type, description: d.description, online: !!d.online, last_seen: d.last_seen, caps })
  })

  app.get('/api/devices/:id/props', (req, res) => {
    if (!findDevice(res, req.params.id)) return
    return wrap(res, db.latestProps(req.params.id))
  })

  app.get('/api/devices/:id/props/history', (req, res) => {
    if (!findDevice(res, req.params.id)) return
    const key = String(req.query.key || '')
    if (!key) return fail(res, 400, '缺少 key 参数')
    const limit = Math.min(Number(req.query.limit) || 100, 1000)
    return wrap(res, db.propHistory(req.params.id, key, limit))
  })

  app.post('/api/devices/:id/actions', (req, res) => {
    if (!findDevice(res, req.params.id)) return
    const { name, params } = req.body || {}
    if (!name) return fail(res, 400, '缺少指令名')
    return wrap(res, actions.dispatch(req.params.id, String(name), params || {}))
  })

  app.get('/api/actions/:actionId', (req, res) => {
    const a = db.getAction(req.params.actionId)
    if (!a) return fail(res, 404, '指令不存在')
    return wrap(res, a)
  })

  app.use((err, req, res, next) => {
    console.error('[api]', err)
    return fail(res, 500, '服务器内部错误')
  })

  return app
}
