# ════════════════════════════════════════════════════════════════
# MiniFeather Spider AI — NEUROEVOLUCIÓN pura (sin gradientes)
# ═════════════════════════════ NI UN COMPORTAMIENTO PREPROGRAMADO
# La red controla CADA MÚSCULO: 24 salidas continuas (8 patas ×
# [swing, lateral, lift]) + 4 de cuerpo ([pitch, roll, yaw, thrust]).
# Nada de "mover adelante", nada de gait: si camina, es porque la
# selección natural recompensó los movimientos que la acercaron a
# comida y la alejaron de depredadores.
#
# Aprendizaje SOLO por selección natural (Lamarck apagado):
#   mutate / cross / clone — nadie calcula gradientes.
# La GRU interna sigue existiendo: la araña puede "sentir" el ritmo
# de sus pasos (memoria de fase) sin que nadie se lo dé.
import math
import random

import numpy as np

try:
    import torch
    import torch.nn as nn
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False

OBS_DIM = 29   # ver env.py — sentidos + propiocepción + combate + bias
N_MOTORS = 28  # 8 patas × 3 (swing, lateral, lift) + cuerpo × 4
MEM = 32
HIDDEN = 64
MUT_RATE = 0.10
MUT_SIGMA = 0.12


if HAS_TORCH:
    class MotorNet(nn.Module):
        """Cerebro motor: obs (26) → GRU (32) → 28 músculos tanh."""
        def __init__(self):
            super().__init__()
            self.gru = nn.GRUCell(OBS_DIM, MEM)
            self.head = nn.Sequential(
                nn.Linear(MEM, HIDDEN), nn.Tanh(),
                nn.Linear(HIDDEN, N_MOTORS), nn.Tanh(),
            )

        def forward(self, x, h):
            h2 = self.gru(x, h)
            return self.head(h2), h2


class MotorBrain:
    """Cerebro de NEUROEVOLUCIÓN (sin DQN). act() es inferencia pura."""
    def __init__(self, device=None):
        self.device = device or ("cuda" if HAS_TORCH and torch.cuda.is_available() else "cpu")
        self.generation = 0
        self.origin = "fresh"  # fresh / mutated / crossed
        if HAS_TORCH:
            self.net = MotorNet().to(self.device)
        else:
            # fallback numpy (CPU puro): mismas formas
            self._w = self._init_numpy()
        self.last_loss = None  # ya no hay loss — solo fitness

    def _init_numpy(self):
        rng = np.random.default_rng()
        def mk(*shape):
            a = rng.standard_normal(shape) * math.sqrt(1.0 / shape[-2] if len(shape) == 2 else 1.0)
            return a.astype(np.float32)
        return {
            "gru_wih": mk(MEM, OBS_DIM), "gru_whh": mk(MEM, MEM),
            "gru_bi": mk(MEM), "gru_bh": mk(MEM),
            "h1_w": mk(HIDDEN, MEM), "h1_b": mk(HIDDEN),
            "h2_w": mk(N_MOTORS, HIDDEN), "h2_b": mk(N_MOTORS),
        }

    # ── inferencia (batch=1) ──────────────────────────────────
    def act(self, obs, h=None):
        """obs (26,) → (motores (28,) en tanh[-1,1], h_nuevo)."""
        if HAS_TORCH:
            import torch as T
            with T.no_grad():
                t = T.as_tensor(np.asarray(obs, dtype=np.float32), device=self.device).unsqueeze(0)
                h0 = h if (h is not None and T.is_tensor(h)) else T.zeros(1, MEM, device=self.device)
                motors, h2 = self.net(t, h0)
                return motors.squeeze(0).cpu().numpy(), h2
        # numpy fallback (GRU manual)
        x = np.asarray(obs, dtype=np.float32)
        if h is None:
            h = np.zeros((1, MEM), dtype=np.float32)
        z = x @ self._w["gru_wih"].T + self._w["gru_bi"] + h @ self._w["gru_whh"].T + self._w["gru_bh"]
        r = 1.0 / (1.0 + np.exp(-z))          # reset gate
        hh = np.tanh(z)                        # (simplificada: GRU mínima)
        h2 = r * hh + (1 - r) * h
        y = np.tanh(h2 @ self._w["h1_w"].T + self._w["h1_b"])
        out = np.tanh(y @ self._w["h2_w"].T + self._w["h2_b"])
        return out, h2

    # ── neuroevolución ─────────────────────────────────────────
    def mutate(self, rate=MUT_RATE, sigma=MUT_SIGMA):
        """Perturba cada peso con prob `rate` × N(0, sigma)."""
        if HAS_TORCH:
            import torch as T
            n = 0
            with T.no_grad():
                for p in self.net.parameters():
                    mask = (T.rand_like(p) < rate).float()
                    noise = T.randn_like(p) * sigma
                    p.add_(mask * noise)
                    n += int(mask.sum().item())
            self.generation += 1
            self.origin = "mutated"
            return n
        for k in self._w:
            mask = np.random.rand(*self._w[k].shape) < rate
            self._w[k] += mask * np.random.randn(*self._w[k].shape).astype(np.float32) * sigma
        self.generation += 1
        self.origin = "mutated"
        return int(mask.sum())

    def cross(self, other):
        child = MotorBrain(device=self.device)
        if HAS_TORCH:
            import torch as T
            with T.no_grad():
                for pm, pt, pc in zip(self.net.parameters(), other.net.parameters(), child.net.parameters()):
                    if pm.dim() > 1 and random.random() < 0.5:
                        pc.copy_(pm)
                    else:
                        pc.copy_(pt)
            child.generation = max(self.generation, other.generation)
            child.origin = "crossed"
            return child
        for k in child._w:
            if random.random() < 0.5:
                child._w[k] = self._w[k].copy()
            else:
                child._w[k] = other._w[k].copy()
        child.generation = max(self.generation, other.generation)
        child.origin = "crossed"
        return child

    def clone(self):
        c = MotorBrain(device=self.device)
        if HAS_TORCH:
            c.net.load_state_dict(self.net.state_dict())
            c.generation = self.generation
            c.origin = self.origin
            return c
        c._w = {k: v.copy() for k, v in self._w.items()}
        c.generation = self.generation
        c.origin = self.origin
        return c

    # ── persistencia ─────────────────────────────────────────
    def save(self, path):
        import os
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        if HAS_TORCH:
            torch.save({"net": self.net.state_dict(),
                        "generation": self.generation}, path)
        else:
            with open(path, "wb") as f:
                np.save(f, {"w": self._w, "generation": self.generation}, allow_pickle=True)

    def load(self, path):
        import os
        if not os.path.exists(path):
            return False
        if HAS_TORCH:
            ckpt = torch.load(path, map_location=self.device)
            self.net.load_state_dict(ckpt["net"])
            try:
                self.generation = int(ckpt.get("generation", 0))
            except Exception:
                self.generation = 0
            return True
        d = np.load(path, allow_pickle=True).item()
        self._w = d["w"]
        self.generation = int(d.get("generation", 0))
        return True


# ── compat: el server WS usa el mismo protocolo ─────────────
OBS_DIM_OLD = OBS_DIM
N_ACTIONS = N_MOTORS
