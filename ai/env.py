# ════════════════════════════════════════════════════════════════
# Entorno MORFOLÓGICO: la IA controla cada articulación de la araña
# ═══════════════════════════   SIN COMPORTAMIENTOS PREPROGRAMADOS
# Cuerpo = punto con rumbo. Cada pata: pie + vector de empuje.
# La red emite por pata [swing, lateral, lift] ∈ [-1,1]³ y para el
# cuerpo [pitch, roll, yaw-torque, thrust]. La física convierte
# eso en movimiento: pie plantado que se retrae → empuja el cuerpo.
#
# Nada de "direcciones" ni "gait": si la araña camina hacia la
# comida, es porque la selección natural encontró patrones motores
# que la llevaron allí. Reward = supervivencia (energía) pura.
import math
import random

import numpy as np

from model import OBS_DIM, N_MOTORS

N_LEGS = 8
# anclajes de las 8 patas en el marco del cuerpo (x=izq/der, z=frente/atrás)
LEG_ANCHORS = [
    (0.5, 1.6), (-0.5, 1.6),      # frontales
    (0.9, 0.4), (-0.9, 0.4),      # medias
    (0.9, -0.9), (-0.9, -0.9),    # traseras medias
    (0.6, -2.4), (-0.6, -2.4),    # traseras
]
LEG_REACH = 2.6      # alcance máximo del pie desde su anclaje
LEG_LEN = 1.8        # longitud de la pata (hipotenusa)
LEG_MIN = 0.45       # altura mínima del cuerpo (plegada al máx)
STEP_GAIN = 0.35     # cuánto se mueve el pie por unidad de comando
LIFT_H = 0.9         # altura máx de levantamiento del pie
BODY_MASS = 1.0
DAMPING = 0.92       # fricción del suelo con el cuerpo
FOOT_DAMP = 0.86     # fricción del pie plantado
GRAV = 0.06
PUSH_GAIN = 0.09     # fuerza de un pie plantado sobre el cuerpo

FOOD_R = 1.4
PRED_R = 2.0
PRED_SENSE = 14.0
PRED_SPEED = 0.30
ARENA = 24.0
EP_LEN = 900
FOOD_MAX = 12
FOOD_ENERGY = 30.0
BITE_ENERGY = 18.0
BITE_R = 2.2
STAM_MAX = 1.3
STAM_DRAIN = 0.006   # por unidad de |motor| (todo movimiento cuesta)
STAM_FATIGUE = 0.15

# ── COMBATE: el jugador es una presa que huye y se defiende ──
PLAYER_HP = 60.0
PLAYER_SPEED = 0.22  # más lenta que la araña en sprint, pero huye
PLAYER_SENSE = 10.0  # el jugador ve venir a la araña
PLAYER_HIT_DMG = 9.0 # daño del contragolpe del jugador
PLAYER_HIT_R = 1.3
BITE_DMG = 12.0      # daño por mordida (5 mordidas = kill)
COMBAT_R = 8.0       # radio de "combate/detección"
AFTER_FIGHT = 240    # ticks de grasa post-combate (4s)


class Leg:
    __slots__ = ("anchor", "foot", "rel", "grounded")
    def __init__(self, anchor):
        self.anchor = anchor      # (x, z) en marco cuerpo
        self.foot = np.array(anchor, dtype=np.float64)  # pos mundo (x,z)
        atwo = anchor
        self.rel = np.array(atwo, dtype=np.float64)     # última pos relativa
        self.grounded = True


class MorphEnv:
    """Entorno motor puro. step(motors) aplica los 28 comandos."""

    def __init__(self, seed=None):
        self.rng = random.Random(seed)
        self.npr = np.random.default_rng(seed)
        self.legs = [Leg(a) for a in LEG_ANCHORS]
        self.reset()

    # ── estado ──
    def reset(self):
        self.pos = np.array([self.rng.uniform(-8, 8), self.rng.uniform(-8, 8)])
        self.heading = self.rng.uniform(0, 2 * np.pi)
        self.energy = 55.0
        self.stam = STAM_MAX
        self.t = 0
        self.eaten = 0
        self.bites = 0
        self.escapes = 0
        self.vel = np.zeros(2)
        self.omega = 0.0
        self.height = 0.9
        self.vh = 0.0
        self.speed = 0.0
        self.bite_cd = 0
        self.player = np.array([self.rng.uniform(-10, 10), self.rng.uniform(-10, 10)])
        # estado de combate (presupuesto de rewards del usuario)
        self.player_hp = PLAYER_HP
        self.player_alive = True
        self.fight_ticks = 0          # ticks dentro de COMBAT_R
        self.post_fight = 0           # countdown de "sobreviví al combate"
        self.was_in_combat = False
        self.first_detect = False     # recompensa única por detectar
        self.prev_pdist_c = None      # pdist del tick anterior (perseguir)
        self.hits_taken = 0
        self.kills = 0
        self.dmg_dealt = 0.0
        self.fights_survived = 0
        self._bites_last = 0
        self.food = [(self.rng.uniform(-ARENA, ARENA), self.rng.uniform(-ARENA, ARENA)) for _ in range(6)]
        self.preds = [self._spawn_pred() for _ in range(2)]
        for leg in self.legs:
            leg.foot = self.pos + self._rot(leg.anchor)
            leg.grounded = True
        return self.observation()

    def _spawn_pred(self):
        while True:
            p = np.array([self.rng.uniform(-ARENA, ARENA), self.rng.uniform(-ARENA, ARENA)])
            if np.hypot(*(p - self.pos)) > 12:
                break
        return {"pos": p, "heading": self.rng.uniform(0, 2 * np.pi)}

    def _rot(self, v):
        c, s = math.cos(self.heading), math.sin(self.heading)
        return np.array([v[0] * c - v[1] * s, v[0] * s + v[1] * c])

    def _unrot(self, v):
        c, s = math.cos(self.heading), math.sin(self.heading)
        return np.array([v[0] * c + v[1] * s, -v[0] * s + v[1] * c])

    # ── observación (26) ──
    def observation(self):
        # 0-8: comida/jugador/depredador (sin/cos/dist relativo al rumbo)
        # 9-10: sin/cos rumbo · 11: energía · 12: estamina
        # 13: velocidad · 14: ω (vel. angular) · 15: fatigada?
        # 16-23: por pata: pie en suelo? (1/0)
        # 24: n° patas en suelo / 8 · 25: bias
        if self.food:
            fd = min(self.food, key=lambda f: np.hypot(f[0] - self.pos[0], f[1] - self.pos[1]))
            fa = self._rel_angle(fd)
            fdist = min(2.0, np.hypot(fd[0] - self.pos[0], fd[1] - self.pos[1]) / ARENA)
        else:
            fa, fdist = 0.0, 2.0
        pa = self._rel_angle(self.player)
        pdist = min(2.0, np.hypot(*(self.player - self.pos)) / ARENA)
        pr = min(self.preds, key=lambda p: np.hypot(*(p["pos"] - self.pos)))
        ta = self._rel_angle(pr["pos"])
        tdist = np.hypot(*(pr["pos"] - self.pos))
        grounded = [1.0 if leg.grounded else 0.0 for leg in self.legs]
        return np.array([
            np.sin(fa), np.cos(fa), fdist,
            np.sin(pa), np.cos(pa), pdist,
            np.sin(ta), np.cos(ta), min(2.0, tdist / ARENA),
            np.sin(self.heading), np.cos(self.heading),
            self.energy / 100.0,
            self.stam / STAM_MAX,
            min(1.5, self.speed / 0.4),
            self.omega,
            1.0 if self.stam < STAM_MAX * STAM_FATIGUE else 0.0,
            *grounded,
            sum(grounded) / N_LEGS,
            self.height,   # 25: altura del cuerpo (0.25 = arrastrándose)
            # ── combate (26-27) ──
            self.player_hp / PLAYER_HP if self.player_alive else 0.0,
            1.0 if self.fight_ticks > 0 else 0.0,   # en combate ahora
            1.0,
        ], dtype=np.float32)

    def _rel_angle(self, target):
        ang = math.atan2(target[1] - self.pos[1], target[0] - self.pos[0]) - self.heading
        return (ang + math.pi) % (2 * math.pi) - math.pi

    # ── física de músculos ──
    def step(self, motors):
        """motors: 28 floats en [-1,1] (8 patas × 3 + cuerpo × 4)."""
        self.t += 1
        m = np.clip(np.asarray(motors, dtype=np.float64).ravel(), -1, 1)
        if m.size < N_MOTORS:
            m = np.pad(m, (0, N_MOTORS - m.size))
        legm = m[: N_LEGS * 3].reshape(N_LEGS, 3)
        body = m[N_LEGS * 3:]

        tired = self.stam < STAM_MAX * STAM_FATIGUE
        tired_f = 0.45 if tired else 1.0

        # ── cuerpo: SOLO torque de yaw. Nada de thrust/pitch/roll
        #    mágicos — la altura la sostienen las patas o no hay.
        self.omega += body[2] * 0.02 * tired_f
        self.omega *= 0.90
        self.heading = (self.heading + self.omega) % (2 * math.pi)
        body_effort = abs(body[2]) * 0.3

        # ── patas: mover pies y empujar ──
        push = np.zeros(2)
        n_grounded = 0
        h_sum = 0.0
        SWING_SPEED = 0.35   # velocidad muscular finita del pie en el aire
        for i, leg in enumerate(self.legs):
            swing, lateral, lift = legm[i]
            swing *= tired_f; lateral *= tired_f; lift *= tired_f
            # posición objetivo del pie RELATIVA al anclaje, en marco cuerpo
            rel_t = np.array([leg.anchor[0] * (1 + lateral * 0.4),
                              leg.anchor[1] + swing * LEG_REACH])
            rel_t[1] = np.clip(rel_t[1], -LEG_REACH, LEG_REACH)
            # extensión REAL de la pata: distancia anclaje→pie
            ext = float(np.hypot(rel_t[0] - leg.anchor[0], rel_t[1] - leg.anchor[1]))
            if lift > 0.3:
                # pie en el AIRE: swing SUAVE (velocidad muscular finita)
                leg.grounded = False
                target_world = self.pos + self._rot(rel_t)
                delta = target_world - leg.foot
                d = float(np.hypot(*delta))
                if d > 1e-4:
                    leg.foot += delta / d * min(d, SWING_SPEED)
                leg.rel = rel_t
            else:
                # pie plantado: intenta ir a su objetivo, pero está anclado
                leg.grounded = True
                target_world = self.pos + self._rot(rel_t)
                delta = target_world - leg.foot
                # el suelo resiste: el pie tira del cuerpo, no al revés
                if np.hypot(*delta) > 1e-6:
                    force = delta * PUSH_GAIN
                    push += force
                    leg.foot += delta * (1 - FOOT_DAMP)
                n_grounded += 1
                # altura GEOMÉTRICA que esa pata sostiene: sqrt(L²-ext²)
                h_sum += math.sqrt(max(LEG_MIN**2, LEG_LEN**2 - ext**2))

        # ── altura del cuerpo = la que las patas sostienen ──
        #    plegada (ext 0) → altura máx · estirada (ext L) → se hunde
        #    menos de 3 patas plantadas → COLAPSO (arrastra el abdomen)
        if n_grounded >= 3:
            h_target = h_sum / n_grounded
        else:
            h_target = LEG_MIN
        self.vh = (self.vh + (h_target - self.height) * 0.18 - GRAV) * 0.88
        self.height = float(np.clip(self.height + self.vh, LEG_MIN * 0.83, LEG_LEN))
        collapsed = self.height < LEG_MIN + 0.05

        # ── aplicar empuje acumulado de las patas ──
        self.vel += push / max(1, n_grounded) * 3.0
        self.vel *= DAMPING
        new_pos = np.clip(self.pos + self.vel, -ARENA, ARENA)
        self._travel = getattr(self, "_travel", 0.0) + float(np.hypot(*(new_pos - self.pos)))
        self.pos = new_pos
        self.speed = float(np.hypot(*self.vel))

        # ── estamina: TODO movimiento cuesta (musculatura real) ──
        effort = float(np.mean(np.abs(legm)) + body_effort)
        self.stam = max(0.0, self.stam - effort * STAM_DRAIN)
        if n_grounded >= 6 and effort < 0.25:
            self.stam = min(STAM_MAX, self.stam + 0.003)  # quieto recupera

        # ── metabolismo ──
        self.energy -= 0.010 + effort * 0.008
        if self.bite_cd > 0:
            self.bite_cd -= 1

        reward = -0.01
        done = False

        # ── COLAPSO: cuerpo sin soporte de patas → castigo fuerte ──
        if collapsed:
            reward -= 0.25
            self.vel *= 0.4   # arrastrarse es lento
            self.omega *= 0.5

        # ── depredadores ──
        prev_pdist = min(np.hypot(*(p["pos"] - self.pos)) for p in self.preds)
        for pr in self.preds:
            d = np.hypot(*(self.pos - pr["pos"]))
            if d < PRED_SENSE and self.speed < PRED_SPEED * 1.5:
                pr["heading"] = math.atan2(*(self.pos - pr["pos"])[::-1])
                pr["pos"] += np.array([math.cos(pr["heading"]), math.sin(pr["heading"])]) * PRED_SPEED
            else:
                pr["heading"] += self.rng.uniform(-0.15, 0.15)
                pr["pos"] += np.array([math.cos(pr["heading"]), math.sin(pr["heading"])]) * PRED_SPEED * 0.6
            pr["pos"] = np.clip(pr["pos"], -ARENA, ARENA)
        pdist = min(np.hypot(*(p["pos"] - self.pos)) for p in self.preds)
        if pdist < PRED_R:
            reward -= 10.0
            done = True
        else:
            if prev_pdist < PRED_SENSE and pdist >= PRED_SENSE:
                reward += 1.0            # ¡escapó!
                self.escapes += 1
            elif prev_pdist < PRED_SENSE:
                reward += (pdist - prev_pdist) * 0.05  # alejarse suma

        # ── comida ──
        if self.food:
            fd = min(self.food, key=lambda f: np.hypot(f[0] - self.pos[0], f[1] - self.pos[1]))
            d = np.hypot(fd[0] - self.pos[0], fd[1] - self.pos[1])
            if d < FOOD_R:
                self.food.remove(fd)
                self.energy = min(100.0, self.energy + FOOD_ENERGY)
                self.eaten += 1
                reward += 2.0

        # ── COMBATE: el jugador como presa inteligente ──
        pdist_now = np.hypot(*(self.player - self.pos))
        if self.player_alive:
            # IA del jugador: huir si la araña está cerca, sino deambular
            if pdist_now < PLAYER_SENSE:
                away = self.pos - self.player
                d = np.hypot(*away)
                if d > 1e-6:
                    self.player += away / d * PLAYER_SPEED
                # contragolpe ocasional cuando la araña está pegada
                if pdist_now < PLAYER_HIT_R and self.rng.random() < 0.08:
                    self.energy = max(0.0, self.energy - PLAYER_HIT_DMG * 0.6)
                    self.hits_taken += 1
                    reward -= 0.35   # recibir daño innecesario
            else:
                self.player += np.array([self.rng.uniform(-0.05, 0.05),
                                         self.rng.uniform(-0.05, 0.05)])
            self.player = np.clip(self.player, -ARENA, ARENA)

        in_combat = pdist_now < COMBAT_R and self.player_alive
        if in_combat:
            if not self.first_detect:
                self.first_detect = True
                reward += 0.4          # + detectar jugador
            self.fight_ticks += 1
            self.post_fight = AFTER_FIGHT
            # + acercarse al jugador (solo dentro de combate)
            if self.prev_pdist_c is not None:
                reward += (self.prev_pdist_c - pdist_now) * 0.25
            # + mantener persecución: cada 2s de combate continuo
            if self.fight_ticks % 120 == 0:
                reward += 0.15
            # − quedarse inmóvil frente al jugador
            if self.speed < 0.05:
                reward -= 0.02
        else:
            # − alejarse sin motivo (estando visible el jugador)
            if self.player_alive and self.prev_pdist_c is not None \
                    and self.prev_pdist_c < COMBAT_R and pdist_now > COMBAT_R:
                reward -= 0.2
            if self.fight_ticks > 0:
                # combate terminado: ¿lo ganó o huyó?
                if not self.player_alive:
                    reward += 3.0      # +++ matar
                else:
                    self.post_fight = AFTER_FIGHT
            self.fight_ticks = 0
        self.prev_pdist_c = pdist_now

        # post-combate: sobrevivir después del enfrentamiento
        if self.post_fight > 0:
            self.post_fight -= 1
            if self.post_fight == 0 and self.energy > 0:
                reward += 1.0          # + sobrevivir al enfrentamiento
                self.escapes += 1

        # ── morder jugador ──
        if self.player_alive and pdist_now < BITE_R and self.bite_cd <= 0:
            self.player_hp -= BITE_DMG
            self.dmg_dealt += BITE_DMG
            self.energy = min(100.0, self.energy + BITE_ENERGY)
            self.bites += 1
            self.bite_cd = 80
            reward += 1.5              # + golpear
            reward += BITE_DMG * 0.02  # ++ causar daño
            if self.player_hp <= 0:
                self.player_alive = False
                self.kills += 1
                reward += 3.0          # +++ matar
                self.energy = min(100.0, self.energy + 25.0)

        # ── castigo por gastar estamina sin conseguir nada ──
        if self.stam < STAM_MAX * 0.2 and self.fight_ticks == 0 \
                and self.bites == self._bites_last:
            reward -= 0.01
        self._bites_last = self.bites

        # ── comida nueva escasa ──
        if self.rng.random() < 0.2 and len(self.food) < FOOD_MAX:
            self.food.append((self.rng.uniform(-ARENA, ARENA), self.rng.uniform(-ARENA, ARENA)))

        # ── muerte / fin ──
        if not done:
            done = self.energy <= 0 or self.t >= EP_LEN
            if self.energy <= 0:
                reward -= 3.0
            if done and self.energy > 0:
                reward += 2.0

        return self.observation(), float(reward), done, {
            "energy": self.energy, "eaten": self.eaten, "bites": self.bites,
            "t": self.t, "escaped": self.escapes, "speed": self.speed,
            "moved": self._total_travel,
            "kills": self.kills, "dmg": round(self.dmg_dealt, 1),
            "hits_taken": self.hits_taken,
            "fights": self.fights_survived,
            "cause": "pred" if (done and pdist < PRED_R and self.energy > 0) else
                     ("starve" if self.energy <= 0 else "time"),
        }

    def _nearest_food_dist(self):
        if not self.food:
            return None
        return min(np.hypot(f[0] - self.pos[0], f[1] - self.pos[1]) for f in self.food)

    @property
    def _total_travel(self):
        return getattr(self, "_travel", 0.0)
   