"""Smoke test del sistema de combate: deteccion, acercamiento, mordida, kill."""
import numpy as np
import env as E

env = E.MorphEnv(seed=7)
obs = env.reset()
assert len(obs) == 29, f"obs dim: {len(obs)}"

total_r = 0.0
# Teleport al jugador para forzar combate rapido
env.player = env.pos + np.array([2.0, 0.0])
env.player_alive = True

def yaw_toward(env, target):
    """Error angular [-pi, pi] hacia el target."""
    want = np.arctan2(target[1] - env.pos[1], target[0] - env.pos[0])
    err = (want - env.heading) % (2 * np.pi)
    if err > np.pi:
        err -= 2 * np.pi
    return np.clip(err * 1.5, -1, 1)

for t in range(500):
    # Motores: marcha diagonal (4 patas L plantadas empujan) + yaw hacia jugador
    legm = []
    for i in range(8):
        side = 1 if i < 4 else -1           # alterna grupos diagonales
        phase = (t // 30 + i // 2) % 2
        if phase == side % 2:
            legm += [0.9, 0.0, 0.7]         # swing adelante, en aire
        else:
            legm += [-0.9, 0.0, 0.0]        # plantada, retrae (empuja)
    body = [0, 0, yaw_toward(env, env.player), 0]
    acts = np.array(legm + body, dtype=np.float32)
    obs, r, done, info = env.step(acts)
    total_r += r
    if done:
        print(f"[t={t}] done: {info['cause']}")
        break
    if not env.player_alive:
        break

print(f"ticks={t} reward_total={total_r:.2f}")
print(f"bites={env.bites} kills={env.kills} dmg={env.dmg_dealt:.0f} "
      f"hits_taken={env.hits_taken} player_hp={env.player_hp:.0f} "
      f"alive={env.player_alive}")
print(f"obs[26] preyHp={obs[26]:.2f} obs[27] inCombat={obs[27]:.0f} obs[28] bias={obs[28]:.0f}")
