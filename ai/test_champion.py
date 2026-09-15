"""Diagnóstico: ¿qué hace el campeón actual? (velocidad, patas, viaje)"""
import numpy as np
import torch
from model import MotorBrain, OBS_DIM, N_MOTORS
import env as E

brain = MotorBrain()
if not brain.load("ai/spider_brain.pt"):
    brain.load("spider_brain.pt")
print(f"campeón gen {brain.generation}")

env = E.MorphEnv(seed=3)
obs = env.reset()
h = None
for t in range(1, 901):
    motors, h = brain.act(obs, h)
    obs, r, done, info = env.step(motors)
    if t % 150 == 0:
        planted = sum(1 for l in env.legs if l.grounded)
        lifted = sum(1 for l in env.legs if not l.grounded)
        print(f"t={t:3d} speed={env.speed:.3f} altura={env.height:.2f} "
              f"plantadas={planted} aire={lifted} "
              f"viaje={env._travel:.0f} reward={r:+.2f}")
    if done:
        print(f"done t={t}: {info['cause']}")
        break
print(f"\nFINAL: viaje={env._travel:.0f} eaten={env.eaten} bites={env.bites} "
      f"kills={env.kills} energy={env.energy:.0f}")

# distribución de los motores del cerebro: ¿está congelado?
m_last, _ = brain.act(obs, h)
m = np.array(m_last)
print(f"motores: min={m.min():.2f} max={m.max():.2f} std={m.std():.3f}")
print(f"lift>0.3 (en aire): {(m[2::3] > 0.3).sum()}/8 patas")
