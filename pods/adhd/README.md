# Podz 35 — Originaux adhd (Artura)

Atelier du podz 35, lancé par Adrien le 27/11 (« fais des podz posts
originaux de adhd … pour artura »). Module **isolé** du reste de l'OS : ses
propres dépendances (`package.json`), aucun import depuis `src/` ni
`supabase/`. L'agent suit `AGENT.md` ; `ANALYSE.md` analyse le compte modèle.

## Ce qu'il fait

Des **originaux en texte**, en anglais, aux formats de
[@fraserparkinson0](https://www.tiktok.com/@fraserparkinson0) (listes
relatables, Fake vs Real, hacks, comportements expliqués), posés sur la
**banque d'images propres du label `adhd`** (migration 0872). Comme le pod 12
au temps de micabo : **aucune slide d'appli**, l'OS traduit le texte pour les
comptes du label (17 langues) et y place **Artura** lui-même. BLEO, voie 1.

```
atelier/
  api.ts            constantes du podz (originaux_adhd, en), appels à la fonction `pods`
  cli-deposer.ts    contrôles (4 à 10 slides, banque, longueurs, aucune appli, aucun médicament) et dépôt
  cli-apercu.ts     le texte posé sur les images, à regarder avant de déposer
  cli-*.ts          boite, label, images, top-posts, doublons, etat, suivi (repris du pod 12)
originaux/ad-NNN.json   les originaux (versionnés)
```
