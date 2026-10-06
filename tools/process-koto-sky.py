#!/usr/bin/env python3
# post-proceso del cubemap "nighttime sky by koto" para el domo de MF_KotoSky.
# el pack original (skybox vanilla de Bedrock) tiene dos defectos que en el
# juego se ven feos en movimiento: cortes duros entre caras (las 4 fotos
# laterales no empalman perfecto) y un cénit parcheado con streaks radiales.
# aquí se suavizan AMBOS sobre los PNG de assets/koto_sky:
#   1. feathering de las 12 aristas del cubo: franjas de cross-fade entre
#      caras vecinas (50/50 exacto en la arista → continuo por construcción)
#   2. cénit: suavizado azimutal (promedio de rotaciones sobre el polo)
#      que diluye las streaks radiales del parche
# las caras se procesan en orientación "GL" (flipud) porque ahí el uv del
# shader mapea directo, y se guardan volviendo a la orientación original.
# run: python tools/process-koto-sky.py
from PIL import Image, ImageFilter
import numpy as np
import itertools, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'koto_sky')
S = 512
FEATHER = 44        # px de franja de fundido por arista
POLE_R = 250        # radio (px) del tratamiento azimutal del cénit
# (POLE_KEEP retirado: el suavizado azimutal reemplazó al multibanda)

faces = [np.asarray(Image.open(os.path.join(SRC, f'face_{i}.png')), dtype=np.float32) for i in range(6)]
oriented = [np.flipud(f).copy() for f in faces]   # espacio GL: fila = (1-v)*S

# uv por cara en espacio GL, orden Bedrock (0=+Z,1=+X,2=-Z,3=-X,4=+Y,5=-Y)
def uv_of(face, d):
    x, y, z = d
    if face in (1, 3): sc, tc, ma = (-z if face == 1 else z), -y, abs(x)
    elif face == 4:    sc, tc, ma = x, z, abs(y)
    elif face == 5:    sc, tc, ma = x, -z, abs(y)
    else:              sc, tc, ma = (x if face == 0 else -x), -y, abs(z)
    return 0.5 * (sc / ma + 1.0), 0.5 * (tc / ma + 1.0)

def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)

corners = list(itertools.product((-1, 1), (-1, 1), (-1, 1)))
edges3d = [(a, b) for a, b in itertools.combinations(corners, 2)
           if sum(1 for i in range(3) if a[i] != b[i]) == 1]

def faces_at(d):
    ax = (abs(d[0]), abs(d[1]), abs(d[2]))
    m = max(ax)
    cand = [i for i in range(3) if abs(ax[i] - m) < 1e-6]
    def f(axis, sign):
        if axis == 0: return 1 if sign > 0 else 3
        if axis == 1: return 4 if sign > 0 else 5
        return 0 if sign > 0 else 2
    return f(cand[0], d[cand[0]]), f(cand[1], d[cand[1]])

def classify(u, v):
    # borde en términos uv-GL: col0/col1 (u fijado) o row0/row1 (v fijado,
    # row0 = fila superior de la imagen = v_gl=1)
    if u < 1e-3:     return 'col0', v
    if u > 1 - 1e-3: return 'col1', v
    if v > 1 - 1e-3: return 'row0', u
    if v < 1e-3:     return 'row1', u
    raise RuntimeError(f'muestra fuera de borde: u={u} v={v}')

def pix(border, s, dist):
    # pixel (fila, col) a `dist` px hacia adentro; `s` = coordenada libre (0..1)
    if border == 'col0': return (int(round((1 - s) * (S - 1))), int(round(dist)))
    if border == 'col1': return (int(round((1 - s) * (S - 1))), int(round(S - 1 - dist)))
    if border == 'row0': return (int(round(dist)), int(round(s * (S - 1))))
    return (int(round(S - 1 - dist)), int(round(s * (S - 1))))

def affine(t0, t1, s0, s1):
    # s(t) = a + b*t con dos muestras internas (0.02, 0.98); afín exacto
    b = (s1 - s0) / (t1 - t0)
    a = s0 - b * t0
    return lambda t: a + b * t

T0, T1 = 0.02, 0.98
work = [f.copy() for f in oriented]
for a3, b3 in edges3d:
    snap = [f.copy() for f in work]
    a3, b3 = np.array(a3, float), np.array(b3, float)
    mid = (a3 + b3) / 2
    fa, fb = faces_at(mid)
    da0 = uv_of(fa, a3 + (b3 - a3) * T0)
    da1 = uv_of(fa, a3 + (b3 - a3) * T1)
    db0 = uv_of(fb, a3 + (b3 - a3) * T0)
    db1 = uv_of(fb, a3 + (b3 - a3) * T1)
    ba, sa0, sa1 = classify(*da0)[0], classify(*da0)[1], classify(*da1)[1]
    bb, sb0, sb1 = classify(*db0)[0], classify(*db0)[1], classify(*db1)[1]
    sa_of_t = affine(T0, T1, sa0, sa1)
    sb_of_t = affine(T0, T1, sb0, sb1)
    A, B = snap[fa], snap[fb]
    for dist in range(FEATHER):
        w = 0.5 * (1.0 - smooth(dist / FEATHER))   # 0.5 en la arista → 0 adentro
        # recorro la franja de A por sus píxeles de borde
        for i in range(S):
            if ba in ('col0', 'col1'):
                s_a = 1.0 - i / (S - 1)            # fila i ↔ v = 1 - i/(S-1)
            else:
                s_a = i / (S - 1)                  # col i ↔ u = i/(S-1)
            t = (s_a - sa_of_t(0.0)) / (sa_of_t(1.0) - sa_of_t(0.0) or 1e-9)
            s_b = sb_of_t(t)
            pa, pb = pix(ba, s_a, dist), pix(bb, s_b, dist)
            ca, cb = A[pa[0], pa[1]], B[pb[0], pb[1]]
            work[fa][pa[0], pa[1]] = ca * (1 - w) + cb * w
            work[fb][pb[0], pb[1]] = cb * (1 - w) + ca * w
oriented = work

# ── cénit: suavizado azimutal en el cono polar de la cara 4 ─────────────
# la cara es proyección gnomónica con el polo en el centro, así que rotar la
# imagen = rotar el cielo alrededor del cénit. Promediar rotaciones cercanas
# diluye las streaks RADIALES del parche (delgadas en azimut) manteniendo la
# estructura de nubes; el detalle residual vuelve a peso parcial.
img = Image.fromarray(np.clip(oriented[4], 0, 255).astype(np.uint8))
angles = np.linspace(-25, 25, 11)
acc = np.zeros_like(oriented[4], dtype=np.float64)
for ang in angles:
    acc += np.asarray(img.rotate(ang, resample=Image.BILINEAR, center=(S / 2, S / 2)), dtype=np.float64)
azblur = (acc / len(angles)).astype(np.float32)
yy, xx = np.mgrid[0:S, 0:S]
r = np.sqrt((yy - (S - 1) / 2) ** 2 + (xx - (S - 1) / 2) ** 2)
w = np.clip(1.0 - r / POLE_R, 0, 1) ** 1.5
detail = oriented[4] - azblur                    # streaks residuales + estrellas
keep = azblur + detail * 0.3                     # estructura 100%, rayos al 30%
oriented[4] = oriented[4] * (1 - w[..., None]) + keep * w[..., None]

for i in range(6):
    out = np.flipud(np.clip(oriented[i], 0, 255)).astype(np.uint8)  # a orientación original
    Image.fromarray(out).save(os.path.join(SRC, f'face_{i}.png'), optimize=True)
print(f'listo: feather {FEATHER}px en 12 aristas · cénit azimutal r={POLE_R}')
