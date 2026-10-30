# Le CTA mesurable (réécriture native, étape 4)

*Mise en place le 30/10. Migration 0621, fonction `cta-formes`, onglet
Admin → Relecture native → « CTA ».*

Le CTA est la phrase qui amène l'appli (Sophia, micabo ou UnSwipe) dans un
slideshow. Pour savoir quels CTA marchent, il faut trois choses :
- une liste fixe de formes, sinon rien ne se compte ;
- la forme et la slide de chaque CTA publié ;
- une comparaison chaque lundi, à contenu égal, qui donne les poids du tirage.

Rien ici ne change un post. À l'étape 5, la réécriture native lira ces poids
pour tirer la voie et la forme de chaque deck.

## Les 7 formes

Elles sont classées dans l'ordre de priorité : un CTA qui relève de deux formes
prend la première de la liste.

| # | Code | Forme | Ce que c'est |
|---|---|---|---|
| 1 | `format_du_post` | Dans le format du post | L'appli glissée dans le gabarit propre au post : définition et exemple, ❌ / ✅, jour N, tier list, question-réponse |
| 2 | `avant_apres` | Avant / après | Un récit à la 1re personne : un problème ou un déclic, puis ce qui a changé avec l'appli |
| 3 | `habitude_perso` | Mon habitude | « j'utilise l'appli … tous les matins » : le créateur s'en sert, au présent |
| 4 | `ce_quils_font` | Ce que font les autres | À la 3e personne : les gens qu'on admire, l'appli parmi leurs habitudes |
| 5 | `mention_breve` | Mention brève | L'appli citée en une ligne, sans argument ni histoire |
| 6 | `quand_tu` | Le problème, puis l'appli | « quand tu … : l'appli … », hors d'une liste de conseils |
| 7 | `point_liste` | Un point de la liste | L'appli est l'un des conseils du post, adressé au lecteur, souvent numéroté |

On ne tire jamais `autre` : c'est seulement l'étiquette d'un CTA que le
classement n'a pas su ranger.

La liste vient de la lecture de vrais CTA publiés, en français et en anglais,
sur 30 jours. Elle est définie dans `supabase/functions/_shared/formes_cta.ts`,
avec une copie dans `src/features/relectureNative/formesCta.ts`. Un test
vérifie que les deux copies restent identiques. Pour changer la liste, il faut
aussi changer la contrainte de `cta_formes.forme` (0621).

## Décision du 30/10 : le CTA à partir de la slide 4

Le CTA va n'importe où à partir de la slide 4 (`SLIDE_CTA_MIN`). Il n'est plus
limité aux 3 dernières slides. On avait mesuré −4,8 points quand il tombe dans
les 3 premières.

Cette règle vaut pour la réécriture native, à partir de l'étape 3. Les prompts
de placement actuels (`placement_<appli>` : « dans les 3 dernières ») ne
changent pas tant que la production n'a pas basculé.

## La slide du CTA : pas de colonne à ajouter

Chaque slide d'un post publié porte un drapeau `position_sophia`, à vrai sur la
slide de l'appli, quelle que soit l'appli. Sur 45 jours, les 13 458 posts
publiés ont tous exactement une slide marquée. La slide du CTA est donc déjà
connue pour chaque post : la vue `cta_ctas_publies` la lit dans `slides`, avec
le nombre de slides.

Une colonne `slide_cta` serait une copie de cette information, et une copie
peut diverger. On n'en ajoute pas.

## Le classement des CTA publiés

- La vue `cta_a_classer` liste chaque texte de CTA publié depuis 45 jours qui
  n'est pas encore classé. Un texte est identifié par le md5 du texte en
  minuscules.
- La tâche planifiée `cta-classer` tourne toutes les 2 minutes, mais seulement
  s'il reste des textes à classer. Elle appelle `cta-formes {classer}` : 360
  textes par passage, 40 par appel Gemini.
- Chaque forme est rangée une fois pour toutes dans `cta_formes`.
- Le démarrage a environ 10 800 textes à classer, soit une heure. Ensuite, la
  tâche ne classe plus que les nouveaux CTA publiés.

## La comparaison à contenu égal

`cta_agregats()` part des posts mûrs de la fenêtre de `reglages.bleo.mesure` :
45 jours, au moins 72 h, hors rappels. Le `r` d'un post est ses vues divisées
par la médiane de son compte (`bleo_mediane_compte`), plafonné à 20.

- **L'effet d'une forme**, d'une slide ou d'une voie se calcule ainsi :
  1. pour chaque post, on prend l'écart entre son r et la moyenne des autres
     versions du même contenu (autres langues, autres comptes), en log ;
  2. on fait la moyenne de ces écarts sur les posts de la forme ;
  3. on la repasse en ratio.

  Un effet de 1,08 veut dire +8 % de vues à contenu égal.
- **Seuls comptent les contenus où la dimension varie.** Un contenu qui a la
  même forme dans toutes ses langues ne dit rien sur les formes.
- **Pourquoi pas une médiane de r relatifs.** On l'a essayée le 30/10 : elle
  tombe pile sur 1 dès qu'un contenu a 2 ou 3 posts, et ne montrait rien.
- **Autres chiffres donnés** : le r médian, la part de percées (r ≥ 3), le
  nombre de posts et de contenus.
- **Les dimensions** :
  - `forme` ;
  - `slide` (1 à 7, puis 8+) ;
  - `place` : slides 1 à 3, milieu, avant-dernière, dernière ;
  - `voie` : `voie_cta` du post, vide tant que le tirage n'existe pas.
- **Par label et par appli**, plus une ligne « tous labels » (`*`) par appli,
  qui sert de repli.

## Le lundi : les poids du tirage et les fiches label

La tâche planifiée `cta-lundi` tourne le lundi à 05 h 30 UTC. Le bouton
« Calculer maintenant » de l'onglet CTA fait la même chose. Elle appelle
`cta-formes {lundi}`, qui fait trois choses.

1. **Le statut et le poids de chaque forme**, pour chaque label et chaque appli :
   - **Prouvée** : au moins 20 posts et un effet d'au moins 1.
   - **À éviter** : au moins 20 posts et un effet sous 0,85. Elle n'est jamais
     tirée.
   - **Essai** : tout le reste, c'est-à-dire pas assez de posts ou un effet
     entre les deux seuils.
   - **Partage du tirage** : les prouvées se partagent 80 % au prorata de leur
     effet. Les essais se partagent 20 % à parts égales : l'essai ne descend
     jamais sous 20 %.
   - **Sans preuve pour le label**, on prend les formes prouvées de l'appli
     tous labels confondus. Sans preuve du tout, le tirage est égal entre les
     formes.
2. **Les chiffres dans `cta_stats`**, une ligne par semaine, label, appli,
   dimension et valeur. Pour les formes, la ligne porte aussi le statut et le
   poids. C'est ce que lira le tirage de l'étape 5.
3. **Une nouvelle version de chaque fiche label** dans `bleo_fiches` (sorte
   `label`, auteur `cta-lundi`). Pour chaque appli, elle contient :
   - le tirage ;
   - le tableau des formes (posts, effet, percée, confiance, statut) ;
   - la slide du CTA et sa place ;
   - les voies ;
   - le journal des changements de statut depuis la semaine précédente.

   La confiance est forte à partir de 60 posts, moyenne de 20 à 59 posts, et
   faible en dessous.

## Ce qui reste pour l'étape 5

- **Le tirage de la voie à la commande du deck**, selon `docs/bleo.md` D2. Il se
  branche dans `commanderCta` (`supabase/functions/_shared/ab_circuits.ts`,
  A/B traduction, 0620), qui rend `null` pour l'instant :
  - `marquee` quand le podz a marqué une slide ;
  - `reprise` quand l'original nomme un concurrent ;
  - sinon, une forme `prouvee` ou un `essai`, selon les poids de `cta_stats`
    (dernière `semaine`, `dimension = 'forme'`, colonnes `statut` et `poids`).
- **Une voie différente par langue** pour un même contenu le même jour, quand
  c'est possible.
- **La forme tirée dans la fiche CTA du post** : écrire `voie_cta` et
  `forme_cta` sur le deck et sur le passage (colonnes de 0600). La forme
  classée a posteriori (`cta_formes`) permet alors de vérifier que le modèle a
  bien suivi la consigne.

## Ce qui a bougé avec 0621

Les fiches langue (0619) sont passées dans `bleo_fiches` (sorte `langue`), comme
décidé par la coordination BLEO (`docs/bleo-chantier.md`). Ces tables étaient
vides : `fiches_langue` et `fiches_langue_versions` ont été retirées.
