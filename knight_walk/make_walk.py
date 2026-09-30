## Caballero estilo HK - ciclo de caminar 6 frames, 32x32, mirando a la derecha
## Compone cada frame por bloques: sombra -> piernas -> capa -> cabeza
import subprocess, sys
from pathlib import Path
from PIL import Image

FOLDER = Path(__file__).parent
RENDER = r"C:\Users\etc\.agents\skills\pixelart\scripts\render.py"
W = H = 32

PALETTE = {
    "K": "14121f",  # contorno / pierna cercana
    "M": "e9e4d2",  # mascara palida
    "m": "cbc3aa",  # mascara en sombra
    "E": "262244",  # ojo
    "C": "3c4a72",  # capa clara
    "c": "28304f",  # capa oscura
    "L": "4f6192",  # brillo de capa
    "s": "2b2940",  # sombra en el suelo
}

# bloque cabeza+cuernos: filas 1-19 (19 filas), cuernos largos curvos
HEAD = [
    ".......K.................K......",
    "........KKK............KKK......",
    ".........KKK..........KKK.......",
    "..........KKK........KKK........",
    "...........KKMMMMMMMKK..........",
    "..........KMMMMMMMMMMK..........",
    ".........KMMMMMMMMMMMMMK........",
    "........KMMMMMMMMMMMMMMMK.......",
    "........KMMMMMMMMMMMMMMMK.......",
    "........KMMMMMMMMMMMMMMMK.......",
    "........KMMMMMMMMMEEEEMMK.......",
    "........KMMMMMMMEEEEEEMMK.......",
    "........KMMMMMMMEEEEEEMMK.......",
    "........KMMMMMMMMMEEEEMMK.......",
    "........KMMMMMMMMMMMMMMMK.......",
    ".........KMMMMMMMMMMMMmmK.......",
    ".........KMMMMMMMMMMmmmK........",
    "..........KmmmmmmmmK............",
    "...........KmmmmmK..............",
]

# capa: filas 17-26, borde izquierdo fijo, derecho variable; t desplaza dientes, r el borde
def capa(t, r):
    g = []
    # (left_outline_col, interior_left, interior_right, outline_right, chars)
    spec = [
        (6, 7, 21, "CCCCCCCCCCCCCCC"),   # 17
        (5, 6, 21, "LCCCCCCCCCCCCCCCC"), # 18
        (5, 6, 21, "LCCccccccccccccc"),  # 19
        (5, 6, 20, "Lcccccccccccccc"),   # 20
        (5, 6, 20, "ccccccccccccccc"),   # 21
        (5, 6, 19, "cccccccccccccc"),    # 22
        (5, 6, 18, "ccccccccccccc"),     # 23
    ]
    for lo, il, ir, body in spec:
        ir2 = ir + r
        row = ["."] * W
        row[lo] = "K"
        for i, ch in enumerate(body):
            row[il + i] = ch
        row[ir2 + 1] = "K"
        g.append("".join(row))
    # dobladillo: dientes de 2px, puntas en fila 25
    teeth = [7 + t, 12 + t, 17 + t]
    row24 = ["."] * W
    row25 = ["."] * W
    row24[6] = "K"
    for cx in teeth:
        row24[cx] = "c"; row24[cx + 1] = "c"; row24[cx + 2] = "K"
        row25[cx] = "c"; row25[cx + 1] = "K"
    g.append("".join(row24))
    g.append("".join(row25))
    return g

# piernas: filas 25-28 (4 filas); c = pierna lejana, K = cercana
LEGS = {
    "A": [  # contacto: abiertas, cercana adelante
        "...........cc....KK.............",
        "...........cc....KK.............",
        "..........cc......KK............",
        "........cc..........KK..........",
    ],
    "B": [  # paso: juntas, cercana levantada
        ".............ccKK...............",
        ".............cc..KK.............",
        ".............cc...KK............",
        ".............cc.................",
    ],
    "D": [  # bajada: recogiendose
        "............cc..KK..............",
        "............cc..KK..............",
        "............cc..KK..............",
        "............cc...KK.............",
    ],
    "C": [  # contacto opuesto: cercana atras
        ".............cc..KK.............",
        "..............cKK...............",
        ".............KKcc...............",
        "...........KK....cc.............",
    ],
}

SHADOW = {29: (9, 20), 30: (11, 18)}

def compose(legs, t, r, dy, head_dy=None):
    head_dy = head_dy if head_dy is not None else dy
    cv = [["."] * W for _ in range(H)]
    def paint(rows, y0, x0=0):
        for j, srow in enumerate(rows):
            y = y0 + j
            if not (0 <= y < H):
                continue
            for i, ch in enumerate(srow):
                if ch != "." and 0 <= x0 + i < W:
                    cv[y][x0 + i] = ch
    for y, (a, b) in SHADOW.items():
        for x in range(a, b + 1):
            cv[y][x] = "s"
    paint(LEGS[legs], 25)
    paint(capa(t, r), 17 + dy)
    paint(HEAD, 1 + head_dy)
    return ["".join(r) for r in cv]

FRAMES = [
    ("A", -1, -1, 1, None),  # contacto
    ("D", -1, -1, 1, 2),     # bajada (cabeza se hunde 1 extra)
    ("B",  0,  0, 0, None),  # paso, punto alto
    ("C",  1,  1, 1, None),  # contacto opuesto
    ("D",  1,  1, 1, 2),     # bajada
    ("B",  0,  0, 0, None),  # paso
]

outdir = FOLDER
pngs = []
for i, (lg, t, r, dy, hdy) in enumerate(FRAMES, 1):
    rows = compose(lg, t, r, dy, hdy)
    assert all(len(x) == W for x in rows), f"frame {i} con ancho desigual"
    gp = outdir / f"walk_{i}.grid.txt"
    header = "".join(f"{k}={v}\n" for k, v in PALETTE.items())
    gp.write_text(header + "\n".join(rows) + "\n", encoding="utf-8")
    out = outdir / f"walk_{i}.png"
    subprocess.run([sys.executable, RENDER, str(gp), "-o", str(out)], check=True,
                   capture_output=True)
    pngs.append(out)

# GIF 8x (256px) con transparencia
colors = list(PALETTE.items())
idx_of = {}
pal = []
for i, (_, hx) in enumerate(colors):
    idx_of[tuple(int(hx[j:j + 2], 16) for j in (0, 2, 4))] = i + 1
    pal += list(int(hx[j:j + 2], 16) for j in (0, 2, 4))

SCALE = 8
pframes = []
for p in pngs:
    im = Image.open(p).convert("RGBA").resize((W * SCALE, H * SCALE), Image.NEAREST)
    out = Image.new("P", im.size, 0)
    out.putpalette([0, 0, 0] + pal + [0] * (768 - 3 - len(pal)))
    src, dst = im.load(), out.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            rr, gg, bb, aa = src[x, y]
            dst[x, y] = 0 if aa < 128 else idx_of[(rr, gg, bb)]
    pframes.append(out)

gif_path = outdir / "knight_walk.gif"
pframes[0].save(gif_path, save_all=True, append_images=pframes[1:],
                duration=100, loop=0, transparency=0, disposal=2)

# hoja de contactos 3x2
cell, gap = 128, 8
sheet = Image.new("RGBA", (3 * cell + 4 * gap, 2 * cell + 3 * gap), (70, 70, 80, 255))
for i, p in enumerate(pngs):
    im = Image.open(p).convert("RGBA").resize((cell, cell), Image.NEAREST)
    sheet.paste(im, (gap + (i % 3) * (cell + gap), gap + (i // 3) * (cell + gap)), im)
sheet.save(outdir / "contact_sheet.png")

chk = Image.open(gif_path)
print(f"GIF: {gif_path.name} {chk.size} frames={chk.n_frames} dur={chk.info.get('duration')}ms")
