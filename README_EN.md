[中文](README.md) | English

# ThingBabel

A LAN-first IoT ecosystem where every device speaks **lab-proto** — a thin, MQTT-based protocol
whose core idea is: *on power-up, a device publishes its own capability manifest* (properties /
actions / events). The hub turns that manifest into **LLM tool schemas with zero manual
conversion**, so a natural-language task can be planned, dispatched to real hardware, and
confirmed by receipts — with no per-device glue code, ever.

```
┌──────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────┐
│ ESP32     │  │ Browser/TV   │  │ Node script │  │ Any lang  │  …things
│ (TCP 1883)│  │ (WS 9001)    │  │ (TCP 1883)  │  │ speak MQTT│
└─────┬────┘  └──────┬───────┘  └─────┬──────┘  └────┬─────┘
      └──────────────┴───────┬────────┴──────────────┘
                       lab-proto v0.1
                      ┌───────┴────────┐
                      │ hub             │  registration / storage /
                      │ (Node+Express+  │  watchdog / pruning
                      │  SQLite)        │
                      └───────┬────────┘
              ┌───────────────┼────────────────┐
        Web/TV screen       AI agent           REST consumers
        (web-screen, WS)    (CLI, NL tasks)    (token + SSE)
```

## Repository layout

| Directory | What it is | Reuse |
|------|--------|---------|
| `docs/protocol.md` | **The protocol constitution** — the onboarding spec everything builds on | implement it on any platform |
| `hub/` | Hub: MQTT ingestion, SQLite storage, REST API, SSE, watchdog, pruning, anomaly detection | deploy as-is (lab PC) |
| `devices/web-screen/` | Browser/TV dashboard (single HTML + MQTT.js over WS) | **web/TV** reference: a full protocol citizen |
| `devices/esp32/` | ESP32 firmware template (espMqttClient) | **dev board** reference (not hardware-verified yet) |
| `devices/mock/` | Node.js mock sensor | **scripted device** template for any computer / Raspberry Pi |
| `hub/src/agent/` | AI orchestration: capability manifests → LLM tool schemas with zero conversion | natural-language task entry point |
| `hub/eval/` | Evaluation infrastructure: 30-task set, runner, M5 scaling, exact-match cache | reproduce the experiments |
| `docs/` | Design docs & engineering backlog | background & planning |

## How to integrate (three consumer paths)

1. **Web page / TV**: open `devices/web-screen/index.html` (connects to `ws://<host>:9001` on the
   same host by default; pass `?broker=ws://192.168.x.x:9001` for a remote hub). It is itself a
   full protocol citizen — discovery, last-will, action receipts — so a TV shell can load it as-is.
2. **CLI / Agent**: `node hub/src/agent/cli.js "<natural-language task>"` — capability manifests
   become tool schemas with zero conversion; the plan → dispatch → receipt → report loop is fully
   traced (OpenTelemetry GenAI compatible).
3. **MQTT devices**: for boards, copy `devices/esp32/lab_sensor/lab_sensor.ino` (all five protocol
   elements: discovery / LWT / telemetry / receipts / retain); for scripts, copy
   `devices/mock/mock-sensor.js` (Node), or implement `docs/protocol.md` in any language.

> A mobile app existed until v0.1.1 (uni-app, see git history). To rebuild one, follow the
> "REST + SSE consumer" path (login → `/api/devices` → `/api/stream` →
> `/api/devices/:id/actions`); the protocol is unchanged. See CHANGELOG for the migration note.

## Quick start

```bash
# first time: npm install in hub/ and devices/mock/
cd hub && npm run dev            # terminal 1: hub + in-memory broker (1883 TCP / 9001 WS / 3000 API)
cd devices/mock && npm start      # terminal 2: mock sensor, auto-registers on boot
# TV / big screen: open devices/web-screen/index.html in a browser
# AI orchestration: put your API key in hub/config.json, then:
node hub/src/agent/cli.js "现在传感器多少度？"   # any natural-language task works
```

Login: `admin` / `lab123` (the `adminPassword` in hub/config.json — change it in production).

## Status

- Test count and version facts: [CHANGELOG.md](CHANGELOG.md) is the single source of truth (currently v0.1.6)
- WS onboarding path verified end-to-end (browser connects to 9001 → auto-registration → last-will works)
- ⚠️ ESP32 firmware is a **not-yet-hardware-verified template**; real LLM calls pending an API key
- LAN-only by design — do not expose to the public internet (protocol §9)

## What's next

See `docs/BACKLOG.md`.

## License

[MIT](LICENSE)
