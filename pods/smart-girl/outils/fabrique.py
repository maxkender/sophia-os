"""Fabrique les originaux du jour à partir d'un fichier de textes (dict P).

Usage : python3 outils/fabrique.py <textes.py> [graine]
  P = {source_id: (type, parent|'L<n>'|None, inspiration8, titre, son, cta, notes, slides)}
  slides = [(texte, texte_sophia|None[, media8 imposé])]
Images : toute la banque (donnees/images.json, déjà sans les images des 14 derniers
jours), une image différente par slide sur la journée ; la slide Sophia jamais sur
une personne (légende sans personne). outils/ecartees.txt : ids à ne pas reprendre.
"""
import json, os, random, re, sys, importlib.util
ICI = os.path.dirname(os.path.abspath(__file__)); POD = os.path.dirname(ICI)
os.chdir(POD)
spec = importlib.util.spec_from_file_location("textes", sys.argv[1]); T = importlib.util.module_from_spec(spec); spec.loader.exec_module(T)
random.seed(int(sys.argv[2]) if len(sys.argv) > 2 else 1)
SONS = {
 'voc': ("original sound", "https://www.tiktok.com/music/original-sound-7562980421013736214"),
 'hob': ("i love this song", "https://www.tiktok.com/music/i-love-this-song-7305905594472024865"),
 'spk': ("original sound - ᯓsky✮", "https://www.tiktok.com/music/original-sound-sky-7557769430395013904"),
 'att': ("The Spins", "https://www.tiktok.com/music/The-Spins-6858383319357229057"),
 'hs': ("som original", "https://www.tiktok.com/music/som-original-7412607755946625798"),
 'edu': ("Swan Lake 01 (Full Oke Normal Edition)(982830)", "https://www.tiktok.com/music/swan-lake-01-full-oke-normal-edition-982-6940662992498919425"),
 'aca': ("original sound", "https://www.tiktok.com/music/original-sound-7432356491992714016"),
 'salv': ("salvatore", "https://www.tiktok.com/music/salvatore-7287171432126532384"),
 'o724': ("original sound", "https://www.tiktok.com/music/original-sound-7242352903993985818"),
 'stev': ("original sound - stevelacyoffline", "https://www.tiktok.com/music/original-sound-stevelacyoffline-7667284290392083221"),
 'mash': ("music to watch boys to x i wanna be yours mashup", "https://www.tiktok.com/music/music-to-watch-boys-to-x-i-wanna-be-yours-mashup-7406543618254703393"),
}
CTA = "CTA : cta A = dernier item, à la première personne ; cta B = au milieu du deck, sur un fait ou une histoire ; cta C = l'appli comme rituel à la place du scroll (« an app like Sophia »). Le texte de base ne cite jamais Sophia ; la version Sophia est dans texte_sophia."
B = "https://mbikecieskoobeizixig.supabase.co/storage/v1/object/public/medias/brut"
label = {c['id'][:8]: c for c in json.load(open('donnees/label.json'))}
boite = json.load(open('donnees/boite.json'))['boite']
images = {i['id'][:8]: i for i in json.load(open('donnees/images.json'))}
ecartees = set(open(f'{ICI}/ecartees.txt').read().split()) if os.path.exists(f'{ICI}/ecartees.txt') else set()
PERSONNE = re.compile(r'woman|women|person|people|man\b|men\b|girl|boy|child|kid|student|hand|face|portrait|couple|legs|feet|arm|body|torso|neck|still from|actor|actress|selfie|crowd|event|classroom|collage|screenshot|app\b|sign\b|poster', re.I)
import io, urllib.request
from PIL import Image
_empreintes = []
def _vignette(k):
    try:
        return Image.open(io.BytesIO(urllib.request.urlopen(images[k]['url'], timeout=20).read())).convert('RGB')
    except Exception:
        return None
def image_sure(k):
    """Slide Sophia : pas de grand aplat rouge (la pub « 41 % » que les légendes ne décrivent pas), pas de doublon visuel du jour."""
    i = _vignette(k)
    if i is None: return False
    p = list(i.resize((60, 100)).getdata())
    rouge = sum(1 for r, g, b in p if r > 170 and g < 80 and b < 80) / len(p)
    if rouge > 0.03: return False
    g = i.convert('L').resize((9, 8)); q = list(g.getdata())
    h = sum(1 << n for n in range(64) if q[(n // 8) * 9 + n % 8] > q[(n // 8) * 9 + n % 8 + 1])
    if any(bin(h ^ e).count('1') <= 10 for e in _empreintes): return False
    _empreintes.append(h); return True
pris = set()
for s in (x for v in T.P.values() for x in v[7] if len(x) > 2): pris.add(s[2])
libres = [k for k, i in images.items() if k not in ecartees]
def choisir(rx, sophia):
    c = [k for k in libres if k not in pris and (images[k].get('legende') or '')
         and re.search(rx, images[k]['legende'], re.I) and not (sophia and PERSONNE.search(images[k]['legende']))]
    if not c and not sophia: c = [k for k in libres if k not in pris]
    if not c: raise SystemExit(f'plus d’image pour {rx}')
    random.shuffle(c)
    for k in c:
        if not sophia or image_sure(k):
            pris.add(k); return k
    raise SystemExit(f'aucune image sûre pour {rx}')
for sid, (typ, par, insp, titre, son, cta, notes, slides) in T.P.items():
    if par and par.startswith('L'): par = boite[int(par[1:]) - 1]['parent_contenu_id']
    c = label.get(insp) or {}
    if not c.get('source_url'): c = label['905ac33d']  # nos propres posts n'ont pas de source TikTok
    vid = c['source_url'].rstrip('/').split('/')[-1]; n = len(c['slides'])
    rx = T.THEMES.get(sid, T.DEFAUT) if hasattr(T, 'THEMES') else T.DEFAUT
    o = {'source_id': sid, 'type_bleo': typ}
    if par: o['parent_contenu_id'] = par
    o.update(titre=titre, musique_titre=SONS[son][0], musique_url=SONS[son][1], inspirations=[c['id']],
             notes=f"cta {cta}. {notes} {CTA}", slides=[])
    for i, s in enumerate(slides, 1):
        t, ts = s[0], s[1]
        m = s[2] if len(s) > 2 else choisir(T.SOPHIA if ts else rx, bool(ts))
        d = {'position': i, 'media_id': m, 'texte_overlay': t}
        if ts: d['texte_sophia'] = ts
        d['reference_url'] = f"{B}/{vid}/{min(i, n)}.jpg"
        o['slides'].append(d)
    json.dump(o, open(f'originaux/{sid}.json', 'w'), ensure_ascii=False, indent=1)
    print(sid, ' '.join(s['media_id'] for s in o['slides']))
