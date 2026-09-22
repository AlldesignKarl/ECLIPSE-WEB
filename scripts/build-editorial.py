"""
Fotografias editoriales provisionales para las secciones de Alldesign Karl,
sacadas de las dos imagenes de referencia de la campana. Se sustituyen por la
fotografia de producto real cuando exista: basta con respetar nombres y
proporciones.

    python3 scripts/build-editorial.py portada.webp
"""
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

HERO = Image.open(sys.argv[1]).convert("RGB")
OUT = "public/alldesign-karl"
cut = Image.open(f"{OUT}/sculpture.webp").convert("RGBA")
rng = np.random.default_rng(3)

def grain(im, amount=5.0):
    a = np.asarray(im).astype(np.float32)
    n = ndi.gaussian_filter(rng.standard_normal(a.shape[:2]), 0.6)[..., None] * amount
    return Image.fromarray(np.clip(a + n, 0, 255).astype(np.uint8))

def warm_backdrop(w, h, light=(0.32, 0.22)):
    """Fondo de estudio marfil con una luz calida lateral, como la portada."""
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    x /= w; y /= h
    d = np.hypot((x - light[0]) * 1.2, y - light[1])
    base = np.array([236, 226, 210], np.float32)
    lit = np.array([250, 244, 234], np.float32)
    shade = np.array([214, 200, 180], np.float32)
    t = np.clip(1 - d / 0.9, 0, 1)[..., None]
    v = np.clip((y - 0.55) * 1.6, 0, 1)[..., None]
    img = base * (1 - t) + lit * t
    img = img * (1 - v * 0.35) + shade * v * 0.35
    return Image.fromarray(img.astype(np.uint8))

def place(bg, fig, box, shadow=True):
    x, y, w, h = box
    f = fig.resize((w, h), Image.LANCZOS)
    if shadow:
        a = np.asarray(f.split()[3]).astype(np.float32) / 255
        s = ndi.gaussian_filter(a, 26) * 0.28
        sh = Image.fromarray((s * 255).astype(np.uint8))
        dark = Image.new("RGB", (w, h), (120, 96, 70))
        bg.paste(dark, (x + 18, y + 26), sh)
    bg.paste(f, (x, y), f)
    return bg

def save(im, name, size):
    im = im.resize(size, Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.2, 40, 2))
    grain(im).save(f"{OUT}/{name}.webp", quality=84, method=6)

W, H = cut.size

# Coleccion Azul: el cuenco roto de la portada.
save(HERO.crop((40, 440, 520, 740)), "col-azul", (1200, 750))

# Ediciones especiales: fragmentos con filo de oro.
save(HERO.crop((1240, 160, 1500, 730)), "col-ediciones", (640, 1400))

# Coleccion Escultorica: el busto entero sobre fondo de estudio.
bg = warm_backdrop(1000, 1300, (0.3, 0.2))
bh = 1150; bw = int(W * bh / H)
save(place(bg, cut, ((1000 - bw) // 2, 1300 - bh + 40, bw, bh)), "col-escultorica", (1000, 1300))

# Coleccion Botanica: detalle del pecho, la rama pintada a pincel.
det = cut.crop((int(W * 0.18), int(H * 0.60), int(W * 0.82), int(H * 0.99)))
bg = warm_backdrop(det.width, det.height, (0.7, 0.1))
bg.paste(det, (0, 0), det)
save(bg, "col-botanica", (1200, int(1200 * det.height / det.width)))

# Sobre nosotros: el rostro, mirando hacia arriba.
det = cut.crop((int(W * 0.14), int(H * 0.02), int(W * 0.86), int(H * 0.58)))
bg = warm_backdrop(det.width, det.height, (0.25, 0.15))
bg.paste(det, (0, 0), det)
save(bg, "taller", (900, int(900 * det.height / det.width)))

# Detalle de la corona para el proceso.
det = cut.crop((int(W * 0.30), int(H * 0.0), int(W * 0.80), int(H * 0.26)))
bg = warm_backdrop(det.width, det.height, (0.5, 0.2))
bg.paste(det, (0, 0), det)
save(bg, "corona", (900, int(900 * det.height / det.width)))

# Imagen para compartir el enlace.
og = warm_backdrop(1200, 630, (0.3, 0.3))
bh = 600; bw = int(W * bh / H)
og = place(og, cut, (720, 40, bw, bh))
grain(og).convert("RGB").save(f"{OUT}/og.jpg", quality=86)
print("ok")
