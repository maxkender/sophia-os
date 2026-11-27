# Podz 36 — Originaux art_histoire (Artura)

Atelier du podz 36, lancé par Adrien le 27/11 (« fais des podz posts
originaux de adhd … art_histoire pour artura »). Module **isolé** du reste de
l'OS : ses propres dépendances (`package.json`), aucun import depuis `src/` ni
`supabase/`. L'agent suit `AGENT.md` ; `ANALYSE.md` analyse le compte modèle.

## Ce qu'il fait

Des **originaux en texte**, en français, aux formats de
[@glacis1](https://www.tiktok.com/@glacis1) (un tableau, une histoire, un
détail par slide ; le peintre), posés sur des **tableaux du domaine public du
Met** recadrés en détails 9:16 et ajoutés à la banque du label `art-histoire`
(migration 0873). **Aucune slide d'appli** : l'OS traduit le texte pour les
comptes du label (24 langues) et y place **Artura** lui-même. BLEO, voie 1.
Aucune image générée.

```
atelier/
  api.ts            constantes du podz (originaux_art_histoire, fr), appels à la fonction `pods`
  cli-tableau.ts    un tableau du Met : grille, détails 9:16, ajout à la banque du label
  metadonnees.ts    JPEG sans métadonnées (la banque les refuse)
  cli-deposer.ts    contrôles (4 à 10 slides, banque, longueurs, aucune appli) et dépôt
  cli-apercu.ts     le texte posé sur les images, à regarder avant de déposer
  cli-*.ts          boite, label, images, top-posts, doublons, etat, suivi (repris du pod 12)
originaux/ah-NNN.json   les originaux (versionnés)
```
