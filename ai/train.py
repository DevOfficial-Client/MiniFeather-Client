# ════════════════════════════════════════════════════════════════
# train.py — DELEGADO en ecoserver.py (ya no hay gradientes)
# ════════════════════════════════════════════════════════════════
# Antes: pre-entrenaba un DQN con backprop. Ahora TODO el
# aprendizaje es SELECCIÓN NATURAL: mutación + cruce + fitness.
#
#   python ai/train.py                  # = ecoserver --pop 12
#   python ai/train.py --gens 30        # 30 generaciones y para
import sys

from ecoserver import main as eco_main

if __name__ == "__main__":
    eco_main(sys.argv[1:])
