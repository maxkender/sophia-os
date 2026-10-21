#!/usr/bin/env python3
"""Relevé EN DIRECT des posts TikTok d'un ou plusieurs comptes, via Apify.

Pourquoi : la base ne garde que les vues relevées vers J+2 (`passages.vues`,
`stats_maj_at` ≈ publication + 55 h, jamais remis à jour ensuite). Ce relevé
donne les vues d'aujourd'hui, pour mesurer la traîne d'un post viral ou
vérifier qu'un compte n'est pas bridé (posts à 1-20 vues = non publics ?).

Usage (depuis la racine du dépôt) :
  python3 -I analyse/outils/apify_live.py ella.mindset714 adrian.vega9973 --posts 30

Sortie :
  - analyse/sortie/apify_<date>.json : le détail brut utile (id, vues, likes…)
  - stdout : un bloc SQL `live(tid, vues_live, likes_live, partages_live, saves_live, cree_le)`
    à coller en tête d'une requête (voir requetes/12_traine_live.sql) pour
    rapprocher des passages par l'identifiant numérique du post.

Coût : acteur clockworks~tiktok-scraper, quelques centimes pour 100 posts.
Le jeton Apify est injecté par le proxy de la session : rien à fournir.
"""

import argparse
import datetime as dt
import json
import pathlib
import sys
import time
import urllib.request

ACTEUR = "clockworks~tiktok-scraper"
API = "https://api.apify.com/v2"
RACINE = pathlib.Path(__file__).resolve().parents[1]


def appel(url: str, corps: dict | None = None) -> dict | list:
    requete = urllib.request.Request(
        url,
        data=json.dumps(corps).encode() if corps is not None else None,
        headers={"content-type": "application/json"},
        method="POST" if corps is not None else "GET",
    )
    with urllib.request.urlopen(requete, timeout=60) as reponse:
        return json.load(reponse)


def relever(comptes: list[str], posts: int) -> list[dict]:
    corps = {
        "profiles": comptes,
        "resultsPerPage": posts,
        "shouldDownloadSlideshowImages": False,
        "shouldDownloadVideos": False,
        "shouldDownloadCovers": False,
        "proxyCountryCode": "None",
    }
    # Run asynchrone : le proxy de la session coupe une requête au bout de
    # ~30 s, donc `run-sync-get-dataset-items` échoue (502) dès que le scrape
    # dure un peu. On lance, on attend, puis on lit le dataset.
    run = appel(f"{API}/acts/{ACTEUR}/runs", corps)["data"]
    debut = time.time()
    while run["status"] in ("READY", "RUNNING"):
        if time.time() - debut > 600:
            raise TimeoutError(f"run Apify {run['id']} toujours {run['status']} après 10 min")
        time.sleep(5)
        run = appel(f"{API}/actor-runs/{run['id']}")["data"]
    if run["status"] != "SUCCEEDED":
        raise RuntimeError(f"run Apify {run['id']} : {run['status']}")
    items = appel(f"{API}/datasets/{run['defaultDatasetId']}/items?clean=true")
    sortie = []
    for item in items:
        if not item.get("id"):
            continue
        sortie.append(
            {
                "tid": item["id"],
                "compte": (item.get("authorMeta") or {}).get("name"),
                "url": item.get("webVideoUrl"),
                "cree_le": item.get("createTimeISO"),
                "diaporama": bool(item.get("isSlideshow")),
                "vues": item.get("playCount") or 0,
                "likes": item.get("diggCount") or 0,
                "commentaires": item.get("commentCount") or 0,
                "partages": item.get("shareCount") or 0,
                "saves": item.get("collectCount") or 0,
                "texte": (item.get("text") or "")[:160],
            }
        )
    return sortie


def bloc_sql(posts: list[dict]) -> str:
    if not posts:
        return "-- aucun post relevé"
    lignes = ",\n  ".join(
        f"('{p['tid']}', {p['vues']}, {p['likes']}, {p['partages']}, {p['saves']}, "
        f"'{(p['cree_le'] or '')[:19]}'::timestamp)"
        for p in posts
    )
    return (
        "with live(tid, vues_live, likes_live, partages_live, saves_live, cree_le) as (values\n  "
        + lignes
        + "\n)"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("comptes", nargs="+", help="pseudos TikTok, sans @")
    parser.add_argument("--posts", type=int, default=30, help="posts par compte (défaut 30)")
    args = parser.parse_args()

    comptes = [c.lstrip("@").strip() for c in args.comptes if c.strip()]
    posts = relever(comptes, args.posts)

    dossier = RACINE / "sortie"
    dossier.mkdir(exist_ok=True)
    fichier = dossier / f"apify_{dt.datetime.now():%Y%m%d_%H%M}.json"
    fichier.write_text(json.dumps(posts, ensure_ascii=False, indent=1))

    par_compte: dict[str, int] = {}
    for p in posts:
        par_compte[p["compte"] or "?"] = par_compte.get(p["compte"] or "?", 0) + 1
    print(f"-- {len(posts)} posts relevés {par_compte} → {fichier.relative_to(RACINE.parent)}", file=sys.stderr)
    print(bloc_sql(posts))
    return 0


if __name__ == "__main__":
    sys.exit(main())
