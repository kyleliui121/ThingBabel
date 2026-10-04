import net from 'node:net'
import aedes from 'aedes'
import mqtt from 'mqtt'
import { createDb } from '../src/db.js'
import { createActions } from '../src/actions.js'
import { makeHandlers, route } from '../src/router.js'

export const wait = (ms) => new Promise(r => setTimeout(r, ms))

export async function startStack({ timeoutMs = 200 } = {}) {
  const broker = aedes()
  const server = net.createServer(broker.handle)
  await new Promise(r => server.listen(0, r))
  const port = server.address().port

  const db = createDb(':memory:')
  const hubClient = mqtt.connect(`mqtt://127.0.0.1:${port}`)
  const publish = (t, p, opts = {}) => hubClient.publish(t, p, { qos: 1, ...opts })
  const actions = createActions({ publish, db, timeoutMs })
  const handlers = makeHandlers({ db, actions })

  hubClient.on('connect', () => hubClient.subscribe('lab/#'))
  hubClient.on('message', (t, m) => route(t.split('/'), m.toString(), handlers))

  const device = mqtt.connect(`mqtt://127.0.0.1:${port}`, { clientId: 'test-device' })
  await wait(150)

  return {
    port, db, actions, device, publish,
    close: async () => {
      device.end(true); hubClient.end(true)
      await new Promise(r => server.close(r)); broker.close()
    }
  }
}
