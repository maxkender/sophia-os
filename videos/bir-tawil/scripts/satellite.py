"""Fond « réaliste » des vidéos géographie : l'image Natural Earth I (relief ombré, couleurs naturelles, eau ; domaine
public, naturalearthdata.com) reprojetée en Mercator (la projection de la carte, geo.ts) et découpée en tuiles.

  public/sat/monde.jpg          : le monde entier, 4320 px de large (vues larges)
  public/sat/t_<col>_<lig>.jpg  : tuiles de 2160 px (zooms), seules les tuiles visibles sont chargées

Usage : python3 scripts/satellite.py [chemin/NE1_HR_LC_SR_W_DR.tif]   (télécharge le zip si aucun chemin)
"""
import math, os, sys, urllib.request, zipfile
import numpy as np
from PIL import Image, ImageEnhance

Image.MAX_IMAGE_PIXELS = None
ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.join(ICI, '..', 'public', 'sat')
URL = 'https://naciscdn.org/naturalearth/10m/raster/NE1_HR_LC_SR_W_DR.zip'
LAT_MAX = 80.0
TUILE = 2160

def source():
    if len(sys.argv) > 1:
        return sys.argv[1]
    cache = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'ne1hr')
    os.makedirs(cache, exist_ok=True)
    tif = os.path.join(cache, 'NE1_HR_LC_SR_W_DR.tif')
    if not os.path.exists(tif):
        z = os.path.join(cache, 'ne1hr.zip')
        if not os.path.exists(z):
            print('téléchargement Natural Earth (324 Mo)…', flush=True)
            urllib.request.urlretrieve(URL, z)
        with zipfile.ZipFile(z) as f:
            f.extract('NE1_HR_LC_SR_W_DR.tif', cache)
    return tif

def main():
    os.makedirs(SORTIE, exist_ok=True)
    src = np.asarray(Image.open(source()).convert('RGB'))
    h, w, _ = src.shape  # 10800 x 21600, équirectangulaire
    R = w / (2 * math.pi)
    ymax = R * math.log(math.tan(math.pi / 4 + math.radians(LAT_MAX) / 2))
    H = int(round(2 * ymax))
    v = np.arange(H) + 0.5
    lat = np.degrees(2 * np.arctan(np.exp((ymax - v) / R)) - math.pi / 2)
    lignes = np.clip(((90 - lat) / 180 * h).astype(np.int64), 0, h - 1)
    merc = Image.fromarray(src[lignes])
    del src
    # un peu plus de contraste et de couleur, un poil plus sombre : rendu « satellite » de documentaire
    merc = ImageEnhance.Contrast(merc).enhance(1.25)
    merc = ImageEnhance.Color(merc).enhance(1.45)
    merc = ImageEnhance.Brightness(merc).enhance(0.72)
    merc.resize((4320, round(H * 4320 / w)), Image.LANCZOS).save(os.path.join(SORTIE, 'monde.jpg'), quality=86)
    for j in range(math.ceil(H / TUILE)):
        for i in range(math.ceil(w / TUILE)):
            merc.crop((i * TUILE, j * TUILE, min(w, (i + 1) * TUILE), min(H, (j + 1) * TUILE))).save(
                os.path.join(SORTIE, f't_{i}_{j}.jpg'), quality=84)
    print(f'satellite : {w}x{H} px, tuiles {math.ceil(w / TUILE)}x{math.ceil(H / TUILE)} dans public/sat', flush=True)

if __name__ == '__main__':
    main()
