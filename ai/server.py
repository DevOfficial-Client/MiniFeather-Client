# ════════════════════════════════════════════════════════════════
# Spider Motor AI Server — WebSocket al juego (GPU si hay CUDA)
# ════════════════════════════════════════════════════════════════
# Sirve los 28 comandos de MÚSCULO (8 patas × [swing, lateral, lift]
# + cuerpo × [pitch, roll, yaw, thrust]) a cada araña del juego.
# Sin gradientes: solo inferencia del campeón neuroevolutivo.
#
#   python ai/server.py            # ws://127.0.0.1:8766/ws
#   python ai/server.py --port 8767
#
# Protocolo:
#   → {"t":"init"}                        ← {"t":"ready", stats}
#   → {"t":"act","id":N,"obs":[29]}       ← {"t":"motors","id":N,"m":[28]}
#   → {"t":"reset","id":N}                (araña nueva/muerta → h=0)
#   → {"t":"stats"}                       ← {"t":"stats", stats}
import argparse
import json
import struct
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from model import MotorBrain, MEM, OBS_DIM

CKPT = "ai/spider_brain.pt"
MINDS = {}   # id → h (memoria GRU por araña)


# ── WebSocket RFC 6455 (sin dependencias) ─────────────────────
class WSConn:
    def __init__(self, rfile, wfile):
        self.rfile, self.wfile = rfile, wfile

    @staticmethod
    def handshake(handler):
        hdrs = handler.headers
        if hdrs.get("Upgrade", "").lower() != "websocket":
            return False
        import base64, hashlib
        key = hdrs.get("Sec-WebSocket-Key", "")
        accept = base64.b64encode(
            hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()
                         ).digest()).decode()
        handler.send_response_only(101, "Switching Protocols")
        handler.send_header("Upgrade", "websocket")
        handler.send_header("Connection", "Upgrade")
        handler.send_header("Sec-WebSocket-Accept", accept)
        handler.end_headers()
        return True

    def send_json(self, obj):
        data = json.dumps(obj).encode()
        hdr = bytes([0x81])
        n = len(data)
        if n < 126:
            hdr += bytes([n])
        elif n < 65536:
            hdr += bytes([126]) + struct.pack(">H", n)
        else:
            hdr += bytes([127]) + struct.pack(">Q", n)
        self.wfile.write(hdr + data)

    def recv_msg(self):
        b1, b2 = self.rfile.read(2)
        if b1 & 0x0F == 8:  # close
            return None
        ln = b2 & 0x7F
        if ln == 126:
            ln = struct.unpack(">H", self.rfile.read(2))[0]
        elif ln == 127:
            ln = struct.unpack(">Q", self.rfile.read(8))[0]
        if b2 & 0x80:  # masked (los clientes siempre enmascaran)
            mask = self.rfile.read(4)
            data = bytes(c ^ mask[i % 4] for i, c in enumerate(self.rfile.read(ln)))
        else:
            data = self.rfile.read(ln)
        return data.decode("utf-8", "replace")


class Handler(BaseHTTPRequestHandler):
    brain: MotorBrain = None

    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.startswith("/ws"):
            if not WSConn.handshake(self):
                self.send_error(400)
                return
            self.serve(WSConn(self.rfile, self.wfile))
        elif self.path == "/stats":
            body = json.dumps(self.brain_stats()).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_error(404)

    def brain_stats(self):
        return {
            "backend": "motor-neuroevo",
            "device": self.brain.device,
            "generation": self.brain.generation,
            "origin": self.brain.origin,
            "motors": 28,
            "obs": OBS_DIM,
            "mem": MEM,
            "minds": len(MINDS),
        }

    def serve(self, ws):
        print(f"[ws] cliente conectado ({self.client_address[0]})")
        while True:
            try:
                raw = ws.recv_msg()
            except Exception:
                break
            if raw is None:
                break
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            t = msg.get("t")

            if t == "init":
                ws.send_json({"t": "ready", "stats": self.brain_stats()})
                print(f"[ws] init → {self.brain_stats()}")

            elif t == "act":
                sid = msg.get("id")
                motors, h2 = self.brain.act(msg.get("obs", []),
                                            MINDS.get(sid))
                MINDS[sid] = h2
                ws.send_json({"t": "motors", "id": sid,
                              "m": [round(float(v), 3) for v in motors]})

            elif t == "reset":
                sid = msg.get("id")
                MINDS.pop(sid, None)

            elif t == "stats":
                ws.send_json({"t": "stats", "stats": self.brain_stats()})

        print("[ws] cliente desconectado")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8766)
    ap.add_argument("--ckpt", default=CKPT)
    args = ap.parse_args(argv)

    brain = MotorBrain()
    if brain.load(args.ckpt):
        print(f"campeón cargado: {args.ckpt} (gen {brain.generation})")
    else:
        print("sin checkpoint: cerebro ALEATORIO "
              "(corre ai/ecoserver.py para evolucionar)")
    Handler.brain = brain

    srv = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Spider Motor Server → ws://127.0.0.1:{args.port}/ws "
          f"(device={brain.device})")
    srv.serve_forever()


if __name__ == "__main__":
    main()
