# Le CTA dans la réécriture native

*Mis à jour le 30/10 (migration 0624). Page Admin → Config → Fiches.*

Le CTA est la slide qui amène l'appli (Sophia, micabo ou UnSwipe) dans un
slideshow. L'appel unique de la réécriture native l'écrit à partir de quatre
fiches :

| Fiche | Une par | Ce qu'elle dit |
|---|---|---|
| **CTA** | (une seule, `cle = 'commune'`) | L'intro : la règle d'or (un vrai conseil, l'appli fondue dedans), la cohérence avec le deck (même moule, même mode, même voix, le fil de l'histoire), le choix de la slide (jamais avant la slide 4), les interdits, la checklist |
| **Appli** | appli | Quoi dire : ce que fait l'appli, ce qu'on peut affirmer, comment la nommer, les idées de conseil où elle s'insère |
| **Langue** | langue | Comment un natif le dit |
| **Label** | label | L'angle de placement de Maximilien (ce que l'appli apporte selon le sujet du post, le ton, le persona), puis où va l'appli dans ce type de deck : le format, sa place habituelle, 3 à 5 exemples réels de placements réussis, ce qu'il faut éviter |

Les fiches CTA, langue et label sont en anglais, avec les exemples et les mots
natifs cités tels quels. Elles sont versionnées dans `bleo_fiches` (une
nouvelle version à chaque enregistrement, les anciennes restent) et s'écrivent
dans la page Fiches.

## Décision du 30/10 : plus de stats ni de forme tirée

Les vues ne peuvent pas juger un CTA : elles se comptent dès que le post
s'affiche, alors que le CTA n'arrive qu'à la slide 4 ou plus loin. Les écarts
mesurés par forme et par slide en 0621 (± 5 à 8 %) n'étaient que du bruit.
Pour juger un CTA, il faudrait les installations par post, qu'on n'a pas.

Donc, depuis 0624 :
- **plus de calcul du lundi** : la tâche `cta-lundi`, la table `cta_stats` et
  la fonction `cta_agregats()` sont supprimées ;
- **plus de forme tirée par l'OS**, ni pondérée ni au hasard : Gemini écrit le
  CTA en suivant la fiche CTA et les exemples de la fiche label ;
- **la fiche label est écrite**, plus calculée. Le premier jet de chaque label
  (0625) part de deux sources : l'angle de placement actif de Maximilien
  (`angles_placement`), cité tel quel, et nos posts publiés des 60 derniers
  jours. À relire et corriger dans la page Fiches.

Attention, deux sources pour un même angle : `angles_placement` sert encore au
prompt de placement actuel, et la fiche label en garde une copie. Quand un
angle change, il faut aussi mettre la fiche label à jour, jusqu'à ce que
l'appel unique remplace le circuit actuel.

Ce qui reste imposé par l'OS, deck par deck : la slide, quand l'original
recommandait une appli concurrente (`reprise`) ou quand le pod a marqué la
slide de l'appli (`marquee`). Le reste, Gemini le choisit avec les fiches.

## Le classement des CTA publiés (gardé, sans tâche planifiée)

Entre 0621 et 0624, Gemini a rangé chaque texte de CTA publié dans une des 7
formes ci-dessous (`cta_formes`, une ligne par texte). Ce classement ne pilote
plus rien. Il reste une aide pour trouver des exemples variés quand on écrit
une fiche label. On peut le relancer à la main (`{ classer: {} }` sur la
fonction `cta-formes`) ; il n'y a plus de tâche planifiée.

| Code | Forme | Ce que c'est |
|---|---|---|
| `format_du_post` | Dans le format du post | L'appli glissée dans le gabarit propre au post : définition et exemple, ❌ / ✅, jour N, tier list, question-réponse |
| `avant_apres` | Avant / après | Un récit à la 1re personne : un problème ou un déclic, puis ce qui a changé avec l'appli |
| `habitude_perso` | Mon habitude | « j'utilise l'appli … tous les matins » : le créateur s'en sert, au présent |
| `ce_quils_font` | Ce que font les autres | À la 3e personne : les gens qu'on admire, l'appli parmi leurs habitudes |
| `mention_breve` | Mention brève | L'appli citée en une ligne, sans argument ni histoire |
| `quand_tu` | Le problème, puis l'appli | « quand tu … : l'appli … », hors d'une liste de conseils |
| `point_liste` | Un point de la liste | L'appli est l'un des conseils du post, adressé au lecteur, souvent numéroté |

La slide du CTA de chaque post publié est déjà notée : c'est la slide marquée
`position_sophia` dans `passages.slides`. La vue `cta_ctas_publies` la lit,
avec la slide d'avant.

## Historique

- **0621** (30/10) : les 7 formes, le classement, les stats à contenu égal et
  les fiches label calculées chaque lundi.
- **0622** (30/10) : `cta_agregats()` accélérée (2 s au lieu de 12).
- **0623** (30/10) : la fiche CTA commune (session de coordination).
- **0624** (30/10) : plus de stats ni de tirage ; fiches label écrites.
- **0625** (30/10) : premier jet des fiches label, tiré de nos posts publiés.
