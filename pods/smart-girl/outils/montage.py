"""Empile la rangée des slides (moitié haute) de plusieurs aperçus : python3 outils/montage.py sortie.jpg sg-o001 sg-o002 …"""
import sys, os
from PIL import Image
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ims = [Image.open(f'sortie/apercus/{x}.jpg') for x in sys.argv[2:]]
tops = [i.crop((0, 0, i.width, i.height // 2)) for i in ims]
o = Image.new('RGB', (max(t.width for t in tops), sum(t.height for t in tops)), 'black'); y = 0
for t in tops: o.paste(t, (0, y)); y += t.height
o.save(sys.argv[1], quality=85)
