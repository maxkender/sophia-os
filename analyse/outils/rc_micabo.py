#!/usr/bin/env python3
"""Graphiques RevenueCat de MICABO, segmentés (pays par défaut).

La clé RevenueCat injectée par le proxy de la session ne voit QUE le projet
Micabo (`proj415c7a8d`). Les chiffres Sophia, eux, se lisent dans la base
(`rc_metrics_cache`, rafraîchi par `suivi-rc`) : voir requetes/10_rc_sophia.sql.

Usage (depuis la racine du dépôt) :
  python3 -I analyse/outils/rc_micabo.py --chart trials_new --debut 2026-09-29 --fin 2026-10-12
  python3 -I analyse/outils/rc_micabo.py --chart revenue --segment country

Affiche le total par segment (jours incomplets exclus) pour la première mesure
du graphique, puis les autres mesures s'il y en a.
"""

import argparse
import datetime as dt
import json
import sys
import urllib.parse
import urllib.request

PROJET_MICABO = "proj415c7a8d"

# Le nom du graphique part dans le chemin de l'URL : liste blanche, comme
# dans la fonction rc-revenu-pays.
GRAPHIQUES = {
    "revenue",
    "mrr",
    "active_subscriptions",
    "new_customers",
    "conversion_to_paying",
    "initial_conversion",
    "trials_new",
    "trial_conversion_rate",
}


def lire(chart: str, debut: str, fin: str, segment: str, resolution: str) -> dict:
    params = {
        "start_date": debut,
        "end_date": fin,
        "resolution": resolution,
        "segment": segment,
        "limit_num_segments": "25",
        "currency": "EUR",
    }
    url = (
        f"https://api.revenuecat.com/v2/projects/{PROJET_MICABO}/charts/{chart}?"
        + urllib.parse.urlencode(params)
    )
    with urllib.request.urlopen(url, timeout=60) as reponse:
        return json.load(reponse)


def main() -> int:
    aujourdhui = dt.date.today()
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--chart", default="trials_new", choices=sorted(GRAPHIQUES))
    parser.add_argument("--debut", default=str(aujourdhui - dt.timedelta(days=14)))
    parser.add_argument("--fin", default=str(aujourdhui - dt.timedelta(days=1)))
    parser.add_argument("--segment", default="country")
    parser.add_argument("--resolution", default="0", help="0 = jour, 1 = semaine, 2 = mois")
    args = parser.parse_args()

    donnees = lire(args.chart, args.debut, args.fin, args.segment, args.resolution)
    segments = donnees.get("segments") or []
    mesures = donnees.get("measures") or [{"display_name": "valeur"}]

    for i, mesure in enumerate(mesures):
        totaux: dict[str, float] = {}
        for v in donnees.get("values", []):
            if v.get("incomplete") or v.get("measure") != i:
                continue
            idx = v.get("segment", 0)
            nom = segments[idx].get("display_name") if idx < len(segments) else str(idx)
            totaux[nom] = totaux.get(nom, 0) + (v.get("value") or 0)
        print(f"# {args.chart} · {mesure.get('display_name')} · {args.debut} → {args.fin}")
        for nom, total in sorted(totaux.items(), key=lambda x: -x[1]):
            print(f"  {nom}: {round(total, 2)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
