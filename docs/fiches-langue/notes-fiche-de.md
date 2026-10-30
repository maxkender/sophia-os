# Notes de la fiche langue allemande

Hors de la fiche. Les chiffres derrière chaque règle, les manques, les doutes et les habitudes natives qui contredisent une règle produit. Rédigé le 30/10/2026 à partir de la base de prod (lecture seule).

## Ce qui a été lu

- Banque native `de`, statut « pret » : 253 slideshows. alpha_male 38, alpha_male_yellow 6, weird_alpha 20 (Discipline 64) ; smart_girl 49, beau_smart_girl 20 (Fille cultivée 69) ; classic_study 63, medical_study 6 (Études 69) ; RH 27 ; sans label 24. Tous lus, sauf une quinzaine de « Lernzettel » de classic_study (fiches de cours photographiées, jusqu'à 2 000 caractères par slide) lus seulement par l'accroche.
- 98 slideshows `de` sont en statut « erreur » (OCR non fait, 0 slide) : alpha_male_yellow 14, beau_smart_girl 30, classic_study 19, RH 13, sans label 15, medical_study 4, alpha_male 2, smart_girl 1. C'est presque un tiers de la banque ; beau_smart_girl et alpha_male_yellow sont les plus amputés.
- Nos posts : 1 641 passages `de` publiés avec texte, du 31/08 au 28/10/2026, comptes à 5 posts et plus. Statistiques sur l'ensemble. 174 lus en entier avec leur source : par label, les 9 meilleurs r, les 7 pires, 3 autour de 1.
- Les 3 fiches appli (sophia, unswipe, micabo) lues pour ne pas les contredire. Rien n'en est recopié.
- La consigne de traduction actuelle (`DEFAULT_TRANSLATE_PROMPT` dans gemini.ts) lue. Adrien a dit que la réécriture native la remplacera : la fiche redit donc les bases (tutoiement, pas de tiret, émojis) là où la banque les confirme.
- Langue de la fiche : anglais, sur demande d'Adrien (le brief disait français). Les titres de rubriques sont traduits mais gardent l'ordre du modèle « Partir du modèle » ; les noms de familles restent ceux de l'OS.

## Les chiffres derrière les règles

### Slides natives, par famille (pourcentage de slides)

| Famille | decks | slides | mots méd. | p25–p75 | multi-ligne | point final | « ! » | « ? » | parenthèses | émoji | tout minuscule | début minuscule | numéroté | du | ich | Sie | tiret – — |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Discipline | 64 | 471 | 13 | 9–19 | 93 | 58 | 1 | 6 | 1 | 2 | 1 | 5 | 32 | 59 | 7 | 1 | 2 |
| Fille cultivée | 69 | 521 | 18 | 6–31 | 87 | 43 | 6 | 11 | 1 | 8 | 9 | 18 | 12 | 39 | 8 | 1 | 9 |
| Études | 69 | 522 | 24 | 14–45 | 98 | 24 | 9 | 12 | 25 | 14 | 4 | 11 | 17 | 34 | 25 | 3 | 4 |
| Carrière | 27 | 165 | 34 | 23–46 | 99 | 21 | 8 | 27 | 8 | 33 | 0 | 0 | 7 | 62 | 51 | 8 | 13 |
| sans label | 24 | 234 | 36 | 16–106 | 98 | 76 | 15 | 25 | 30 | 4 | 0 | 0 | 21 | 38 | 12 | 3 | 17 |

« Sie » en Carrière = questions d'entretien citées. « multi-ligne » vient de l'OCR, qui garde les retours à la ligne de l'image.

### Decks natifs, par label

| Label | decks | slides méd. | vues méd. | avec ß | avec émoji | inclusif | Sie sans du | avec du | avec ihr | avec ich |
|---|---|---|---|---|---|---|---|---|---|---|
| classic_study | 63 | 6 | 10 300 | 39 | 27 | 0 | 1 | 50 | 4 | 41 |
| smart_girl | 49 | 6 | 2 055 | 19 | 10 | 0 | 0 | 43 | 4 | 11 |
| alpha_male | 38 | 7 | 4 653 | 10 | 8 | 0 | 0 | 36 | 2 | 12 |
| RH | 27 | 7 | 1 279 | 13 | 19 | 1 | 0 | 25 | 2 | 25 |
| sans label | 24 | 9 | 14 400 | 13 | 4 | 0 | 2 | 19 | 4 | 9 |
| weird_alpha | 20 | 6 | 2 405 | 10 | 0 | 0 | 0 | 20 | 1 | 6 |
| beau_smart_girl | 20 | 7 | 29 450 | 5 | 7 | 0 | 0 | 12 | 0 | 8 |
| medical_study | 6 | 7 | 75 500 | 3 | 3 | 0 | 0 | 0 | 3 | 4 |
| alpha_male_yellow | 6 | 5 | 32 200 | 1 | 0 | 0 | 0 | 6 | 0 | 5 |

« avec ß » = 113 decks sur 253 contiennent un ß ; aucun « daß », « Spass » ou « grosse » en minuscules relevé (les « GROSSE » en capitales sont corrects). Écriture inclusive : 1 deck (« Bewerber:innen », RH).

### Nos posts (1 641), par tranche de r

| Groupe | posts | slides | mots méd. | p75 | multi-ligne | point final | « ! » | émoji | parenthèses | numéroté | du | ich | Sie | tout minuscule | début minuscule |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bon (r ≥ 2) | 429 | 2 476 | 22 | 29 | 73 | 55 | 7 | 8 | 13 | 24 | 67 | 15 | 0 | 57 | 41 |
| moyen | 842 | 4 652 | 21 | 30 | 66 | 52 | 5 | 7 | 7 | 22 | 70 | 15 | 0 | 60 | 45 |
| faible (r < 0,6) | 370 | 1 992 | 22 | 31 | 67 | 46 | 6 | 8 | 8 | 24 | 75 | 15 | 0 | 69 | 50 |

Lecture : nous écrivons 22 mots par slide quelle que soit la famille, contre 13 chez les natifs Discipline ; nous sommes tout en minuscules dans 57 à 69 % des slides contre 1 à 9 % chez les natifs ; les posts faibles le sont un peu plus (69 contre 57). Les parenthèses d'aparté sont plus fréquentes dans nos bons posts (13 contre 8), comme chez les natifs Études.

### Nos accroches (slide 1)

| Groupe | n | mots méd. | relative « , die » | commence par wie/warum/was/wenn/so | chiffre au début | deux-points final | début minuscule | émoji |
|---|---|---|---|---|---|---|---|---|
| bon | 429 | 9 | 55 % | 19 % | 19 % | 3 % | 49 % | 8 % |
| moyen | 842 | 8 | 37 % | 30 % | 20 % | 1 % | 54 % | 8 % |
| faible | 370 | 8 | 39 % | 29 % | 20 % | 1 % | 60 % | 9 % |

Chez les natifs, à la lecture des 253 accroches : relative « [Nom], die … » environ 90 (dont une trentaine de « Bücher, die … » smart_girl), deux-points final environ 40 (15 %), « Wie du … » environ 15, accroche tout en capitales environ 20 (Discipline, RH « RECRUITER-SICHT », sans label), aparté entre parenthèses environ 15, question environ 20. Comptage manuel, à 5 près.

### Motifs comptés (posts ou decks qui contiennent le motif)

| Motif | natifs /253 | nos posts /1 641 | nos bons /429 | nos faibles /370 |
|---|---|---|---|---|
| point final sur une slide | 103 | 867 | 225 | 181 |
| wirklich | 55 | 336 | 85 | 82 |
| Folge/Folgt/Speicher/Kommentier | 84 | 335 | 115 | 61 |
| émoji | 78 | 274 | 78 | 67 |
| guillemets „“ | 85 | 181 | 52 | 35 |
| guillemets droits " | 28 | 173 | 50 | 30 |
| « Dinge, die » | 11 | 135 | 30 | 41 |
| « Du wirst » | 9 | 98 | 32 | 27 |
| Uhr | 13 | 80 | 23 | 16 |
| Erfolg | 23 | 70 | 25 | 12 |
| Teil 2 / Part 2 | 1 | 37 | 16 | 1 |
| Mindset | 6 | 30 | 4 | 8 |
| notes 1,0 / 1er | 19 | 28 | 7 | 5 |
| z.B. / bzw. / usw. | 18 | 21 | 4 | 5 |
| Die meisten Menschen | 2 | 18 | 5 | 4 |
| Komfortzone | 1 | 13 | 2 | 1 |
| Stell dir vor | 0 | 12 | 3 | 3 |
| Lycée / Bac / « /20 » | 0 | 11 | 2 | 2 |
| Ehrlich gesagt | 0 | 10 | 3 | 3 |
| tiret long ou demi-cadratin | 53 | 8 | 3 | 1 |
| Sie formel | 24 | 8 | 1 | 3 |
| Allgemeinwissen | 1 | 8 | 3 | 2 |
| Glaub mir | 0 | 5 | 3 | 1 |
| $ / Dollar / Meilen | 8 | 4 | 1 | 2 |
| Lass uns | 0 | 3 | 0 | 1 |
| Game-Changer | 2 | 2 | 1 | 1 |
| High School / College / GPA | 1 | 1 | 1 | 0 |
| macht Sinn, am Ende des Tages | 0 | 0 | 0 | 0 |

« krass » n'était pas dans la liste SQL : compté à la lecture, 1 deck natif (et c'est un de nos posts importés dans la banque, voir plus bas) contre plus de 10 accroches à nous dans l'échantillon de 174 (« krasse tricks », « Krasse Sachen » ×4, « krass selbstbewusst » ×4, « Krasse Fakten », « krank schlau », « eklig schlau », « unnormal schlau »).

## Ce que la banque a de particulier (à garder en tête)

- Une dizaine de comptes font l'essentiel de la banque, souvent avec le même post reposté : 8 decks « MENTALXPERT BUNDLE » (weird_alpha), 8 decks « Eleganszz » (beau_smart_girl), 7 decks de citations « – Schopenhauer » (alpha_male), 7 decks « ERFOLGNOW », 6 decks « akono ai » (classic_study, le même post en 4 variantes), 7 decks « citely.de », 8 decks « CVgood.dev » (RH, le même post en 6 variantes), environ 30 decks « Bücher, die dein Leben verändern können: » (smart_girl, 2 comptes). Les fréquences par label sont donc des fréquences de comptes plus que de créateurs.
- Au moins 3 decks alpha_male de la banque sont des posts à nous (ils placent « eine Wissens-App wie sophia », « eine Micro-Learning-App wie die Sophia-App », « Eine Allgemeinbildungs-App wie Sophia ») : « 14 verrückte Gewohnheiten » (208 100 vues), « Fakten fürs echte Leben » (84 800), « 5 Zeichen, dass du im Leben erfolgreich wirst » (1 327). Les « ERFOLGNOW » (7 decks) contiennent aussi un placement Sophia. À sortir de la banque ou à marquer, sinon la fiche s'apprend elle-même.
- Beaucoup de decks natifs sont des posts sponsorisés ou des tunnels : « Kommentiere „VIP“ », « Link in Bio », « Schreib RESPEKT », « Hol dir das Bundle ». Leur dernière slide n'est pas un modèle pour nous ; la fiche ne garde que la forme des recommandations (« wie akono ai », « prüft citely.de »).
- Slide d'engagement « Schau, wer dich heimlich stalkt: Teilen > Mehr > Aufrufe » (ou « Blockiert », « Repost Views ») : présente dans 12 decks Discipline et beau_smart_girl, toujours en slide 3 ou 4. Mécanique native très répandue, non reprise dans la fiche (c'est un piège d'engagement, pas de la langue).
- classic_study compte une quinzaine de « Lernzettel » (fiches de cours en image) et 7 decks de couvertures de manuels dans « sans label » : ils gonflent la longueur médiane des slides Études. La médiane de 24 mots est calculée avec eux ; sans eux, elle serait plutôt vers 18 à 20 (estimation à la lecture).
- Les 24 « sans label », rangés à la lecture : 15 en Discipline et psychologie (faits psychologiques, « 8 Sätze, die brutal ehrlich sind », « 10 Dinge, die die meisten Menschen erst lernen… », Zombie-Apokalypse, Metakognition, KI-Palantir, ChatGPT-Prompts, le récit « Ich bin 15 »), 6 couvertures de manuels (Mathe, Mechanik, Periodensystem, Geografie, Literatur, KI) à ranger en Études ou à écarter, 3 en anglais (Alien theories, Creepy facts, Nature's most powerful) à écarter de la banque `de`.

## Les manques

- Écrans et auto-amélioration (mentalmaxxing, Fathomly) : 0 natif, et nos 23 posts de ces labels ont le texte dans l'image. La fiche emprunte à Discipline ; rien ne le vérifie.
- white_bg : 0 natif, 31 posts à nous sans texte. Emprunte le style livres de smart_girl.
- clean_study, that_girl_study, faceless_study : 0 natif ; nos posts clean_study (29, source française, journal « Tag 6 ») s'appuient sur classic_study et sur les 6 medical_study.
- alpha_male_yellow : 6 natifs seulement (14 en erreur), dont 2 fois le même « Alkohol ist Gift » et 2 decks de citations. Le ton « stonemag » de nos posts n'a presque pas de référent natif.
- alpha_male_film : 0 natif, 3 posts à nous.
- medical_study : 6 natifs, tous d'un ou deux comptes (journal, « PJ »). Nos 97 posts medical_study viennent du français et sont bien plus « liste de faits » que les natifs.
- RH : 27 natifs mais 3 comptes (Recruiter-Sicht, CVgood, un coach). Le ton « récit à la première personne en minuscules » de nos meilleurs posts RH (r 7 à 17, sources françaises) n'existe pas dans la banque. Il marche pourtant : ne pas le casser au nom de la fiche.

## Les doutes

- Majuscules : la corrélation est faible (57 % de slides tout en minuscules chez nos bons posts, 69 % chez les faibles). Nos meilleurs posts RH et beau_smart_girl sont en minuscules. La règle 1 s'appuie surtout sur l'écart avec les natifs (1 à 9 %), pas sur nos r. À tester en A/B avant d'en faire une règle dure.
- « Wie du … » : 19 % de nos bons contre 29 % des faibles, mais la structure existe chez les natifs (une quinzaine d'accroches). La fiche la dit « moins forte », pas interdite.
- Médianes natives par famille : pesées par les comptes dominants (voir plus haut). Discipline 13 mots tient sur les listes de règles ; les decks de citations sont plus longs.
- « 1er Schülerin », « 1.1er schnitt », « 3.1 Abi » : les natifs mélangent point et virgule décimale dans les notes. La fiche impose la virgule (Duden) ; à vérifier si le point est perçu comme natif TikTok ou comme faute.
- « Hobbies » contre « Hobbys » : la banque a les deux ; Duden dit Hobbys.
- StepStone et XING comme sites d'emploi : absents de la banque (qui cite Google Jobs, Indeed, LinkedIn). Marqués « à vérifier ».
- Salaires : nos posts medical_study recopient des salaires français (« 500-600k pro Jahr » pour un urologue). Faux en Allemagne. La fiche dit de ne pas chiffrer ; un relecteur médical pourrait donner des ordres de grandeur allemands.
- « prépa » : traduit chez nous par « ohne Vorkurs » / « ohne Vorbereitungskurs ». Pas d'équivalent ; pour la médecine, le mot natif serait plutôt « Repetitorium » ou rien. Non tranché.
- Ton des pairs « comme un natif » : ce sont mes réécritures, pas des extraits natifs (choix d'Adrien).

## Habitudes natives qui contredisent une règle produit

- Tiret : la consigne interdit « — » et « – ». 53 decks natifs sur 253 (21 %) en contiennent, surtout le demi-cadratin pour signer une citation (« – Seneca ») ou couper une phrase (« Verschränkte Arme bedeuten Schutz – nicht Kälte. »). La fiche garde l'interdiction et propose le retour à la ligne pour signer une citation.
- Émojis : la consigne dit « pas d'emoji ajouté ». Les natifs en mettent dans 33 % des slides Carrière et 14 % des slides Études (fin d'accroche, tête de ligne, fin de post). La fiche donne les émojis par famille ; c'est un écart assumé avec la consigne actuelle, à trancher.
- Follow et save : la consigne interdit les formules de pub, et la place du CTA est décidée ailleurs. Les natifs finissent très souvent par « Folg mir gerne für mehr 💗 », « Speicher dir das », « Folgt für Part 2 » (84 decks sur 253 ont Folge/Speicher/Kommentier). La fiche note seulement comment ils le formulent.
- Produits tiers : la consigne interdit tout produit tiers. Les natifs en recommandent constamment (akono ai, citely.de, CVgood.dev, Google Jobs, Notion, Goodnotes, Knowunity, livres avec éditeur). La fiche ne garde que la forme de la recommandation.
- Point d'exclamation « en rafale » : interdit par la consigne ; « !! » et « !!! » sont courants en Fille cultivée et Études (« Speichern nicht vergessen!! », « Gamechanger!!! »). La fiche l'autorise une fois par post dans ces deux familles.
- « Micro-Learning-App » : la fiche appli Sophia interdit « micro-learning ». Nos posts l'écrivent encore dans la majorité des placements (« Micro-Learning-App wie die Sophia-App »). Hors de la fiche langue, mais à corriger dans le placement.

## Ce qui n'a pas été fait

- Les 3 réécritures de test : retirées du périmètre par Adrien.
- Les 98 decks en « erreur » : non lus (pas de slides). Relancer l'OCR doublerait beau_smart_girl et alpha_male_yellow.
- Pas de comparaison par compte : r neutralise déjà le compte.
