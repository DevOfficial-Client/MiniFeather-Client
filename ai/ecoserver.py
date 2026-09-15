# ════════════════════════════════════════════════════════════════
# EcoServer — evolución motor pura: SOLO SELECCIÓN NATURAL
# ════════════════════════════════════════════════════════════════
# Población de cerebros MotorBrain (GRU → 28 músculos) compitiendo
# en MorphEnv (física de patas + comida + depredadores). Ningún
# gradiente: solo fitness → élite → cruce/mutación → siguiente gen.
#
#   python ai/ecoserver.py                    # dashboard :8790
#   python ai/ecoserver.py --pop 16 --gens 0  # 0 = infinitas
import argparse
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

from env import MorphEnv, EP_LEN
from model import MotorBrain

DASH_PORT = 8790
EXPORT_PATH = "ai/spider_brain.pt"
EPISODES_PER_EVAL = 3


class Individual:
    def __init__(self, brain, gen, origin="fresh"):
        self.brain = brain
        self.gen = gen
        self.origin = origin
        self.fitness = None
        self.last_stats = None

    def evaluate(self):
        env = MorphEnv()
        totals, eats, travels, surv = [], [], [], 0
        for _ in range(EPISODES_PER_EVAL):
            obs = env.reset()
            h = None
            total = 0.0
            for _ in range(EP_LEN):
                motors, h = self.brain.act(obs, h)
                obs, r, done, info = env.step(motors)
                total += r
                if done:
                    break
            totals.append(total)
            eats.append(info["eaten"])
            travels.append(info["moved"])
            surv += 1 if info["energy"] > 0 else 0
        self.fitness = float(np.mean(totals))
        self.last_stats = {
            "reward": round(self.fitness, 1),
            "eaten": round(float(np.mean(eats)), 1),
            "travel": round(float(np.mean(travels)), 1),
            "survived": f"{surv}/{EPISODES_PER_EVAL}",
        }
        return self.fitness


class Ecosystem:
    def __init__(self, pop_size=12, elite=0.3, seed_ckpt=None):
        self.pop_size = pop_size
        self.n_elite = max(2, int(pop_size * elite))
        self.generation = 0
        self.history = []
        self.champion = None
        self.lock = threading.Lock()

        base = MotorBrain()
        if seed_ckpt and seed_ckpt != "none" and base.load(seed_ckpt):
            print(f"[eco] semilla: {seed_ckpt} (gen {base.generation})")
        self.pop = []
        for i in range(pop_size):
            b = base.clone() if i == 0 else base.clone()
            if i > 0:
                b.mutate()
            self.pop.append(Individual(b, 0, "seed" if i == 0 else "mutated"))
        print(f"[eco] población inicial: {pop_size} cerebros "
              f"(device={base.device}, motores=28, SOLO evolución)")

    def run_generation(self):
        t0 = time.time()
        for ind in self.pop:
            ind.evaluate()

        self.pop.sort(key=lambda i: i.fitness, reverse=True)
        best = self.pop[0]
        mean = float(np.mean([i.fitness for i in self.pop]))
        self.history.append({
            "gen": self.generation,
            "best": round(best.fitness, 1),
            "mean": round(mean, 1),
            "worst": round(self.pop[-1].fitness, 1),
            "stats": best.last_stats,
        })

        if self.champion is None or best.fitness > self.champion[0]:
            self.champion = (best.fitness, best.brain)
            best.brain.save(EXPORT_PATH)
            print(f"[eco] ¡NUEVO CAMPEÓN gen {self.generation}! "
                  f"fitness={best.fitness:.1f} → {EXPORT_PATH}")

        elites = self.pop[: self.n_elite]
        children = [Individual(e.brain.clone(), self.generation + 1, "elite")
                    for e in elites]
        while len(children) < self.pop_size:
            import random
            if len(elites) >= 2 and random.random() < 0.5:
                p1, p2 = random.sample(elites, 2)
                child = p1.brain.cross(p2.brain)
                child.mutate()
                children.append(Individual(child, self.generation + 1, "crossed"))
            else:
                child = random.choice(elites).brain.clone()
                child.mutate()
                children.append(Individual(child, self.generation + 1, "mutated"))

        with self.lock:
            self.pop = children
            self.generation += 1

        print(f"[eco] gen {self.generation - 1}: best={best.fitness:+.1f} "
              f"mean={mean:+.1f} {best.last_stats} ({time.time() - t0:.0f}s)")
        return self.history[-1]

    def snapshot(self):
        with self.lock:
            return {
                "generation": self.generation,
                "history": self.history[-60:],
                "champion": round(self.champion[0], 1) if self.champion else None,
                "population": [
                    {"gen": i.gen, "origin": i.origin,
                     "fitness": round(i.fitness, 1) if i.fitness is not None else None,
                     **(i.last_stats or {})}
                    for i in sorted(self.pop, key=lambda x: x.fitness or -9999, reverse=True)
                ],
            }


DASH_HTML = """<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Spider EcoServer — Evolución Motor</title>
<style>
  body{font-family:monospace;background:#0b0e14;color:#cdd3e0;margin:0;padding:16px}
  h1{font-size:15px;color:#7ee787} h2{font-size:13px;color:#79c0ff;margin-top:18px}
  canvas{background:#11151f;border:1px solid #21262d;border-radius:6px}
  table{border-collapse:collapse;font-size:12px}
  td,th{padding:2px 10px;border-bottom:1px solid #21262d;text-align:right}
  th{color:#79c0ff} .best{color:#7ee787;font-weight:bold}
  #stats{color:#ffa657;font-size:13px}
</style></head><body>
<h1>🕷 Evolución motor pura — 28 músculos, cero comportamientos programados</h1>
<div id="stats">conectando…</div>
<canvas id="chart" width="760" height="260"></canvas>
<h2>Generaciones</h2>
<table id="hist"></table>
<h2>Población (por fitness)</h2>
<table id="pop"></table>
<script>
const W=760,H=260,PAD=34;
function draw(hist){
  const c=document.getElementById('chart'),x=c.getContext('2d');
  x.clearRect(0,0,W,H); if(!hist.length)return;
  const vals=hist.flatMap(h=>[h.best,h.mean,h.worst]);
  const lo=Math.min(0,...vals)-5,hi=Math.max(...vals)+5;
  const sx=i=>PAD+i*(W-2*PAD)/Math.max(1,hist.length-1);
  const sy=v=>H-PAD-(v-lo)*(H-2*PAD)/(hi-lo);
  x.strokeStyle='#30363d';x.beginPath();
  x.moveTo(PAD,PAD);x.lineTo(PAD,H-PAD);x.lineTo(W-PAD,H-PAD);x.stroke();
  x.fillStyle='#8b949e';x.font='10px monospace';
  x.fillText(hi.toFixed(0),4,PAD+8);x.fillText(lo.toFixed(0),4,H-PAD);
  const line=(k,col)=>{x.strokeStyle=col;x.lineWidth=1.5;x.beginPath();
    hist.forEach((h,i)=>i?x.lineTo(sx(i),sy(h[k])):x.moveTo(sx(i),sy(h[k])));x.stroke();};
  line('best','#7ee787');line('mean','#79c0ff');line('worst','#f85149');
}
async function tick(){
  try{
    const d=await(await fetch('/api/state')).json();
    document.getElementById('stats').textContent=
      `gen ${d.generation} · campeón fitness ${d.champion??'—'} · solo selección natural`;
    draw(d.history);
    document.getElementById('hist').innerHTML='<tr><th>gen</th><th>best</th><th>mean</th><th>worst</th><th>comidas</th><th>distancia</th></tr>'+
      [...d.history].reverse().slice(0,15).map(h=>
        `<tr><td>${h.gen}</td><td class="best">${h.best}</td><td>${h.mean}</td><td>${h.worst}</td>`+
        `<td>${h.stats?.eaten??''}</td><td>${h.stats?.travel??''}</td></tr>`).join('');
    document.getElementById('pop').innerHTML='<tr><th>gen</th><th>origen</th><th>fitness</th><th>comidas</th><th>distancia</th><th>sobrevive</th></tr>'+
      d.population.map(p=>
        `<tr><td>${p.gen}</td><td>${p.origin}</td><td>${p.fitness??'—'}</td><td>${p.eaten??''}</td>`+
        `<td>${p.travel??''}</td><td>${p.survived??''}</td></tr>`).join('');
  }catch(_){}
  setTimeout(tick,2000);
}
tick();
</script></body></html>"""


def make_dash_handler(eco):
    class DashHandler(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            if self.path == "/":
                body = DASH_HTML.encode()
                ctype = "text/html"
            elif self.path == "/api/state":
                body = json.dumps(eco.snapshot()).encode()
                ctype = "application/json"
            else:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return DashHandler


def main():
    ap = argparse.ArgumentParser(description="Evolución motor: solo selección natural")
    ap.add_argument("--pop", type=int, default=12)
    ap.add_argument("--gens", type=int, default=0, help="0 = infinitas")
    ap.add_argument("--elite", type=float, default=0.3)
    ap.add_argument("--seed", default="ai/spider_brain.pt")
    ap.add_argument("--dash-port", type=int, default=DASH_PORT)
    ap.add_argument("--no-dash", action="store_true")
    args = ap.parse_args()

    eco = Ecosystem(pop_size=args.pop, elite=args.elite, seed_ckpt=args.seed)

    if not args.no_dash:
        srv = ThreadingHTTPServer(("127.0.0.1", args.dash_port), make_dash_handler(eco))
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        print(f"📊 dashboard → http://127.0.0.1:{args.dash_port}")

    g = 0
    try:
        while args.gens == 0 or g < args.gens:
            eco.run_generation()
            g += 1
    except KeyboardInterrupt:
        print("\n[eco] parado por el usuario")
    if eco.champion:
        eco.champion[1].save(EXPORT_PATH)
        print(f"[eco] campeón final guardado → {EXPORT_PATH}")


if __name__ == "__main__":
    main()
