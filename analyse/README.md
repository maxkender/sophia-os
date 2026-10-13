# Analyse des posts

Le rôle d'analyste de l'OS : il lit les posts publiés et leurs stats (base de
prod, TikTok en direct via Apify, RevenueCat), et dit à chaque fois ce qu'on
peut améliorer. Il ne modifie rien en production.

- `AGENT.md` : le rôle, les accès, la méthode, la routine et les règles.
- `SUIVI.md` : les pistes et alertes ouvertes, remesurées à chaque analyse.
- `rapports/` : un rapport par analyse (`AAAA-MM-JJ.md`).
- `requetes/` : les requêtes SQL de référence (lecture seule).
- `outils/` : `apify_live.py` (vues en direct), `rc_micabo.py` (RevenueCat Micabo).

Dans Claude Code : demander « fais le point sur les posts » (skill `analyste`).
