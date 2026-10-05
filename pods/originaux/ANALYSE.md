# Pod 2 — label `weird_alpha` : analyse et préparation

Données lues en prod (`mbikecieskoobeizixig`, lecture seule) le 2026-10-05. Ids de contenu
abrégés à 8 caractères (préfixe de `contenus.id`). Images d'échantillon dans
`pod2/images/` (≈70 JPEG) et planches contact dans `pod2/planches/`.

Méthode de comparaison des performances : un compte a sa propre audience. Pour chaque
passage publié depuis plus de 3 jours, on calcule **r = vues / médiane des vues du compte**
(sur tous ses passages publiés, tous labels confondus). Un contenu est jugé sur la médiane
de ses r (au moins 3 passages). r > 1 = mieux que la normale du compte.

---

## 0. Chiffres clés

| | |
|---|---|
| Contenus tagués `weird_alpha` | **719** (481 `valide`, 238 `rejete` au rang D à l'import) |
| Comptes source | 3 : `katsreset` 332, `mindcarefiles` 227, `mentoridaily` 160 |
| Comptes à nous sur le label | 35 actifs, **70 posts/jour** (de 5, it 5, tr 4, hu/es/pl/pt 3, cs 2, el/fr/sv/hr/sl/ro/en 1) |
| Passages publiés | 1 009 (du 11/08 au 05/10), sur 213 contenus distincts, 36 comptes ; **médiane 4 173 vues, moyenne 11 170** |
| Rangs actuels (valides) | S+ 2 · S 8 · A 52 · B 98 · C 321 · (D 238 rejetés) |
| Réserve servable en priorité (B et plus) | **≈225 passages restants**, soit ≈3 jours à 70 posts/jour. Les 321 C n'ont **jamais** été publiés : un C ne sort que si le compte n'a plus rien en B ou au-dessus (`TIER_MIN_PRIORITAIRE = "B"`) |
| Banque d'images propres du label | 2 826 `media_library` dans `media_labels` (2 824 sans texte, 476 marquées `est_hook`), mais beaucoup de doublons visuels |
| Contenus de pod existants | 0 (aucun `livre=true`, aucun `pod` renseigné). Un seul pod déclaré : `page_blanche` → `white_bg` |

---

## 1. Comment est construit le contenu weird_alpha

### 1.1 Comptes source

| Handle | Contenus | Valides | Vues source (médiane / moyenne / max) | Rangs actuels | r médian chez nous |
|---|---|---|---|---|---|
| `katsreset` | 332 | 223 | 3 045 / 32 893 / 1,8 M | S 2, A 18, B 47, C 156, D 109 | **1,10** (92 contenus, 370 passages, médiane 2 700 vues) |
| `mindcarefiles` | 227 | 140 | 2 075 / 15 414 / 1,9 M | S+ 2, S 3, A 10, B 28, C 97, D 87 | **1,39** (57 contenus, 213 passages, médiane 4 173) |
| `mentoridaily` | 160 | 118 | 2 728 / 67 048 / 5,8 M | S 3, A 24, B 23, C 68, D 42 | **2,14** (64 contenus, 285 passages, médiane 4 951) |

Les trois comptes sont en fait des **fermes à contenu pour une app concurrente, « Vent Now »** :
**313 des 481** decks anglais valides contiennent « vent now » dans le texte source, presque
toujours sur la slide 4 (« the vent now app quizzes helped me… », « my therapist literally made
me download the vent now app lol »). Chez nous, le placement Sophia remplace cette slide
dans 450 passages publiés. Mais **59 passages publiés sur 1 009 (5,8 %) contiennent encore
« vent now »** : c'est une fuite à signaler, sans rapport direct avec le pod.

Les vues source sont faibles en médiane (2 000 à 3 000) : ce sont des comptes jeunes ou
moyens, avec quelques gros pics. Elles prédisent mal nos résultats (voir 2.3).

### 1.2 Format

- **6 slides dans 99 % des cas** : 210 des 213 contenus publiés (5 slides : 2 contenus, 7 slides : 1).
  Structure : **1 slide d'accroche + 5 « items »**.
- **Accroche (slide 1)** : 2 à 3 lignes, en minuscules, 40 à 65 caractères, sans emoji, sans
  point. Elle suit presque toujours le même gabarit :
  `hobbies / things / habits that will make you` + **adverbe extrême** (`dangerously`,
  `disgustingly`, avec la faute volontaire `disguistingly`) + **trait désirable**
  (`confident`, `intelligent`, `magnetic`). Exemples réels :
  « hobbies that will make you dangerously confident » (**47 contenus** ont cette accroche au mot près),
  « 5 bizarre hobbies that will make you disgustingly confident »,
  « cheat codes for your 20s (that will help you get dangerously ahead) ».
- **Slides items (2 à 6)** : un **titre de 2 à 4 mots** (le nom du « hobby », souvent un peu
  absurde : *mirror fasting*, *rejection collecting*, *competitive staring*,
  *discomfort scheduling*), une ligne vide, puis **2 à 3 phrases à l'impératif** :
  une consigne concrète et chiffrée (« 20 minutes », « 48 hours », « once a week ») suivie d'un
  bénéfice psychologique un peu grandiloquent (« your brain rewires… », « confidence is built
  through evidence, not affirmations »). Longueur : **140 à 185 caractères** sur les meilleurs
  contenus. Les contenus « dating » sont plus courts (≈80 caractères) et marchent moins bien.
- Numérotation `1)` à `5)` : présente sur 98 contenus. Elle fait un peu moins bien
  (r 1,21 contre 1,48 sans numéro).
- Style : minuscules, ton de confidence (« i », « lol », « nd », « u »), pas d'emoji, pas de hashtag
  dans les slides. `contenus.titre` contient la légende TikTok d'origine avec ses hashtags
  (#mentalhealth #confidence #SelfImprovement #therapy #mindset).
- Musique : celle du post d'origine. La plus fréquente en haut de tableau est
  « Ballad to a Mexican Desert » (42 contenus, dont 17 en A/S/S+ ;
  `https://www.tiktok.com/music/ballad-to-a-mexican-desert-7209138244645373953`).
  Suivent « stay high » et « win again - slowed ».

### 1.3 Images (vérifiées à l'œil : planches dans `pod2/planches/`)

Deux familles visuelles :

1. **Famille « art surréaliste + textures »** : le cœur du label, chez `mentoridaily` et
   `mindcarefiles`, et aussi dans une partie de `katsreset`. Les images sont **en paysage**
   (2 368×1 760, 2 496×1 664, 2 784×1 504), donc affichées avec des bandes noires sur TikTok.
   - L'accroche est une illustration psychédélique ou mystique : lune qui hurle, œil
     rose-vert sur fond nocturne, œil jaune gothique, mains « Création d'Adam » psychédéliques,
     squelette arc-en-ciel, explosion solaire au-dessus des nuages, silhouettes en évolution,
     œil géant au-dessus d'un paysage.
   - Les slides items sont des **textures** : feuilles géométriques vert foncé, mur rouillé,
     hibiscus rouge, écorce, bambou, caustiques dorées sur l'eau, marbre vert, pétales roses,
     nébuleuses, lune dans les nuages.
   - Sur l'image brute, le texte est petit, centré, crème ou jaune, avec une ombre légère
     (voir `planches/bruts.jpg`, source 7667995833870159126).
2. **Famille « photos esthétiques »**, surtout chez `katsreset` (dating, cœur brisé) : photos
   lifestyle **en portrait** 9:16 (1 504×2 784). On y voit des couples de dos sous les étoiles,
   des couchers de soleil, des mains enlacées, une fille sur un banc. Le texte TikTok natif
   est blanc, au centre.

Constat chiffré sur l'image d'accroche : **3 des 25 meilleurs contenus** ont une accroche en
portrait, contre **11 des 25 moins bons**. Les visuels sont aussi **massivement recyclés** :
la même lune qui hurle, le même œil rose et les mêmes mains servent d'accroche à des dizaines
de contenus, en haut comme en bas du classement. L'image seule ne fait donc pas le score.
Mais l'univers « art étrange en paysage + textures » est celui des gagnants.

### 1.4 Thèmes

Classement par mots-clés de l'accroche, sur les passages publiés :

| Thème | Contenus | Passages | Vues médianes | r médian | ≥100k |
|---|---|---|---|---|---|
| **confiance** (confident) | 87 | 386 | 4 826 | **1,58** | 12 |
| dopamine / doomscroll | 11 | 61 | 4 373 | 1,48 | 0 |
| life hacks / 20s | 4 | 13 | 1 842 | 1,30 | 0 |
| intelligence (intelligent, smart, informed, articulate) | 55 | 210 | 3 089 | 1,24 | 2 |
| autre | 34 | 107 | 3 182 | 1,19 | 0 |
| psycho / manipulation | 14 | 46 | 2 700 | 1,17 | 0 |
| **dating / relations** (he's interested, broken heart) | 8 | 45 | 1 834 | **0,76** | 0 |
| **ensemble** | 213 | 868 | 4 344 | 1,36 | 14 |

Items (titres de slides) les plus usés dans le stock, **à ne pas reprendre** :
mirror gazing (57), sensory deprivation (47), rejection collecting (40),
compliment strangers (36), reverse engineering (25), reverse learning (24),
memory palaces (22), emotion mapping (22), lucid dreaming (21), mirror fasting (21),
backwards walking (19), voluntary discomfort (17).

### 1.5 Slide de l'app (placement)

- Le deck source ne porte **aucune** slide de l'app : `position_sophia=false` partout dans
  `contenu_langues.slides_base`. Le placement se fait **à l'assignation**
  (`assurerDeckPourLangue` → `placerSophiaSurDeck`, Gemini). Il **réécrit le texte d'une slide
  item existante** pour y glisser l'app, en gardant le titre et le format.
- Position de la slide de l'app dans les passages publiés : **slide 4 pour 624 passages**
  (médiane 3 361 vues), **slide 5 pour 221** (4 872), **slide 6 pour 155** (4 455).
  Le placement « naturel » en 5 fait un peu mieux que le 4, mais le 4 est souvent imposé
  par la slide « vent now » à remplacer.
- Les meilleurs textes de placement s'appuient sur la micro-formation culturelle. Exemple
  (`be8abcd5`, es, **769 100 vues**) : « ampliar tu mundo — dedica de cinco a diez minutos al
  día a aprender de arte, ciencia o historia. una app de microaprendizaje como la app Sophia… ».
  Autres exemples : `34236ff7` (es, 668 500), `b3df0deb` (tr, 655 900), `c908d31f` (es, 446 100),
  `b04319ee` (tr, 334 000).
- Il faut donc écrire les originaux **sans aucune mention d'app**, mais avec **un item qui
  appelle naturellement le placement** (apprendre quelque chose de nouveau chaque jour,
  avoir des sujets de conversation, la culture générale) en **position 5**.

### 1.6 Comment le texte arrive sur l'image (contenu classique)

À l'import, le texte source est lu par OCR et rangé dans `contenu_langues.slides[].texte_overlay`.
L'image est nettoyée de son texte (Fal, puis Replicate en repli, upscale SeedVR, retrait C2PA)
et stockée dans `medias/propre/<contenu_id>/<pos>.jpg`. Le `media_id` va dans
`contenus.structure_slides[]`.

À l'assignation, `materialiserPostDepuisPassage` crée `post_slides` avec l'image propre,
`texte_overlay` dans la langue du compte et `reference_url`, la slide brute d'origine qui
sert de modèle de mise en page. **Le poster recopie le texte en texte natif TikTok**
(`PosterPostPage` : boutons copier). **Rien n'est imprimé dans l'image** : c'est ce qui
permet la traduction à la volée.

---

## 2. Performances sur nos comptes

### 2.1 Par langue (passages publiés weird_alpha, comparés à la médiane de la langue tous labels confondus)

| Langue | Passages | Comptes | Médiane wa | Moyenne wa | Max | Médiane tous labels | ≥100k |
|---|---|---|---|---|---|---|---|
| pl | 181 | 3 | 4 999 | 9 831 | 146 600 | 4 513 | 2 |
| es | 179 | 3 | 3 420 | 21 903 | 769 100 | 1 657 | 6 |
| it | 134 | 6 | 3 821 | 6 298 | 215 200 | 1 509 | 1 |
| hu | 111 | 3 | 4 932 | 7 335 | 48 000 | 1 762 | 0 |
| tr | 106 | 4 | 4 444 | 22 429 | 655 900 | 3 052 | 5 |
| de | 81 | 5 | 1 326 | 3 096 | 30 900 | 1 522 | 0 |
| pt | 65 | 3 | 1 195 | 1 927 | 12 000 | 1 186 | 0 |
| ro | 32 | 1 | 1 840 | 2 958 | 11 900 | 1 147 | 0 |
| el | 32 | 1 | 7 344 | 11 926 | 51 900 | 2 104 | 0 |
| cs | 23 | 2 | 4 391 | 4 370 | 12 700 | 1 712 | 0 |
| en | 16 | 1 | 2 085 | 4 338 | 34 500 | 1 302 | 0 |
| sv | 15 | 1 | 7 379 | 7 635 | 14 600 | 1 364 | 0 |
| hr | 7 | 1 | 7 481 | 20 286 | 107 000 | 1 669 | 1 |
| sl | 7 | 1 | 242 | 359 | 1 148 | 1 138 | 0 |

Le label bat la médiane locale presque partout, avec des écarts de 2 à 5× en es, it, hu, el,
sv, hr et cs. Il est neutre ou en dessous en **de, pt et sl**. Les gros pics (> 300k) viennent
de **es et tr**. Il y a **un seul compte en anglais** : les originaux anglais vivront donc
surtout **traduits**, et le texte doit bien se traduire (pas de jeux de mots intraduisibles).

### 2.2 Top 15 (r médian, au moins 3 passages)

| Contenu | Source | Vues src | Rang | Passages | Médiane | Moyenne | Max | r | Accroche |
|---|---|---|---|---|---|---|---|---|---|
| 34236ff7 | @mentoridaily/video/7667995833870159126 | 14 100 | S | 7 | 17 400 | 113 711 | 668 500 | 9,65 | hobbies that will make you dangerously confident |
| 21d5bace | @mindcarefiles/video/7651483563061153038 | 31 800 | A | 5 | 5 871 | 9 568 | 22 100 | 6,75 | hobbies that will make you disgustingly confident |
| 33ce1ca8 | @katsreset/video/7669452627356192014 | 10 400 | A | 5 | 12 300 | 15 587 | 28 400 | 6,44 | things that will make you disguistingly confident |
| 57a0b4be | @mindcarefiles/video/7659433428282117389 | 13 700 | S | 6 | 19 472 | 88 531 | 273 900 | 6,27 | 5 bizarre hobbies that will make you disgustingly confident |
| 648e59e7 | @mentoridaily/video/7664651951581203734 | 6 339 | A | 4 | 30 100 | 27 164 | 47 400 | 6,10 | hobbies that will make you dangerously confident |
| 4c740b93 | @mentoridaily/video/7659079021883378947 | 628 800 | A | 6 | 12 212 | 33 964 | 146 600 | 4,94 | hobbies that will make you dangerously confident |
| 5c44f6db | @mindcarefiles/video/7663231331895201038 | 6 940 | A | 3 | 6 338 | 5 302 | 8 420 | 4,85 | how to become DISGUSTINGLY confident |
| 1cba32a2 | @katsreset/video/7594836161336495374 | 80 900 | S | 11 | 13 900 | 22 799 | 69 600 | 4,83 | Body language signs that PROVE he's interested |
| 2270832d | @mentoridaily/video/7657876880472804630 | 54 900 | A | 8 | 6 846 | 46 453 | 259 600 | 4,68 | hobbies that will make you disgustingly intelligent |
| 5b39aa5e | @mentoridaily/video/7659697040602959126 | 39 500 | A | 5 | 7 216 | 14 383 | 48 500 | 4,63 | hobbies that will make you disgustingly intelligent |
| be8abcd5 | @mentoridaily/video/7660259125640613142 | 52 900 | A | 8 | 10 882 | 106 112 | 769 100 | 4,30 | hobbies that will make you dangerously confident |
| a662b367 | @mindcarefiles/video/7665370679012756750 | 6 662 | A | 6 | 8 852 | 11 922 | 23 800 | 4,22 | cheat codes for your 20s (that will help you get dangerously ahead) |
| f2859d4a | @mentoridaily/video/7659305767773687062 | 122 400 | A | 8 | 5 212 | 15 646 | 59 900 | 4,11 | hobbies that will make you dangerously confident |
| 04f5b0fa | @mindcarefiles/video/7652098721345244430 | 17 700 | A | 4 | 8 395 | 7 581 | 12 600 | 4,10 | hobbies that will make you disgustingly intelligent |
| ee1099e0 | @mentoridaily/video/7656796309910834454 | 5 961 | A | 6 | 6 328 | 13 790 | 40 000 | 3,89 | hobbies that will make you disgustingly confident |

Autres bons : 03c8fe3a (@katsreset/video/7667968235513466125, « 5 things that will pull you out of
your dopamine addiction », r 3,52), 2e6fc2dd (S+, « hobbies that will make you disgustingly
intelligent », max 215 200), b04319ee (S+, @mindcarefiles/video/7654325300079136013,
« more habits that will make you dangerously confident », max 234 700).

### 2.3 Bottom 15

| Contenu | Source | Vues src | Rang | Passages | Médiane | r | Accroche |
|---|---|---|---|---|---|---|---|
| ac3be917 | @katsreset/video/7587972452525935927 | 37 300 | S | 5 | 880 | 0,14 | 5 physical signs he's genuinely interested |
| 81db8815 | @katsreset/video/7587437855534828830 | 31 100 | C | 3 | 402 | 0,17 | 5 subtle cues that show he's interested |
| d5877a40 | @mindcarefiles/video/7659520442448760078 | 13 600 | B | 3 | 1 440 | 0,31 | 5 microhabits that will make you disguistingly intelligent |
| 0f28c9d3 | @mindcarefiles/video/7668055311084834062 | 8 081 | C | 3 | 1 195 | 0,44 | 5 hobbies that will make you noticeably a different person (in the age of ai) |
| d0a4c24a | @katsreset/video/7652753859466628365 | 6 814 | C | 5 | 827 | 0,49 | 5 hobbies to build a life so good u stopped doomscrolling |
| 78c9e268 | @katsreset/video/7649628220983151885 | 7 840 | B | 3 | 2 363 | 0,53 | hobbies that will make you dangerously informed |
| a283431c | @katsreset/video/7596977125706517815 | 13 700 | B | 3 | 1 410 | 0,54 | how to turn the talking stage into something REAL |
| addeffc8 | @katsreset/video/7653124819290000653 | 12 000 | B | 3 | 2 089 | 0,56 | hobbies that will make you dangerously confident |
| 755b0dd9 | @katsreset/video/7571555292224310558 | 90 900 | C | 8 | 1 368 | 0,58 | Physical symptoms of a broken heart (and how to actually start healing) |
| 1c5a68fa | @katsreset/video/7656180646083038478 | 14 800 | B | 3 | 1 311 | 0,62 | hobbies that will make you scary smart |
| 3d16d29c | @mindcarefiles/video/7666571001592941838 | 6 149 | B | 3 | 1 731 | 0,64 | how to become unbelievably articulate nd wellspoken |
| a0a92455 | @katsreset/video/7649785424600124685 | 14 200 | B | 4 | 2 168 | 0,71 | hobbies i do to become disgustingly intelligent |
| 271021ab | @katsreset/video/7664344556258839822 | 8 637 | C | 3 | 1 593 | 0,73 | hobbies that will make you impossible to manipulate |
| 9712ff76 | @katsreset/video/7654980345724521742 | 7 644 | B | 4 | 3 458 | 0,73 | 5 hobbies to build a life so good u stopped doomscrolling |
| 328997e5 | @katsreset/video/7660633740158307597 | 7 289 | C | 3 | 1 981 | 0,74 | hobbies that can f**k with your psychological understandings |

### 2.4 Ce qui diffère entre le haut et le bas

| Facteur | Contenus | r médian | Médiane vues |
|---|---|---|---|
| Accroche avec adverbe extrême (dangerously, disgustingly…) | 140 | **1,49** | 4 638 |
| Sans adverbe | 73 | 1,16 | 2 682 |
| Accroche « hobbies » | 142 | **1,43** | 4 412 |
| Sans « hobbies » | 71 | 1,17 | 3 420 |
| Accroche qui commence par « 5 » | 39 | 1,20 | 3 215 |
| Sans chiffre | 174 | **1,40** | 4 412 |
| Source `mentoridaily` | 64 | **2,14** | 4 951 |
| Source `mindcarefiles` | 57 | 1,39 | 4 173 |
| Source `katsreset` | 92 | 1,10 | 2 700 |
| Vues source < 20k | 161 | 1,21 | 3 160 |
| Vues source 20 à 100k | 31 | 1,87 | 5 292 |
| Vues source > 100k | 21 | 1,57 | 4 937 |
| 6 slides | 210 | 1,37 | 4 374 |

Accroches exactes (au moins 8 passages) : « 5 bizarre hobbies that will make you disgustingly
confident » r 3,86 · « habits that will make you disgustingly magnetic » 1,84 · « hobbies that
will make you disgustingly confident » 1,82 (12 contenus) · « …dangerously confident » 1,77
(47 contenus, 228 passages) · « …disgustingly intelligent » 1,73 · « 5 things that will pull you
out of your dopamine addiction » 1,73 · « cheat codes for your 20s » 1,59 · « hobbies to protect
your brain from aging (in the age of ai) » 1,55. **En bas** : « …dangerously intelligent » 0,96,
« 5 hobbies that will unrot your brain » 0,94, « …impossible to manipulate » 0,73,
« broken heart » 0,58, « …life so good u stopped doomscrolling » 0,54.

**Ce qui marche**
- La promesse **« devenir dangereusement / dégoûtamment confiant(e) »**, puis
  « intelligent(e) » et « magnétique ». C'est une transformation d'identité, pas un conseil.
- Les **hobbies étranges mais faisables** (*night walk*, *voice journal*, *discomfort scheduling*,
  *object focus*), chacun avec une consigne chiffrée et une phrase-choc introspective.
  Le meilleur contenu (34236ff7) a le ton le plus « littéraire » : « the version of you that
  exists when nobody is watching is the one most worth getting to know ».
- Les **items longs** (≈170 caractères) : ça retient le spectateur sur chaque slide.
- L'univers visuel **art surréaliste en paysage + textures sombres**.
- L'item « apprendre un peu de tout chaque jour » en slide 5, qui donne au placement Sophia
  son meilleur terrain : tous les passages à plus de 300k l'utilisent.

**Ce qui ne marche pas**
- Le **dating** (« signs he's interested », talking stage, broken heart) : r 0,76, et les deux pires
  contenus du label (0,14 et 0,17), alors qu'ils avaient 31 000 à 37 000 vues source. Seule
  exception : 1cba32a2 (« Body language signs that PROVE he's interested », r 4,83). La slide de
  l'app y est aussi forcée (« he shares random, smart facts he just learned on… »).
- Les accroches **floues ou trop malines** : « noticeably a different person (in the age of ai) »,
  « f**k with your psychological understandings », « impossible to manipulate », « unrot your brain ».
- Les **photos lifestyle en portrait** (couples, banc, lit), surtout chez `katsreset`.
- Les **items trop courts** : 80 caractères ou moins, comme sur les contenus dating.
- Attention : la **même accroche** « hobbies that will make you dangerously confident » donne
  r 9,65 (34236ff7) ou 0,56 (addeffc8). Le corps compte autant que l'accroche. addeffc8
  recycle les items usés (mirror mapping, fear collecting, compliment strangers) et en
  a un qui parle de l'app concurrente.

---

## 3. Banque d'images du label

- `media_labels` × `weird_alpha` : **2 826 médias**, tous `source = nettoye_reference` et rangés
  sous `propre/<contenu_id>/<pos>.jpg`. **2 824 sont sans texte** (`texte_restant=false`).
  **476 sont marquées `est_hook=true`**, en principe les slides 1 (quelques slides 2 ou 5 ont
  été marquées à tort, par exemple 59bec0c0 et 33936829).
- Ils viennent des 481 contenus valides : 2 844 médias propres ont `contenu_id` sur un
  contenu weird_alpha. Les 238 rejetés n'ont pas d'image propre.
- **Aucune métadonnée exploitable** : `tags` vide, `caption` nulle (`caption_statut` null)
  pour 100 % des médias. Le tirage automatique `resoudreVisuelsAssignation` (par `critere`
  + caption) n'a donc rien pour choisir et retombe sur du hasard. **Un original doit
  épingler ses images** (`media_id` + `pinned: true` dans `structure_slides`).
- Les images sont **propres** sur l'échantillon vu (≈45 images) : aucun reste de texte visible.
  Elles sont upscalées (≈2 400 à 2 800 px de large en paysage, 1 504×2 784 en portrait) et
  sans métadonnées C2PA.
- **Beaucoup de doublons visuels** : une même texture ou accroche est re-stockée par contenu
  (lune qui hurle, œil rose, mains psychédéliques, rouille, hibiscus, écorce, bambou, feuilles
  géométriques vertes). Le stock réel de visuels distincts est probablement de l'ordre de
  quelques centaines. Aucun hash n'est stocké pour dédoublonner : à prévoir côté pod
  (pHash au téléchargement).
- Pour référencer une image, il suffit de son `media_library.id`, qu'on met en `media_id`
  dans `structure_slides` avec `pinned: true`. On ne change **pas** `media_library.contenu_id`
  (l'image appartient au contenu d'origine, et `trouverPropreExistant` s'en sert).
  On peut incrémenter `used_count` pour suivre la réutilisation.

Requête de base pour le pod :
```sql
select m.id, m.url, m.est_hook, m.used_count, m.contenu_id
from media_library m join media_labels x on x.media_id = m.id
where x.label_id = (select id from labels where nom = 'weird_alpha')
  and m.texte_restant = false and m.storage_path like 'propre/%';
```

Images repérées (vues dans `planches/`) :
- **Accroches**. 47ba48ef-8124-4a12-98dd-57bed1e80545 : lune qui hurle (138af0c6).
  993f48d9-3d18-43fb-aa8a-a1acf24b1870 : œil jaune gothique (4c740b93).
  74c23e55-8218-43ae-97a0-dab9007a38f9 : œil rose-vert sur fond nocturne (4d79f4a2).
  f7908bab-3464-4819-a1db-59bcf18f7f18 : œil géant au-dessus d'un paysage (2270832d).
  1a4f5f12-0d07-4ad9-81c5-ea296e5425d4 : explosion solaire au-dessus des nuages (34236ff7).
  367d9266-2503-4229-9caf-2e8476586aad : mains psychédéliques (57a0b4be).
  963aea72-4835-4b98-bfa5-9b3370999e33 : trois silhouettes auras (33ce1ca8).
  ddfb392f-2d9b-4ba9-aab4-458b6bf6e68e : squelette arc-en-ciel (2e6fc2dd).
  b766bd9e-77f5-41de-bcb3-3113510d3dad : silhouette dorée cosmique (5c44f6db).
- **Textures**.
  9ce5b7d6-a56b-4d4a-9fb4-8cba734e07e5 · fc922b58-1099-4c3c-8981-25569695e128 · 378aa1ed-f5b9-41fe-b620-bf2d79f3fe4b : feuilles géométriques vertes.
  2c2fc0f7-07e3-445b-8f06-fc34d51a18d5 · 8258f5a6-3272-4441-b8e6-bb00601aa312 · 6615a9ff-fd0d-4bc5-94b0-7151f2536558 · ff092336-f070-43c5-b01c-77c5a8fcaf36 : rouille.
  c43aacba-c0d7-4f8b-b1be-d5a70d018b8d : pétales roses.
  861aa6f7-745a-438b-a541-eb06ce8b5a55 · 8172a31f-83ae-42b9-87a7-419b0cdea9ff · b32e37ef-affe-4b47-a387-2d86d9bc6d4d : hibiscus.
  38c13d65-fc73-4f78-b17b-c1f1adb67e85 · 71463f55-89b0-4b3a-9e35-f25123761bee · 0c16f9e6-915a-4eff-affe-878d3f197956 : écorce.
  59bec0c0-6980-4e0a-b551-84bfcb1c2e3f · 33936829-08a7-4ba2-9360-cb1d6d6c4b35 : bambou.
  e239827b-0e33-4f01-9b5e-62a9d7da6420 : grandes feuilles.
  8fc70692-d01c-4fe9-9ebe-0054a88ea83b · b0df1021-840b-4b3d-b02a-cd18b4a8e5bb : marbre vert.
  522eb5f3-a4dc-442e-b3b5-9a3a3de373eb · e521173f-430a-42ca-857e-563f16b2a769 · 0c8e6f43-20e2-45a8-991b-98640990813a : caustiques dorées.
  2a4e7c57-cf8a-4760-a13e-facfa2aa9f62 · 6f8214f1-093a-46ec-8419-e089fda217a4 : texture olive.
  6bebb315-bbb4-4167-8299-97758847d2bc · eb4a6dcc-7c6d-4aef-9624-a0f683facdbb : bois veiné.
  d313cf0f-0eee-4ae8-9b34-6f4c837d044a : nébuleuse rouge.
  8a2aa272-30b1-444a-8fc4-da404ff03e4c : lune dans des nuages dorés.
  db4ab0b5-9ddf-43c4-80fb-a3c708f587af : galaxie.
  71c96849-969d-4251-a80d-e4865ff892bc : feuille en gros plan.

---

## 4. Faire entrer un original « traduisible » dans l'OS

### 4.1 Ce qu'il faut en base pour un contenu non `livre`

C'est le même chemin qu'un contenu importé ou que `validerSlideshowManuel`
(`_shared/creation_manuelle.ts`).

**`contenus`**
- `titre` : la légende anglaise. Elle sert de `sourceTitle` à la traduction et aux hashtags.
- `langue_source = 'en'`.
- `statut = 'valide'`, `import_statut = 'done'` (`import_etape = 'done'`).
  Sans ça, le contenu reste hors du pool (`poolContenusPrets`).
- `ugc_compatible = false` (valeur par défaut). `application_id` : Sophia par défaut.
- `structure_slides = [{position, media_id, pinned: true, critere: null, raw_url: null, reference_url: null}]`,
  une entrée par slide, 6 au total. `pinned` + `media_id` : `resoudreVisuelsAssignation` garde l'image telle quelle.
- `musique_url`, `musique_titre`, `musique_plateforme` : à reprendre d'un contenu du label
  qui marche, par exemple « Ballad to a Mexican Desert ».
- `compte_reference_id` : facultatif. `voixSource()` y lit le `style_profile`, vide pour les 3 sources.
- `pertinence_score`, `pertinence_raison` : facultatifs.
- **`tier` + `passages_prevus` + `tier_cycle=0` + `tier_maj_at` + `tier_rapport`** : à poser
  **explicitement**. Par défaut `tier='D'` et `passages_prevus=0`, et le contenu n'est jamais tiré.
  **C'est d'ailleurs un bug de `validerSlideshowManuel`** : il ne pose pas de rang, donc tout
  slideshow manuel naît en D/0. Recommandation : entrer en **B (2 passages)**. C reviendrait à
  ne jamais sortir tant que des B existent, alors que 321 C weird_alpha n'ont jamais été publiés.
- `livre = false` (valeur par défaut) et `pod = '<slug>'`, pour le suivi.
- `creation_mode` : la contrainte CHECK n'accepte que `import` et `manuel`. Utiliser `manuel`,
  ou migrer la contrainte pour ajouter `pod`.

**`contenu_labels`** : `(contenu_id, label weird_alpha)`.

**`contenu_langues`** : **une seule ligne `en`**.
- `slides = [{position, texte_overlay, position_sophia: false}]` : le texte est obligatoire, et
  **aucune slide de l'app**.
- `slides_base` = la même chose. C'est la base de traduction propre, sans pub ;
  `assurerDeckPourLangue` la pose de toute façon via `assurerSlidesBase`.
- `score`, `score_maj_at`, `nb_passages = 0`.
- Les autres langues **naissent à la demande** : à la première assignation d'un compte it,
  es, etc., `assurerDeckPourLangue` crée la ligne, traduit depuis `slides_base` (prompt
  `traduction_<langue>`), place Sophia (`placerSophiaSurDeck`) et génère les hashtags.
  `deck_application.ts` fait de même pour les autres applications. C'est pour ça que la base
  doit rester **sans aucune mention d'app**.

**`media_library`** : rien à créer, on réutilise des id existants. Les images doivent être
`propre/…`, `texte_restant=false` et dans `media_labels` du label.

### 4.2 Le flux pod actuel (`supabase/functions/pods/index.ts`, migration 0259)

- `deposer` : il reçoit des **JPEG finis par langue** (`jpeg_base64`, texte imprimé),
  vérifie qu'il n'y a pas de métadonnées, les envoie dans `medias/pods/<slug>/<source_id>/<langue>/<pos>.jpg`,
  crée des `media_library` (`texte_restant=true`, `genere_ia`) et une ligne `pod_livraisons`
  (`type='nouveau'`, `decks`, `transcription.textes`). `verifierDepot` **exige** un deck dans
  la langue source **et** au moins une slide `position_sophia`.
- `valider` (admin) : note d'import classique (`scoreRelevance` + `eloParLangue` sur
  `source_vues`), puis `tierImport` (moins de 55 = écartée, 55 à 60 = C, 60 à 70 = B, 70 ou plus = A).
  Il crée un contenu **`livre=true`** avec `texte_overlay = ""`, et `assurerDeckPourLangue`
  sert alors le deck livré tel quel (`deckLivre`) : **pas de traduction, pas de placement,
  seulement dans les langues livrées**.

### 4.3 Ce qu'il faut changer dans la fonction `pods` pour des originaux traduisibles

1. **Nouveau type de dépôt** `original`, en plus de `nouveau` et `langues`. Migration :
   `pod_livraisons_type_check` doit accepter `original`.
   Charge utile : `{ action: "deposer", type: "original", pod, source_id (id interne du pod),
   titre, langue_source: "en", musique_url?, musique_titre?, hashtags?, inspirations?: [contenu_id…],
   slides: [{ position, media_id, texte_overlay }] }`. **Pas de JPEG, pas de `position_sophia`.**
2. **Un validateur dédié** (`verifierOriginal` dans `_shared/pods.ts`, à côté de `verifierDepot`).
   - Entre 2 et 12 slides (viser 6), positions uniques, texte non vide partout.
   - Chaque `media_id` existe, est `propre/%`, `texte_restant=false` et dans `media_labels`
     du label du pod. Pas deux fois la même image dans un deck.
   - **Interdire** `position_sophia`, le mot « sophia », les noms d'app (liste des
     `applications.nom`) et « vent now » dans les textes : c'est l'OS qui place l'app.
   - Bornes de longueur : accroche ≤ 90 caractères, item ≤ 260 caractères.
3. **Stockage** : rien à envoyer au stockage. On range le deck dans
   `pod_livraisons.decks = { en: { hashtags, slides } }` et `transcription.textes`, avec
   `source_url` et `source_vues` à null.
4. **`valider` pour `type='original'`** :
   - **Ne pas utiliser `eloParLangue` / `tierImport`** : sans `source_vues`, la note vaut au plus
     30 % × pertinence, toujours sous 55, donc **toute livraison serait écartée**. Il faut
     un rang d'entrée fixe (B, ou un réglage `pods.tier_entree_original`), avec éventuellement
     un plancher de pertinence (`scoreRelevance`) pour écarter les ratés.
   - Créer le contenu comme en 4.1 : `livre=false`, `pod=slug`, `structure_slides` épinglées,
     rang B, `passages_prevus = passagesPourTier('B')`, `tier_rapport.origine = 'pod_original'`.
   - Insérer `contenu_labels` et **une seule** ligne `contenu_langues` `en` avec `slides` et
     `slides_base` (texte, `position_sophia:false`, sans `media_id`).
   - **Ne pas** toucher à `media_library.contenu_id` (c'est le contraire du flux `livre`).
     Éventuellement `used_count + 1`.
   - Même nettoyage en cas d'échec : supprimer le contenu si un insert échoue.
5. **`etat`** : rien à changer. Il remonte déjà rangs et vues par `contenu_id`. Ajouter `type`
   à la liste des livraisons pour que l'agent distingue ses originaux.
6. **Front Pilotage → Pods** : afficher les livraisons `original` sous forme de texte + vignettes
   des `media_id` (il n'y a pas de JPEG livré).
7. **À vérifier** : les tâches qui supposent un `source_url` ou des `raw_url` sur les
   contenus (`oublier-source`, `renettoyer-contenu`, `upscale-assignes`, `scan-visage-ugc`).
   Elles doivent ignorer un contenu sans source plutôt qu'échouer. `validerSlideshowManuel` crée
   déjà ce genre de contenu, mais il n'y en a aucun en prod (0 `creation_mode='manuel'`) :
   le chemin n'a jamais tourné en vrai.

Variante plus légère : réutiliser `validerSlideshowManuel` côté serveur, en le corrigeant pour
qu'il pose un rang. Mais il crée 14 lignes `contenu_langues` (une par langue cible, vides
sauf la source), il n'a pas de file de validation et il n'a pas de jeton de pod. Le type
`original` dans `pods` est plus propre.

---

## 5. Recette pour écrire des originaux

**Format fixe**
- 6 slides : **1 accroche + 5 items**. Pas de numérotation dans les items ni de chiffre en tête d'accroche.
- **Accroche** : `[hobbies|habits|things] that will make you [dangerously|disgustingly] [confident|intelligent|magnetic|calm|unbothered]`,
  en minuscules, coupée en 2 lignes (`\n`), 45 à 65 caractères. Une variante « bizarre »
  (« 5 bizarre hobbies… ») a fait le meilleur r (3,86) : à utiliser avec parcimonie.
  On peut aussi tester « cheat codes for your 20s (that will help you get dangerously ahead) ».
- **Item** : `titre (2 à 4 mots, minuscules)\n\nconsigne concrète chiffrée. bénéfice introspectif ou punchline.`
  Viser **150 à 185 caractères**, 2 à 3 phrases, à l'impératif, en minuscules, sans emoji,
  avec un « i » ou « u » occasionnel pour le ton.
- **Slide 5 = slot du placement** : un item sur l'apprentissage, la curiosité ou la
  conversation (« learn one random thing a day… »), **sans nommer d'app**. L'OS le transforme
  en slide Sophia.
- **Pas de mention d'app, pas de « therapist made me download »** dans aucune slide.
- Images : accroche = illustration surréaliste en paysage (`est_hook=true`, œil, lune, mains,
  cosmos). Items = 5 **textures différentes** de la même famille. Éviter les photos de couples
  ou les selfies en portrait.
- Légende (`titre`) : courte, dans le ton, avec 4 ou 5 hashtags génériques
  (#selfimprovement #confidence #mindset #psychology #hobbies). Les hashtags par langue sont
  régénérés par l'OS.
- Musique : reprendre « Ballad to a Mexican Desert » ou une autre musique d'un contenu A/S du label.

**Thèmes à privilégier** : confiance (en premier), intelligence, magnétisme, sortir de la
dopamine ou du scroll, « cheat codes » des 20 ans, protéger son cerveau.
**À éviter** : dating / « signs he likes you », cœur brisé, manipulation, accroches ironiques
ou vulgaires (« f**k with… »), « in the age of ai », items surexploités (mirror gazing,
sensory deprivation, rejection collecting, compliment strangers, memory palaces, lucid
dreaming, backwards walking, cold water immersion…).
**Diversifier** : 47 contenus portent déjà l'accroche exacte « …dangerously confident ».
Garder la promesse mais varier l'adjectif et surtout **les items**, qui font l'écart
(9,65 contre 0,56 à accroche identique).

---

### Exemple 1 : confiance

```json
{
  "titre": "hobbies that will make you dangerously confident #selfimprovement #confidence #mindset #psychology",
  "langue_source": "en",
  "slides": [
    {"position": 1, "media_id": "47ba48ef-8124-4a12-98dd-57bed1e80545",
     "texte_overlay": "weird hobbies that will make you\ndangerously confident"},
    {"position": 2, "media_id": "9ce5b7d6-a56b-4d4a-9fb4-8cba734e07e5",
     "texte_overlay": "slow talking\n\nfor one full day, speak 20% slower than feels normal. people lean in when you stop rushing, and your brain starts believing what you say deserves the time."},
    {"position": 3, "media_id": "2c2fc0f7-07e3-445b-8f06-fc34d51a18d5",
     "texte_overlay": "solo dinners\n\ntake yourself out to eat once a month, no phone on the table. sitting alone in public without hiding is the fastest way to stop needing an audience."},
    {"position": 4, "media_id": "c43aacba-c0d7-4f8b-b1be-d5a70d018b8d",
     "texte_overlay": "the no-apology week\n\nfor 7 days, replace every \"sorry\" with \"thank you\". \"thanks for waiting\" instead of \"sorry i'm late\". you'll notice how often you shrink without meaning to."},
    {"position": 5, "media_id": "861aa6f7-745a-438b-a541-eb06ce8b5a55",
     "texte_overlay": "random expertise\n\nspend 5 minutes a day learning about something you'll never need: old empires, deep sea animals, art movements. having something to say in any room changes how you walk into it."},
    {"position": 6, "media_id": "38c13d65-fc73-4f78-b17b-c1f1adb67e85",
     "texte_overlay": "first in line\n\nbe the first to ask a question in every meeting or class for a month. the fear never fully leaves, it just stops getting a vote."}
  ]
}
```

### Exemple 2 : intelligence

```json
{
  "titre": "hobbies that will make you disgustingly intelligent #selfimprovement #intelligence #learning #mindset",
  "langue_source": "en",
  "slides": [
    {"position": 1, "media_id": "993f48d9-3d18-43fb-aa8a-a1acf24b1870",
     "texte_overlay": "hobbies that will make you\ndisgustingly intelligent"},
    {"position": 2, "media_id": "8fc70692-d01c-4fe9-9ebe-0054a88ea83b",
     "texte_overlay": "wikipedia spiraling\n\npick any article and click only the third link, ten times in a row. you end up somewhere absurd, and your brain learns to connect ideas nobody else would."},
    {"position": 3, "media_id": "e239827b-0e33-4f01-9b5e-62a9d7da6420",
     "texte_overlay": "explain it to a child\n\nonce a day, explain something you think you understand in words a 10 year old would get. the parts you can't simplify are the parts you never really learned."},
    {"position": 4, "media_id": "0c8e6f43-20e2-45a8-991b-98640990813a",
     "texte_overlay": "opinion swapping\n\nwrite the strongest possible argument for a view you disagree with. if you can't make it convincing, you don't understand the topic yet, you just picked a side."},
    {"position": 5, "media_id": "6615a9ff-fd0d-4bc5-94b0-7151f2536558",
     "texte_overlay": "a lesson a day\n\nlearn one small thing every morning before you open social media: a painting, a battle, a word in another language. 5 minutes a day is almost 30 hours of knowledge a year."},
    {"position": 6, "media_id": "6bebb315-bbb4-4167-8299-97758847d2bc",
     "texte_overlay": "slow reading\n\nread one page, then close the book and say out loud what it meant. it feels painfully slow. it's also the only way anything you read actually stays."}
  ]
}
```

### Exemple 3 : sortir de la dopamine

```json
{
  "titre": "things that will pull you out of your dopamine addiction #dopaminedetox #mindset #selfimprovement #focus",
  "langue_source": "en",
  "slides": [
    {"position": 1, "media_id": "74c23e55-8218-43ae-97a0-dab9007a38f9",
     "texte_overlay": "things that will pull you out of\nyour dopamine addiction"},
    {"position": 2, "media_id": "2a4e7c57-cf8a-4760-a13e-facfa2aa9f62",
     "texte_overlay": "grayscale phone\n\nturn your screen black and white for a week. the apps don't change, but they stop glowing at you, and you'll catch yourself putting the phone down without deciding to."},
    {"position": 3, "media_id": "522eb5f3-a4dc-442e-b3b5-9a3a3de373eb",
     "texte_overlay": "the 10 minute wait\n\nwhen you reach for your phone out of boredom, set a timer for 10 minutes and just sit. the urge peaks, then fades. that fade is your attention coming back."},
    {"position": 4, "media_id": "ff092336-f070-43c5-b01c-77c5a8fcaf36",
     "texte_overlay": "analog evenings\n\nafter 9pm, only things you can hold: paper books, a notebook, a puzzle, a pen. your sleep gets deeper and your mornings stop starting with a craving."},
    {"position": 5, "media_id": "b32e37ef-affe-4b47-a387-2d86d9bc6d4d",
     "texte_overlay": "trade the scroll\n\nevery time you open an app out of habit, learn one real thing instead: a fact about history, a famous painting, how the brain works. same 5 minutes, opposite effect on your mind."},
    {"position": 6, "media_id": "b0df1021-840b-4b3d-b02a-cd18b4a8e5bb",
     "texte_overlay": "boring mornings\n\nfirst 60 minutes awake with no screens at all. stretch, make coffee, stare out the window. a calm first hour teaches your brain it doesn't need a hit to start the day."}
  ]
}
```

(Pour ces trois scripts, chaque slide 5 est le slot que le placement transformera en slide de
l'app. Les images viennent de contenus A ou S du label : 138af0c6, 2270832d, 4c740b93,
4d79f4a2, 34236ff7, 37b7e6ed.)

---

## Annexes : points d'attention relevés en chemin
- **Fuite concurrente** : 59 passages publiés weird_alpha contiennent encore « vent now ».
  313 des 481 bases anglaises le contiennent. Le placement ne remplace qu'une slide : si
  le texte apparaît sur deux slides, ou si le modèle choisit une autre position, il reste.
- **`validerSlideshowManuel`** ne pose ni `tier` ni `passages_prevus` : un slideshow manuel
  naît en D/0 et n'est jamais tiré.
- **Pas de caption ni de tag** sur les 2 826 images du label : le tirage par critère ne peut
  pas fonctionner pour weird_alpha tant que `caption-media` n'a pas tourné.
- **Réserve** : ≈225 passages B ou plus restants pour 70 posts/jour. Le label redescendra vite
  sur ses C jamais testés, d'où l'intérêt du pod 2.
