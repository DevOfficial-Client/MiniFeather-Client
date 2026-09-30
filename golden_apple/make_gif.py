## genera 6 frames del GIF: barrido de brillo diagonal + destellos rotativos
import subprocess, sys
from pathlib import Path
from PIL import Image

FOLDER = Path(__file__).parent
RENDER = r"C:\Users\etc\.agents\skills\pixelart\scripts\render.py"

lines = (FOLDER / "golden_apple.grid.txt").read_text(encoding="utf-8").splitlines()
palette = {}
grid = []
for ln in lines:
    s = ln.strip()
    if not s or s.startswith("##"):
        continue
    if "=" in s and len(s.split("=")[0]) == 1:
        k, v = s.split("=")
        palette[k.strip()] = v.strip()
    else:
        grid.append(s)

H, W = len(grid), len(grid[0])
assert all(len(r) == W for r in grid), "filas de ancho desigual"

GOLD = set("Ddmlhw")
LIGHTEN = {"D": "d", "d": "m", "m": "l", "l": "h", "h": "w", "w": "w"}

def sweep(c0):
    g = [list(r) for r in grid]
    for y in range(H):
        for x in range(W):
            if g[y][x] in GOLD and (x - y) in (c0, c0 + 1):
                g[y][x] = LIGHTEN[g[y][x]]
    return g

def twinkle(pts):
    g = [list(r) for r in grid]
    for y, x in pts:
        g[y][x] = "w"
    return g

A, B, C = [(3, 14)], [(8, 0)], [(13, 13)]
frames = [
    [list(r) for r in sweep(-6)],
    [list(r) for r in sweep(-3)],
    [list(r) for r in sweep(0)],
    [list(r) for r in sweep(3)],
    [list(r) for r in grid],
    [list(r) for r in grid],
]
frames.insert(0, [list(r) for r in grid])  # f0 base antes del barrido
for i, pts in ((0, A), (1, A), (2, B), (3, B), (4, C), (5, C), (6, A)):
    for y, x in pts:
        frames[i][y][x] = "w"
frames = frames[:6]

gifdir = FOLDER / "gif"
gifdir.mkdir(exist_ok=True)
pngs = []
for i, g in enumerate(frames):
    gp = gifdir / f"frame_{i}.grid.txt"
    header = "".join(f"{k}={v}\n" for k, v in palette.items())
    gp.write_text(header + "\n".join("".join(r) for r in g) + "\n", encoding="utf-8")
    out = gifdir / f"frame_{i}.png"
    subprocess.run([sys.executable, RENDER, str(gp), "-o", str(out)], check=True,
                   capture_output=True)
    pngs.append(out)

# ensamblar GIF: paleta indexada, indice 0 = transparente, escala x16 nearest
colors = list(palette.items())
idx_of_rgb = {}
pal_flat = []
for i, (_, hx) in enumerate(colors):
    rgb = tuple(int(hx[j:j + 2], 16) for j in (0, 2, 4))
    idx_of_rgb[rgb] = i + 1
    pal_flat += list(rgb)

SCALE = 16
pframes = []
for p in pngs:
    im = Image.open(p).convert("RGBA").resize((W * SCALE, H * SCALE), Image.NEAREST)
    out = Image.new("P", im.size, 0)
    out.putpalette([0, 0, 0] + pal_flat + [0] * (768 - 3 - len(pal_flat)))
    src, dst = im.load(), out.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, b, a = src[x, y]
            dst[x, y] = 0 if a < 128 else idx_of_rgb[(r, g, b)]
    pframes.append(out)

gif_path = FOLDER / "golden_apple.gif"
pframes[0].save(gif_path, save_all=True, append_images=pframes[1:],
                duration=110, loop=0, transparency=0, disposal=2)

# hoja de contactos para revisar el ciclo
cell, gap = 128, 8
sheet = Image.new("RGBA", (3 * cell + 4 * gap, 2 * cell + 3 * gap), (45, 45, 45, 255))
for i, p in enumerate(pngs):
    im = Image.open(p).convert("RGBA").resize((cell, cell), Image.NEAREST)
    sheet.paste(im, (gap + (i % 3) * (cell + gap), gap + (i // 3) * (cell + gap)), im)
sheet.save(gifdir / "contact_sheet.png")

chk = Image.open(gif_path)
print(f"GIF: {gif_path.name} {chk.size} frames={chk.n_frames} loop={chk.info.get('loop')}")
