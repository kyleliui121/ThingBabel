import { handleDiscovery } from './handlers/discovery.js'
import { handleStatus } from './handlers/status.js'
import { handleProps } from './handlers/props.js'
import { handleResult } from './handlers/result.js'
import { handleEvent } from './handlers/event.js'

// 纯函数：把主题分段路由到对应处理器（协议 §2 主题表）
export function route(parts, payload, h) {
  if (parts[0] !== 'lab') return
  if (parts[1] === 'discovery' && parts.length === 3) return h.discovery(parts[2], payload)
  if (parts[1] === 'devices' && parts.length >= 4) {
    const id = parts[2]
    const rest = parts.slice(3)
    if (rest[0] === 'status') return h.status(id, payload)
    if (rest[0] === 'props' && rest.length === 2) return h.props(id, rest[1], payload)
    if (rest[0] === 'actions' && rest.length === 3 && rest[2] === 'result') return h.result(id, rest[1], payload)
    if (rest[0] === 'events' && rest.length === 2) return h.events(id, rest[1], payload)
  }
}

export function makeHandlers({ db, actions }) {
  return {
    discovery: (id, p) => handleDiscovery(db, id, p),
    status: (id, p) => handleStatus(db, id, p),
    props: (id, key, p) => handleProps(db, id, key, p),
    result: (id, name, p) => handleResult(actions, id, name, p),
    events: (id, name, p) => handleEvent(db, id, name, p)
  }
}
