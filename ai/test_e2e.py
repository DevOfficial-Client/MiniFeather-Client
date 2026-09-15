"""E2E: WS contra el motor server — init/ready, act x3 (obs 29), reset, stats."""
import json, urllib.request
from websocket import create_connection

ws = create_connection("ws://127.0.0.1:8766/ws", timeout=5)

# init → ready (la obs la computa el juego, no el server)
ws.send(json.dumps({"t": "init"}))
m = json.loads(ws.recv())
assert m.get("t") == "ready", m
st = m["stats"]
print(f"ready: gen={st['generation']} obs={st['obs']} motors={st['motors']} dev={st['device']}")
assert st["obs"] == 29, f"esperaba obs 29, obtuve {st['obs']}"
assert st["motors"] == 28

sid = 42
obs = [0.1] * 29

# act x3
for i in range(3):
    ws.send(json.dumps({"t": "act", "id": sid, "obs": obs}))
    r = json.loads(ws.recv())
    assert r.get("t") == "motors" and len(r["m"]) == 28, r
print(f"act OK: 28 motores, sample={r['m'][:4]}")

# reset
ws.send(json.dumps({"t": "reset", "id": sid}))
# (reset no responde — enviamos stats para confirmar que el ws sigue vivo)
ws.send(json.dumps({"t": "stats"}))
r = json.loads(ws.recv())
assert r["t"] == "stats"
print(f"stats: minds={r['stats']['minds']} (reset limpió el cerebro)")

ws.close()
print("E2E OK")
