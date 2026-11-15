#!/usr/bin/env python3
"""Les outils TikTok de l'agent éclaireur (acteur Apify clockworks~tiktok-scraper).

Trois commandes, à lancer depuis la racine du dépôt :

  python3 -I eclaireur/outils/apify.py chercher --pays DE --reste 12.5 "Lernmethoden" "Abi Tipps"
      Recherche par mots-clés (section Top). Rend les COMPTES qui publient des
      slideshows, pas les posts : un compte trouvé dix fois compte une fois.

  python3 -I eclaireur/outils/apify.py profils --pays DE --reste 12.5 --posts 12 compte1 compte2
      Relève les derniers posts de chaque compte : part de slideshows, vues,
      taille du catalogue, date du dernier slideshow.

  python3 -I eclaireur/outils/apify.py planche compte1 compte2 compte3
      Gratuit. Assemble les 5 premières slides du meilleur slideshow de chaque
      compte (déjà relevé) en une image à lire. `--rang 2` prend le deuxième.

`--reste` est obligatoire pour les deux commandes payantes : c'est ce qu'il reste
du budget du jour (`select public.sources_eclaireur_budget();`). La commande
estime son coût et refuse de partir s'il dépasse le reste.

Le brut est gardé dans eclaireur/sortie/ (hors git). Chaque commande payante
finit par une ligne « JOURNAL » : c'est ce qu'il faut écrire dans
`sources_recherches`.

Le jeton Apify est injecté par le proxy de la session : rien à fournir.
"""

import argparse
import concurrent.futures as cf
import datetime as dt
import io
import json
import pathlib
import statistics
import sys
import time
import urllib.request

ACTEUR = "clockworks~tiktok-scraper"
API = "https://api.apify.com/v2"
SORTIE = pathlib.Path(__file__).resolve().parents[1] / "sortie"
# Mesuré le 12/11 sur 3 465 posts : 0,0031 $ le post. On estime un peu au-dessus.
USD_PAR_POST = 0.0035
SANS_TELECHARGEMENT = {
    "shouldDownloadVideos": False,
    "shouldDownloadCovers": False,
    "shouldDownloadSlideshowImages": False,
}


def appel(url: str, corps: dict | None = None):
    requete = urllib.request.Request(
        url,
        data=json.dumps(corps).encode() if corps is not None else None,
        headers={"content-type": "application/json"},
        method="POST" if corps is not None else "GET",
    )
    with urllib.request.urlopen(requete, timeout=120) as reponse:
        return json.load(reponse)


def lancer(entree: dict, attendus: int, reste: float) -> tuple[list[dict], float]:
    """Lance un run, attend sa fin, rend (items, coût en $)."""
    estime = attendus * USD_PAR_POST
    if estime > reste:
        sys.exit(f"REFUS : environ {estime:.2f} $ pour {attendus} posts, il reste {reste:.2f} $ aujourd'hui.")
    # Asynchrone : le proxy de la session coupe une requête au bout de ~30 s.
    run = appel(f"{API}/acts/{ACTEUR}/runs", entree)["data"]
    debut = time.time()
    while run["status"] in ("READY", "RUNNING"):
        if time.time() - debut > 1500:
            sys.exit(f"Le run Apify {run['id']} tourne encore après 25 min : relis-le plus tard, ne le relance pas.")
        time.sleep(10)
        run = appel(f"{API}/actor-runs/{run['id']}")["data"]
    if run["status"] != "SUCCEEDED":
        sys.exit(f"Run Apify {run['id']} : {run['status']}")
    items, debut_lot = [], 0
    while True:
        lot = appel(f"{API}/datasets/{run['defaultDatasetId']}/items?clean=true&limit=1000&offset={debut_lot}")
        items += lot
        if len(lot) < 1000:
            break
        debut_lot += 1000
    # Apify chiffre un run quelques secondes après sa fin (vu le 12/11 : 0,00 $
    # pour 40 posts). On relit, et à défaut on compte au tarif mesuré, pour que
    # le budget du jour ne soit jamais sous-estimé.
    cout = float(run.get("usageTotalUsd") or 0)
    for _ in range(3):
        if cout > 0 or not items:
            break
        time.sleep(5)
        cout = float(appel(f"{API}/actor-runs/{run['id']}")["data"].get("usageTotalUsd") or 0)
    if cout == 0 and items:
        cout = len(items) * 0.0031
    return items, cout


def garder(sorte: str, items: list[dict]) -> pathlib.Path:
    dossier = SORTIE / dt.date.today().isoformat()
    dossier.mkdir(parents=True, exist_ok=True)
    chemin = dossier / f"{dt.datetime.now():%H%M%S}_{sorte}.json"
    chemin.write_text(json.dumps(items))
    return chemin


def pseudo(item: dict) -> str | None:
    """Un profil introuvable revient sans `authorMeta` : on le saute."""
    auteur = item.get("authorMeta")
    return auteur["name"].lower() if auteur and auteur.get("name") else None


def vues(n: int | None) -> str:
    return "—" if n is None else f"{n:,}".replace(",", " ")


def legende(item: dict, longueur: int = 70) -> str:
    return (item.get("text") or "").replace("\n", " ")[:longueur]


def url_photo(compte: str, identifiant: str) -> str:
    # `webVideoUrl` dit toujours /video/, même pour un slideshow.
    return f"https://www.tiktok.com/@{compte}/photo/{identifiant}"


def journal(sorte: str, pays: str, requete: str | None, items: list[dict], cout: float, extra: dict) -> None:
    ligne = {
        "sorte": sorte,
        "pays": pays,
        "requete": requete,
        "posts": len(items),
        "slideshows": sum(1 for i in items if i.get("isSlideshow")),
        "cout_usd": round(cout, 2),
        **extra,
    }
    print("JOURNAL " + json.dumps(ligne, ensure_ascii=False))


def chercher(args) -> None:
    requetes = args.cibles
    items, cout = lancer(
        {"searchQueries": requetes, "resultsPerPage": args.par, "proxyCountryCode": args.pays, **SANS_TELECHARGEMENT},
        len(requetes) * args.par,
        args.reste,
    )
    chemin = garder("recherche", items)
    comptes: dict[str, dict] = {}
    for item in items:
        nom = pseudo(item)
        if not nom or not item.get("isSlideshow"):
            continue
        c = comptes.setdefault(
            nom,
            {"abonnes": item["authorMeta"].get("fans"), "bio": (item["authorMeta"].get("signature") or "").replace("\n", " ")[:60], "posts": [], "requetes": set()},
        )
        c["posts"].append(item)
        if item.get("searchQuery"):
            c["requetes"].add(item["searchQuery"])
    print(f"{len(items)} posts, {sum(len(c['posts']) for c in comptes.values())} slideshows, {len(comptes)} comptes · {cout:.2f} $ · {chemin}")
    for nom, c in sorted(comptes.items(), key=lambda kv: -max(p.get("playCount") or 0 for p in kv[1]["posts"])):
        meilleur = max(c["posts"], key=lambda p: p.get("playCount") or 0)
        print(
            f"@{nom} | {vues(c['abonnes'])} abonnés | {len(c['posts'])} slideshow(s) trouvé(s) | meilleur {vues(meilleur.get('playCount'))} vues"
            f" le {meilleur['createTimeISO'][:10]} | langue {meilleur.get('textLanguage')} | {' ; '.join(sorted(c['requetes']))}"
        )
        print(f"    {url_photo(nom, meilleur['id'])} · {legende(meilleur)} · bio : {c['bio']}")
    # À coller dans la requête des comptes déjà connus (AGENT.md, étape 3).
    print("PSEUDOS " + " ".join(sorted(comptes)))
    for requete in requetes:
        trouves = [i for i in items if i.get("searchQuery") == requete]
        if not trouves:
            # TikTok bloque une partie des recherches (« HTTP 200 with an empty body »,
            # vu le 12/11) : zéro post ne dit rien de la requête. À relancer une
            # fois plus tard, et à ne pas écrire dans le journal.
            print(f"BLOQUÉE {requete!r} : aucun post rendu, la requête n'a pas été servie.")
            continue
        journal(
            "recherche",
            args.pays,
            requete,
            trouves,
            cout * len(trouves) / max(len(items), 1),
            {"comptes": len({pseudo(i) for i in trouves if i.get("isSlideshow") and pseudo(i)})},
        )


def fiche(nom: str, posts: list[dict]) -> dict:
    auteur = posts[0]["authorMeta"]
    slideshows = [p for p in posts if p.get("isSlideshow")]
    v = sorted((p.get("playCount") or 0) for p in slideshows)
    return {
        "compte": nom,
        "abonnes": auteur.get("fans"),
        "posts_total": auteur.get("video"),
        "bio": (auteur.get("signature") or "").replace("\n", " ")[:80],
        "lien": auteur.get("bioLink"),
        "posts": len(posts),
        "slideshows": len(slideshows),
        "vues_mediane": int(statistics.median(v)) if v else None,
        "vues_max": v[-1] if v else None,
        "posts_10k": sum(x >= 10_000 for x in v),
        "posts_100k": sum(x >= 100_000 for x in v),
        "dernier_slideshow": max(p["createTimeISO"] for p in slideshows)[:10] if slideshows else None,
        "premier_slideshow": min(p["createTimeISO"] for p in slideshows)[:10] if slideshows else None,
        "langues": sorted({p.get("textLanguage") for p in slideshows if p.get("textLanguage")}),
        "top": [
            {"id": p["id"], "url": url_photo(nom, p["id"]), "vues": p.get("playCount"), "slides": len(p.get("slideshowImageLinks") or []), "legende": legende(p)}
            for p in sorted(slideshows, key=lambda p: -(p.get("playCount") or 0))[:3]
        ],
    }


def profils(args) -> None:
    comptes = [c.lstrip("@").lower() for c in args.cibles]
    items, cout = lancer(
        {"profiles": comptes, "resultsPerPage": args.posts, "profileSorting": "latest", "proxyCountryCode": args.pays, **SANS_TELECHARGEMENT},
        len(comptes) * args.posts,
        args.reste,
    )
    chemin = garder("profils", items)
    par_compte: dict[str, list[dict]] = {}
    for item in items:
        nom = pseudo(item)
        if nom:
            par_compte.setdefault(nom, []).append(item)
    introuvables = [c for c in comptes if c not in par_compte]
    print(f"{len(items)} posts, {len(par_compte)} comptes · {cout:.2f} $ · {chemin}")
    fiches = sorted((fiche(n, p) for n, p in par_compte.items()), key=lambda f: -(f["vues_mediane"] or 0))
    for f in fiches:
        print(
            f"@{f['compte']} | {vues(f['abonnes'])} abonnés | {f['posts_total']} posts en tout | {f['slideshows']} slideshows sur {f['posts']}"
            f" | médiane {vues(f['vues_mediane'])} | meilleur {vues(f['vues_max'])} | {f['posts_10k']} ≥ 10 000, {f['posts_100k']} ≥ 100 000"
            f" | du {f['premier_slideshow']} au {f['dernier_slideshow']} | {','.join(f['langues'])} | {f['bio']}"
        )
        for t in f["top"]:
            print(f"    {vues(t['vues'])} vues · {t['slides']} slides · {t['url']} · {t['legende']}")
    if introuvables:
        print("INTROUVABLES " + " ".join(introuvables))
    (chemin.with_suffix(".fiches.json")).write_text(json.dumps(fiches, ensure_ascii=False, indent=1))
    journal("profils", args.pays, None, items, cout, {"comptes": len(par_compte)})


def planche(args) -> None:
    from PIL import Image, ImageDraw  # seulement ici : les relevés n'en ont pas besoin

    largeur, hauteur, par_bande = 240, 427, 5
    posts: dict[str, dict[str, dict]] = {}
    for chemin in sorted(SORTIE.glob("*/*.json")):
        if chemin.name.endswith(".fiches.json"):
            continue
        for item in json.loads(chemin.read_text()):
            nom = pseudo(item)
            if nom and item.get("isSlideshow"):
                posts.setdefault(nom, {})[item["id"]] = item

    def image(lien: str):
        try:
            requete = urllib.request.Request(lien, headers={"User-Agent": "Mozilla/5.0"})
            im = Image.open(io.BytesIO(urllib.request.urlopen(requete, timeout=40).read())).convert("RGB")
            im.thumbnail((largeur, hauteur))
            return im
        except Exception:  # un lien signé expire : la case reste blanche
            return None

    bandes = []
    for cible in args.cibles:
        nom = cible.lstrip("@").lower()
        classes = sorted(posts.get(nom, {}).values(), key=lambda p: -(p.get("playCount") or 0))
        if len(classes) < args.rang:
            print(f"@{nom} : pas de slideshow relevé à ce rang (lance d'abord `profils`).")
            continue
        post = classes[args.rang - 1]
        liens = [(x.get("downloadLink") or x.get("tiktokLink")) for x in (post.get("slideshowImageLinks") or [])][:par_bande]
        with cf.ThreadPoolExecutor(par_bande) as ex:
            images = list(ex.map(image, liens))
        bande = Image.new("RGB", (largeur * par_bande, hauteur + 22), "white")
        ImageDraw.Draw(bande).text(
            (4, 4),
            f"@{nom}  {vues(post.get('playCount'))} vues  {len(post.get('slideshowImageLinks') or [])} slides  {post['createTimeISO'][:10]}  {post['id']}",
            fill="black",
        )
        for i, im in enumerate(images):
            if im:
                bande.paste(im, (i * largeur, 22))
        bandes.append(bande)
    if not bandes:
        sys.exit("Rien à assembler.")
    dossier = SORTIE / dt.date.today().isoformat()
    dossier.mkdir(parents=True, exist_ok=True)
    feuille = Image.new("RGB", (largeur * par_bande, sum(b.height for b in bandes)), "white")
    y = 0
    for bande in bandes:
        feuille.paste(bande, (0, y))
        y += bande.height
    chemin = dossier / f"planche_{dt.datetime.now():%H%M%S}.jpg"
    feuille.save(chemin, quality=82)
    print(chemin)


def main() -> None:
    parseur = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sous = parseur.add_subparsers(dest="commande", required=True)
    for nom, fonction in (("chercher", chercher), ("profils", profils)):
        p = sous.add_parser(nom)
        p.add_argument("cibles", nargs="+")
        p.add_argument("--pays", required=True, help="pays du proxy, en deux lettres (DE, IT, TR, ES, MX, US…)")
        p.add_argument("--reste", type=float, required=True, help="ce qu'il reste du budget du jour, en $")
        p.set_defaults(fonction=fonction)
    sous.choices["chercher"].add_argument("--par", type=int, default=20, help="résultats par mot-clé (20 par défaut)")
    sous.choices["profils"].add_argument("--posts", type=int, default=12, help="derniers posts par compte (12 par défaut, 40 pour un finaliste)")
    p = sous.add_parser("planche")
    p.add_argument("cibles", nargs="+")
    p.add_argument("--rang", type=int, default=1, help="1 = le meilleur slideshow du compte, 2 = le deuxième…")
    p.set_defaults(fonction=planche)
    args = parseur.parse_args()
    args.fonction(args)


if __name__ == "__main__":
    main()
