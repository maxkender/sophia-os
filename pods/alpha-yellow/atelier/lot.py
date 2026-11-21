# Usage : python3 atelier/lot.py <fichier_du_jour.py>
#
# Écrit un lot d'originaux (originaux/<id>.json) à partir d'un fichier de decks
# (liste D, voir plus bas) et choisit les images et les sons selon les règles
# du 12/11 et du 17/11 : toute la banque sans tri de fond, rien de livré par le
# podz depuis 14 jours, pas de quasi-doublon dans le lot (image retournée
# comprise), slide Sophia sans visage reconnaissable, et des sons
# qui tournent parmi les moins utilisés des 20 dernières livraisons.
#
# Le fichier du jour définit D = [dict(sid, typ, parent, hook, notes, cta, ref,
# insp, items[, cov][, fr])] ; un item est un texte, ou P(texte_base,
# texte_sophia) pour la slide de l'appli. Lance d'abord `npm run images` et
# `npm run label` pour rafraîchir donnees/.
import concurrent.futures as cf, glob, io, json, os, re, subprocess, sys, urllib.request
from PIL import Image, ImageStat

TAGS = " #targetaudience #niche #lifemaxxing #personaldevelopment #selfimprovement"
TAGS_FR = " #developpementpersonnel #confiance #charisme #psychologie #amelioration"
B = "https://mbikecieskoobeizixig.supabase.co/storage/v1/object/public/medias/brut/"
CTA = {"A": "cta A : conseil à la 1re personne", "B": "cta B : avant/après", "C": "cta C : défi « 30 jours »"}
SONS = [
  ("0.5 (slowed)", "https://www.tiktok.com/music/0-5-slowed-7556607956322846737"),
  ("Talk To You", "https://www.tiktok.com/music/talk-to-you-7611595484184856577"),
  ("son original", "https://www.tiktok.com/music/son-original-7652123303897402145"),
  ("original sound", "https://www.tiktok.com/music/original-sound-7636558659853536016"),
  ("original sound", "https://www.tiktok.com/music/original-sound-7525666038534081293"),
  ("cutting up", "https://www.tiktok.com/music/cutting-up-7509290619085522945"),
  ("ENDO SMOKE", "https://www.tiktok.com/music/endo-smoke-7053758651309606914"),
  ("Try", "https://www.tiktok.com/music/try-7533289206400027394"),
  ("Let it burn", "https://www.tiktok.com/music/let-it-burn-7456190184968800272"),
  ("Bad Love (Slowed)", "https://www.tiktok.com/music/bad-love-slowed-7313738119294732290"),
  ("twin tribes monolith Dexter Morgan Super Slow", "https://www.tiktok.com/music/twin-tribes-monolith-dexter-morgan-super-7401614052290169605"),
  ("addiction - Slowed", "https://www.tiktok.com/music/addiction-slowed-7631225786641336336"),
]
# slide Sophia : pas de personne de face
SOPH_OK = ["surf", "wave", "ocean", "back to the camera", "silhouette", "swimming", "underwater", "diving", "laptop",
           "desk", "book", "coffee", "flat lay", "tennis court", "lighthouse", "skyline", "mountain", "landscape",
           "beach", "sunset", "sky", "forest", "lake", "river", "road", "bridge", "building", "field", "clouds", "plate",
           "notebook", "chess", "piano", "guitar", "watch", "sea"]
SOPH_NON = ["edge of a swimming pool", "face", "portrait", "smiling", "looking at the camera", "two people", "three people",
            "group", "woman", "girl", "child", "showroom", "mercedes", "car",
            "superman", "batman", "superhero", "spider", "cape", "costume", "actor", "celebrity", "monk", "yak", "lama"]

# images vues sur un aperçu avec un visage reconnaissable : jamais sur la slide Sophia
SOPH_EXCLUS = {"4d3a1468"}

CACHE = "donnees/cache/empreintes.json"

def P(a, b=None): return (a, b)

def empreintes(images):
  fp = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
  def f(i):
    k = i["id"][:8]
    if k in fp: return k, fp[k]
    try:
      u = i["url"].replace("/object/public/", "/render/image/public/") + "?width=96"
      g = Image.open(io.BytesIO(urllib.request.urlopen(u, timeout=40).read())).convert("L")
      w, h = g.size
      bande = ImageStat.Stat(g.crop((int(w * .08), int(h * .38), int(w * .92), int(h * .62)))).mean[0]
      return k, {"lum": round(bande), "px": list(g.resize((24, 32)).tobytes())}
    except Exception:
      return k, None
  with cf.ThreadPoolExecutor(24) as ex:
    for k, v in ex.map(f, [i for i in images if i["id"][:8] not in fp]):
      if v: fp[k] = v
  os.makedirs(os.path.dirname(CACHE), exist_ok=True)
  json.dump(fp, open(CACHE, "w"))
  return fp

def main():
  ns = {"P": P}
  exec(open(sys.argv[1]).read(), ns)
  D = ns["D"]
  IM = {i["id"][:8]: i for i in json.load(open("donnees/images.json"))}
  LAB = json.load(open("donnees/label.json"))
  LB = {c["id"][:8]: c["id"] for c in LAB}
  COMPTE = {c["id"]: c.get("compte_source") for c in LAB}
  FP = empreintes(list(IM.values()))

  # déjà livré par le podz : les 200 derniers originaux avant ce lot (≈ 14 jours à 13 par jour)
  premier = int(D[0]["sid"][4:])
  avant = sorted(f for f in glob.glob("originaux/ay-o*.json") if int(f[-8:-5]) < premier)[-200:]
  recents = {s["media_id"][:8] for f in avant for s in json.load(open(f))["slides"]}
  exclus = set(ns.get("EXCLUS", []))
  sons20 = [json.load(open(f))["musique_url"] for f in avant[-20:]]

  def leg(k): return (IM[k].get("legende") or "").lower()
  # toute la banque, sans tri de fond (Adrien, 17/11, pods/ROUTINE.md §4) : aucun filtre de contenu
  def ok(k): return True
  def dist(a, b):
    pa, pb = FP[a]["px"], FP[b]["px"]
    fl = [pb[r * 24 + (23 - c)] for r in range(32) for c in range(24)]
    return min(sum(abs(x - y) for x, y in zip(pa, pb)), sum(abs(x - y) for x, y in zip(pa, fl))) / len(pa)
  pris = []
  recents_fp = [k for k in recents if k in FP]
  def libre(k):
    if k not in IM or k not in FP or k in recents or k in exclus or k in pris: return False
    if any(dist(k, t) < 12 for t in pris): return False
    return True
  def lum(k): return FP[k]["lum"]
  couv = sorted([k for k in IM if IM[k]["est_hook"] and k in FP and ok(k)], key=lambda k: (not 12 <= lum(k) < 95, IM[k]["used_count"], k))
  corps = sorted([k for k in IM if not IM[k]["est_hook"] and k in FP and ok(k)], key=lambda k: (IM[k]["used_count"], k))
  soph = sorted([k for k in IM if k in FP and k not in SOPH_EXCLUS and lum(k) < 170  
                 and any(w in leg(k) for w in SOPH_OK) and not any(w in leg(k) for w in SOPH_NON)
                 and not (re.search(r"\b(man|men|person|people|boy|guy|player)\b", leg(k))
                          and not any(w in leg(k) for w in ["back to the camera", "silhouette", "swimming", "underwater", "diving", "surfer"]))],
                key=lambda k: (IM[k]["used_count"], k))
  for d in D:
    if d.get("cov"): pris.append(d["cov"])
  ordre_sons = sorted(range(len(SONS)), key=lambda i: (sons20.count(SONS[i][1]), i))[:7]

  for n, d in enumerate(D):
    if not d.get("cov"):
      d["cov"] = next(k for k in couv if libre(k)); pris.append(d["cov"])
    sk = next(k for k in soph if libre(k)); pris.append(sk)
    son = SONS[ordre_sons[n % len(ordre_sons)]]
    its = d["items"]
    sp = [i for i, it in enumerate(its) if isinstance(it, tuple) and it[1]]
    assert len(sp) == 1, d["sid"]
    slides = [{"position": 1, "media_id": IM[d["cov"]]["id"] if d["cov"] in IM else d["cov"], "texte_overlay": d["hook"],
               "reference_url": f"{B}{d['ref']}/1.jpg"}]
    for i, it in enumerate(its):
      s = {"position": i + 2, "reference_url": f"{B}7689427930929319176/{i + 2}.jpg"}
      if isinstance(it, tuple) and it[1]:
        s["texte_overlay"], s["texte_sophia"], s["media_id"] = it[0], it[1], IM[sk]["id"]
      else:
        k = next(k for k in corps if libre(k)); pris.append(k)
        s["texte_overlay"], s["media_id"] = (it[0] if isinstance(it, tuple) else it), IM[k]["id"]
      slides.append(s)
    for s in slides:
      for kk in ("texte_overlay", "texte_sophia"):
        t = s.get(kk)
        if not t: continue
        assert "—" not in t and ";" not in t, (d["sid"], t)
        if kk == "texte_overlay":
          assert not any(w in ("app", "apps", "appli", "applis") for w in re.split(r"[^\wÀ-ÿ']+", t.lower())), (d["sid"], t)
        if s["position"] > 1 and not (130 <= len(t) <= 220): print("LONGUEUR", d["sid"], s["position"], kk, len(t))
    o = {"source_id": d["sid"], "type_bleo": d["typ"], **({"parent_contenu_id": LB[d["parent"]]} if d.get("parent") else {}),
         "titre": d["hook"].replace("\n", " ") + (TAGS_FR if d.get("fr") else TAGS),
         "musique_titre": son[0], "musique_url": son[1], "inspirations": [LB[d["insp"]]],
         "notes": f"{CTA[d['cta']]}, slide {sp[0] + 2}, sur une image sans visage. Images prises dans toute la banque (règle du 12/11). " + d["notes"],
         "slides": slides}
    p = f"originaux/{d['sid']}.json"
    json.dump(o, open(p, "w"), ensure_ascii=False, indent=1); open(p, "a").write("\n")
  print("ok")

main()
