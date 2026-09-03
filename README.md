# Sophia — Moteur de contenu TikTok

Application interne : des posters freelances publient chaque jour des carrousels
TikTok faisant la promotion de l'appli Sophia (culture générale). Le moteur
extrait la matière des comptes de référence de l'entreprise, la nettoie, la
traduit, y place l'appli Sophia, et assigne les posts aux posters.

## Démarrage

```bash
npm install
cp .env.example .env   # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```

## Le moteur

Quatre Edge Functions, chacune volontairement courte : une fonction Supabase ne
survit pas à des dizaines d'appels Gemini d'affilée, donc le travail avance par
petits lots et le cron reprend là où il s'est arrêté.

| Fonction | Rôle |
|---|---|
| `extraction` | Scrape un compte de référence via Apify, rapatrie les visuels, crée un `sujet` par post. Aucun appel IA. |
| `preparation` | Par passage : OCR du visuel brut, puis notation de pertinence, puis nettoyage vers la bibliothèque. |
| `composition` | Traduit tout le deck d'une traite, place l'appli Sophia sur une slide, crée le post. |
| `assignation` | Complète la journée de chaque compte selon les ratios. Idempotente. |

L'ordre de `preparation` est délibéré : la pertinence est jugée **avant** tout
nettoyage, pour ne pas payer du Gemini sur un sujet hors-sujet.

Deux appelants autorisés : pg_cron via l'en-tête `x-cron-secret`, ou un admin
depuis l'interface via son JWT (le rôle est revérifié côté serveur).

## Règles produit tenues par la base

- Le compte de référence est **admin-only** en RLS : un poster ne peut pas
  remonter à la source de sa matière, même en forgeant une requête.
- `media_library.visage_identifiable` : tout visuel entrant est examiné, le
  doute vaut refus, et seuls les visuels sans visage sont proposés comme avatar.
- Les ratios (60/20/20), la fréquence et la règle de semaine 1 vivent dans
  `reglages` et s'éditent depuis l'admin. Rien n'est figé dans le code.

## Secrets

Côté Supabase (jamais dans le dépôt ni le bundle) : `APIFY_TOKEN`,
`GEMINI_API_KEY`, `CRON_SECRET`, `REVENUECAT_SECRET_API_KEY` (API v2, permission
`charts_metrics:charts:read` — page admin « Suivi metrics RC »). Optionnel :
`REVENUECAT_PROJECT_ID` (défaut projet Sophia). Côté client, uniquement l'URL
du projet et la clé anon.

## Points ouverts

- **Métriques** : le recyclage « sur les meilleures perfs » suppose de scraper
  les comptes des posters. Tant que `post_metrics` est vide, le recyclage
  retombe sur une composition normale.
- **Fuseau horaire** : pg_cron tourne en UTC sans fuseau par job ; les heures
  visent Paris en été et décalent d'une heure en hiver.
- Génération IA de la persona (nom, bio) à la création d'un compte.
