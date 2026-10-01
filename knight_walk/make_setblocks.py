## Convierte un frame del cachorrito en comandos /setblock+/fill de MiniBlox
## Salidas: txt absoluto (BASE) + txt relativo (~) + script JS para la consola del juego
import sys
from pathlib import Path

FOLDER = Path(__file__).parent
FRAME = FOLDER / "walk_1.grid.txt"

# punto de la esquina INFERIOR-IZQUIERDA del dibujo (fila de los pies)
BASE_X, BASE_Y, BASE_Z = 0, 64, 0

BLOCKS = {
    "K": "black_concrete",        # contorno + pierna cercana
    "E": "gray_concrete",         # ojo
    "c": "gray_concrete",         # sombra de capa + pierna lejana
    "C": "blue_concrete",         # capa
    "L": "light_blue_concrete",   # brillo de capa
    "M": "white_concrete",        # mascara
    "m": "light_gray_concrete",   # sombra de mascara
}

grid = []
for ln in FRAME.read_text(encoding="utf-8").splitlines():
    s = ln.strip()
    if not s or s.startswith("##"):
        continue
    if "=" in s and len(s.split("=")[0]) == 1:
        continue  # paleta
    grid.append(s)
H = len(grid); W = len(grid[0])
assert all(len(r) == W for r in grid)

cmds = []
for gy in range(H):                      # fila 0 = arriba (cuernos)
    wy = BASE_Y + (H - 1 - gy)           # la cabeza queda arriba
    run_start = None
    run_ch = None
    def flush(end_col):
        # fila de píxeles [run_start..end_col] del color run_ch
        if run_ch is None or run_ch not in BLOCKS:
            return
        wx1 = BASE_X + run_start
        wx2 = BASE_X + end_col
        b = BLOCKS[run_ch]
        if wx1 == wx2:
            cmds.append(f"/setblock {wx1} {wy} {BASE_Z} {b}")
        else:
            cmds.append(f"/fill {wx1} {wy} {BASE_Z} {wx2} {wy} {BASE_Z} {b}")
    for gx in range(W + 1):
        ch = grid[gy][gx] if gx < W else None
        if ch != run_ch:
            if run_start is not None:
                flush(gx - 1)
            run_ch, run_start = ch, gx if ch is not None else None

def relativize(cmd):
    parts = cmd.split(" ")
    # /setblock X Y Z ...  ó  /fill X1 Y1 Z1 X2 Y2 Z2 ...
    def rel(v, base):
        return f"~{v - base}" if v != base else "~0"
    if parts[0] == "/setblock":
        x, y, z = int(parts[1]), int(parts[2]), int(parts[3])
        return f"/setblock {rel(x, BASE_X)} {rel(y, BASE_Y)} {rel(z, BASE_Z)} {' '.join(parts[4:])}"
    x1, y1, z1, x2, y2, z2 = (int(p) for p in parts[1:7])
    return (f"/fill {rel(x1, BASE_X)} {rel(y1, BASE_Y)} {rel(z1, BASE_Z)} "
            f"{rel(x2, BASE_X)} {rel(y2, BASE_Y)} {rel(z2, BASE_Z)} {' '.join(parts[7:])}")

abs_txt = FOLDER / "cachorrito_setblocks.txt"
rel_txt = FOLDER / "cachorrito_setblocks_rel.txt"
js_txt = FOLDER / "cachorrito_builder.js"

abs_txt.write_text("\n".join(cmds) + "\n", encoding="utf-8")
rel_txt.write_text("\n".join(relativize(c) for c in cmds) + "\n", encoding="utf-8")

js = [
    "// Pega esto en la consola de scripts del juego (o ejecutalo por partes en chat).",
    "// Construye al cachorrito en un plano vertical frente a ti (si usas el .txt relativo).",
    "const cmds = [",
    *[f'  "{c}",' for c in (relativize(c) for c in cmds)],
    "];",
    "let i = 0;",
    "const id = game.every(1, () => {",
    "  for (let k = 0; k < 25 && i < cmds.length; k++, i++) game.runCommand(cmds[i]);",
    '  game.title(`Cachorrito ${i}/${cmds.length}`, 200);',
    "  if (i >= cmds.length) { clearInterval(id); game.broadcast('¡Cachorrito construido!'); }",
    "});",
]
js_txt.write_text("\n".join(js) + "\n", encoding="utf-8")

blocks_used = {}
for c in cmds:
    b = c.rsplit(" ", 1)[1]
    blocks_used[b] = blocks_used.get(b, 0) + 1
print(f"frame: {FRAME.name}  {W}x{H}")
print(f"comandos: {len(cmds)} (fill comprime las filas)")
for b, n in sorted(blocks_used.items(), key=lambda kv: -kv[1]):
    print(f"  {b}: {n}")
print("muestra:", cmds[0], "|", cmds[-1])
