# Podz 29 — Originaux @mariadianatudor (Artura)

Atelier du podz 29, lancé par Adrien le 25/11 : le premier podz 100 % podz
d'**Artura** seule. Module **isolé** du reste de l'OS : ses propres
dépendances (`package.json`), aucun import depuis `src/` ni `supabase/`.
L'agent suit `AGENT.md` ; `ANALYSE.md` analyse le compte modèle.

## Ce qu'il fait

Des originaux en anglais au style exact de
[@mariadianatudor](https://www.tiktok.com/@mariadianatudor) : « Paintings That
Devour My Soul » (couverture sombre au musée, puis un tableau par slide sur
fond blanc cassé en TikTok Sans : le titre de l'œuvre, le tableau à gauche, un
paragraphe qui continue le titre, l'artiste dessous). Une des œuvres cite
**Artura** dans son paragraphe, avec son **logo** posé dessous, jamais une
capture. Les tableaux sont de vraies œuvres du domaine public (Met Open
Access, CC0). Les slides finies partent au label `mariadiana_art` (Artura
seule, 0861). Infra reprise des podz 27 et 28.

```
atelier/
  api.ts            constantes du podz (originaux_mariadiana, Artura, en), appels à la fonction `pods`
  slides.ts         le rendu : couverture, œuvre, slide Artura (logo)
  polices.ts        TikTok Sans Regular et Medium (OFL)
  cli-oeuvre.ts     cherche et garde une œuvre du domaine public au Met (bords noirs retirés)
  cli-image.ts      (abandonné le 27/11 : jamais d'image IA)
  cli-*.ts          veille, photos, rendu, livrer, etat, boite
assets/artura/      l'icône d'Artura (envoyée par Adrien le 24/11)
images/oeuvres/     les tableaux (fiche de chacun dans `oeuvres` du post)
images/photos/      anciennes couvertures IA (ne plus utiliser) ; images/banque/ : les couvertures, vraies photos de la banque
posts/md-NNN.json   les originaux (versionnés)
sources/manifeste.json  son post : la preuve
```
