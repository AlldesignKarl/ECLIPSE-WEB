"""
Prepara los recursos de la escultura de Alldesign Karl.

Entrada:  una foto de la escultura y su mascara alfa (recorte hecho con rembg,
          modelo isnet-general-use: `rembg i -m isnet-general-use foto.jpg cut.png`).
Salida en public/alldesign-karl/:
  sculpture.webp   la escultura sin fondo, con los bordes descontaminados del gris
  shards.png       R = id del fragmento, G = distancia al borde del fragmento
  shards.json      caja y centroide de cada fragmento en coordenadas de textura

La particion es un Voronoi deformado con ruido: las lineas de rotura quedan
irregulares, como porcelana rota de verdad, y cada pixel pertenece a un unico
fragmento, asi que al ensamblarlos la escultura queda sin costuras.

    python3 scripts/build-shards.py foto.jpg cut.png
"""
import json, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

SRC, CUT = sys.argv[1], sys.argv[2]
OUT = "public/alldesign-karl"
N_SEEDS = 38
UPSCALE = 1.5
rng = np.random.default_rng(7)

img = np.asarray(Image.open(SRC).convert("RGB")).astype(np.float32) / 255
alpha = np.asarray(Image.open(CUT))[..., 3].astype(np.float32) / 255
H, W = alpha.shape

# La foto termina en una repisa: su sombra se cuela en la mascara.
base = 1082
alpha[base:] = 0
fade = np.clip((base - np.arange(H)) / 34.0, 0, 1)[:, None]
alpha *= fade ** 0.8

# Islas sueltas fuera del sujeto.
lab, n = ndi.label(alpha > 0.5)
if n > 1:
    sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
    keep = 1 + int(np.argmax(sizes))
    grown = ndi.binary_dilation(lab == keep, iterations=3)
    alpha *= grown

# Descontaminacion: el borde semitransparente lleva gris del fondo mezclado.
bgmask = (alpha < 0.02).astype(np.float32)
bg = np.zeros_like(img)
for c in range(3):
    num = ndi.gaussian_filter(img[..., c] * bgmask, 18)
    den = ndi.gaussian_filter(bgmask, 18) + 1e-4
    bg[..., c] = num / den
a3 = alpha[..., None]
fg = np.where(a3 > 0.04, (img - (1 - a3) * bg) / np.maximum(a3, 0.04), img)
fg = np.clip(fg, 0, 1)
# Endurece un poco el alfa: el halo gris se lleva el ultimo medio pixel.
alpha = np.clip((alpha - 0.06) / 0.88, 0, 1)

# Recorte a la caja del sujeto con margen.
ys, xs = np.where(alpha > 0.01)
pad = 12
y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad, H)
x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad, W)
fg, alpha = fg[y0:y1, x0:x1], alpha[y0:y1, x0:x1]
h, w = alpha.shape

rgba = np.dstack([fg, alpha]) * 255
im = Image.fromarray(rgba.astype(np.uint8), "RGBA")
TW, TH = int(w * UPSCALE), int(h * UPSCALE)
im = im.resize((TW, TH), Image.LANCZOS)
rgb = im.convert("RGB").filter(ImageFilter.UnsharpMask(radius=1.6, percent=55, threshold=2))
im = Image.merge("RGBA", (*rgb.split(), im.split()[3]))
im.save(f"{OUT}/sculpture.webp", quality=90, method=6)
# Version reducida para movil y para el poster sin WebGL.
im.resize((TW // 2, TH // 2), Image.LANCZOS).save(f"{OUT}/sculpture-sm.webp", quality=86, method=6)

# ---------------- Fragmentos ----------------
# Se trabaja a media resolucion de la textura: el id se muestrea sin filtrar y
# la distancia con filtro lineal, asi que no hace falta mas.
DW, DH = TW // 2, TH // 2
A = np.asarray(im.split()[3].resize((DW, DH), Image.BILINEAR)).astype(np.float32) / 255
inside = A > 0.5

# Semillas: muestreo por rechazo con distancia minima, mas densas en la cabeza
# (la corona tiene mas detalle y queda mejor en trozos pequenos).
pts = []
yy, xx = np.where(inside)
tries = 0
while len(pts) < N_SEEDS and tries < 200000:
    tries += 1
    i = rng.integers(len(yy))
    p = np.array([xx[i], yy[i]], np.float32)
    head = 1.0 - 0.35 * np.clip(1 - p[1] / (DH * 0.5), 0, 1)
    dmin = 0.13 * DW * head
    if all(np.hypot(*(p - q)) > dmin for q in pts):
        pts.append(p)
pts = np.array(pts)

# Dominio deformado: grietas curvas y quebradas en lugar de rectas.
def noise(shape, scale, seed):
    r = np.random.default_rng(seed).standard_normal((shape[0] // scale + 3, shape[1] // scale + 3))
    return ndi.zoom(r, scale, order=3)[: shape[0], : shape[1]]

gy, gx = np.mgrid[0:DH, 0:DW].astype(np.float32)
wx = gx + noise((DH, DW), 40, 1) * 16 + noise((DH, DW), 9, 2) * 3.2
wy = gy + noise((DH, DW), 40, 3) * 16 + noise((DH, DW), 9, 4) * 3.2

best = np.full((DH, DW), np.inf, np.float32)
ids = np.zeros((DH, DW), np.int32)
weights = rng.uniform(0.85, 1.2, len(pts))
for k, (px, py) in enumerate(pts):
    d = np.hypot(wx - px, wy - py) * weights[k]
    m = d < best
    best[m] = d[m]
    ids[m] = k + 1

# Fuera de la escultura se extiende el id del fragmento mas cercano: el alfa ya
# recorta, y asi el borde suave del sujeto no queda huerfano.
region = A > 0.02
ids[~region] = 0

# Cada fragmento debe ser una sola pieza conexa; los trozos sueltos y los
# fragmentos demasiado pequenos se funden con su vecino mas largo en frontera.
def merge_small(ids, min_area):
    changed = True
    while changed:
        changed = False
        for k in np.unique(ids):
            if k == 0:
                continue
            lab, n = ndi.label(ids == k)
            if n == 0:
                continue
            sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
            main = 1 + int(np.argmax(sizes))
            for j in range(1, n + 1):
                comp = lab == j
                if j == main and sizes[j - 1] >= min_area:
                    continue
                ring = ndi.binary_dilation(comp, iterations=1) & ~comp
                neigh = ids[ring]
                neigh = neigh[(neigh != 0) & (neigh != k)]
                if len(neigh) == 0:
                    if j != main:
                        ids[comp] = 0
                    continue
                ids[comp] = np.bincount(neigh).argmax()
                changed = True
    return ids

ids = merge_small(ids, min_area=0.004 * inside.sum())

# Renumeracion compacta 1..N
uniq = [k for k in np.unique(ids) if k != 0]
remap = np.zeros(ids.max() + 1, np.int32)
for n, k in enumerate(uniq):
    remap[k] = n + 1
ids = remap[ids]
N = len(uniq)

# Distancia al borde del fragmento (incluye la silueta).
edge = np.zeros_like(ids, bool)
for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
    edge |= ids != np.roll(np.roll(ids, dy, 0), dx, 1)
sil = A < 0.5
dist = ndi.distance_transform_edt(~(edge | sil))
dist_px = dist * (TW / DW)  # en pixeles de la textura de color

data = np.zeros((DH, DW, 4), np.uint8)
data[..., 0] = ids
data[..., 1] = np.clip(dist_px * 4, 0, 255).astype(np.uint8)  # 1/4 px de precision, hasta 64 px
data[..., 3] = 255
Image.fromarray(data, "RGBA").save(f"{OUT}/shards.png", optimize=True)

shards = []
for k in range(1, N + 1):
    m = ids == k
    ys, xs = np.where(m)
    area = m.sum() / float(inside.sum())
    shards.append({
        "id": k,
        # caja en uv (origen abajo a la izquierda, como WebGL), con 1.5 px de margen
        "box": [
            round((xs.min() - 1.5) / DW, 5),
            round(1 - (ys.max() + 2.5) / DH, 5),
            round((xs.max() - xs.min() + 4) / DW, 5),
            round((ys.max() - ys.min() + 4) / DH, 5),
        ],
        "c": [round(xs.mean() / DW, 5), round(1 - ys.mean() / DH, 5)],
        "a": round(float(area), 5),
    })

json.dump({"w": TW, "h": TH, "count": N, "shards": shards}, open(f"{OUT}/shards.json", "w"))

# Vista de control
pal = rng.uniform(0.3, 1, (N + 1, 3)); pal[0] = 0
prev = (pal[ids] * 255).astype(np.uint8)
prev[edge & ~sil] = 255
Image.fromarray(prev).save("/tmp/shards-preview.png")
print("fragmentos:", N, "textura:", TW, TH, "datos:", DW, DH)
