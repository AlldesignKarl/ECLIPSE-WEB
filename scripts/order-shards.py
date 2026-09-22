"""
Orden de montaje de los fragmentos de Alldesign Karl.

La escultura se construye pieza a pieza: este script decide en que orden. La
idea es que parezca intencionado, como alguien que recompone una pieza rota
sobre la mesa del taller:

  1. Se empieza por una pieza grande del pecho, que hace de ancla.
  2. Cada pieza siguiente toca a alguna de las ya colocadas: el objeto crece,
     nunca aparecen islas sueltas en el aire.
  3. Entre las candidatas mandan las grandes y las de abajo: primero el
     cuerpo, despues el cuello y la cabeza, y los trozos pequenos al final.
  4. La ultima es la del rostro: la escultura se completa cuando encuentra su
     cara.

Lee public/alldesign-karl/shards.png (id por pixel) y escribe el orden en
src/alldesign/shards.json.

    python3 scripts/order-shards.py
"""
import json
import numpy as np
from PIL import Image

PNG = "public/alldesign-karl/shards.png"
JSON = "src/alldesign/shards.json"

data = json.load(open(JSON))
ids = np.asarray(Image.open(PNG))[..., 0].astype(np.int32)
H, W = ids.shape
N = data["count"]
shards = {s["id"]: s for s in data["shards"]}

# Frontera compartida entre cada par de fragmentos, en pixeles.
border = np.zeros((N + 1, N + 1), np.int64)
for a, b in ((ids[:, :-1], ids[:, 1:]), (ids[:-1, :], ids[1:, :])):
    m = (a != b) & (a > 0) & (b > 0)
    np.add.at(border, (a[m], b[m]), 1)
    np.add.at(border, (b[m], a[m]), 1)

area = np.array([0] + [shards[i]["a"] for i in range(1, N + 1)])
cy = np.array([0] + [shards[i]["c"][1] for i in range(1, N + 1)])  # v: 0 abajo, 1 arriba
cx = np.array([0] + [shards[i]["c"][0] for i in range(1, N + 1)])

# El rostro: el fragmento bajo la nariz y los ojos (uv medido sobre la foto).
face = int(ids[int((1 - 0.70) * H), int(0.53 * W)])

# Ancla: el mas grande del pecho, cerca del eje.
chest = [i for i in range(1, N + 1) if cy[i] < 0.42 and abs(cx[i] - 0.5) < 0.2]
anchor = max(chest, key=lambda i: area[i])

amax = area.max()
order = [anchor]
placed = {anchor}
while len(order) < N:
    cands = [i for i in range(1, N + 1) if i not in placed and i != face and border[i, list(placed)].sum() > 0]
    if not cands:
        cands = [face]
    def score(i):
        shared = border[i, list(placed)].sum() / max(1, border[i].sum())
        return 0.55 * (area[i] / amax) + 0.35 * shared + 0.45 * (1 - cy[i])
    nxt = max(cands, key=score)
    order.append(nxt)
    placed.add(nxt)

assert order[-1] == face and len(set(order)) == N
data["order"] = order
json.dump(data, open(JSON, "w"))
print("ancla", anchor, "rostro", face)
print("orden", order)
