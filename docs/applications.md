# Applications et labels : le mode d'emploi

L'OS fabrique des slideshows qui font la promotion d'une application. Il en
connaît quatre. Ce document dit comment une application est décrite dans l'OS,
comment en ajouter une, et comment ajouter un label. Le détail du moteur
(répartition par compte, replis, decks, tiers) reste dans
`docs/multi-applications.md`.

## 1. Le modèle, en six phrases

1. Une **application** est ce qu'on promeut (Sophia, micabo, Unswipe, Atala).
2. Un **label** est une famille de contenus et de comptes (`smart_girl`,
   `clean_study`, `male_run`). Il sert **une** application, parfois deux.
3. Un **compte** porte un label. C'est le label qui dit ce que le compte peut
   publier : un compte au label `male_run` publie pour Atala.
4. Une **source** (compte TikTok de référence) est rangée sous un label. Ses
   contenus servent les applications de ce label.
5. Pour chaque application d'un label, l'OS **note** le contenu (prompt de
   pertinence), puis **écrit la slide de l'appli** (prompt de placement).
6. Une application **inactive** ne publie rien, mais son stock se prépare
   (notation) dès qu'un label la sert, et elle peut déjà recevoir les
   nouvelles recrues (§ 6, « Recruter avant l'activation »).

Un label et un podz par application : un contenu partagé entre deux
applications a une seule valeur BLEO, les vues de l'une faussent l'autre.

## 2. Les applications

| Application | Slug | Id en base | Ce qu'elle fait | Labels (19/11) |
|---|---|---|---|---|
| Sophia | `sophia` | `…0001` | culture générale | 19 |
| micabo | `micabo` | `…0002` | révisions pour les élèves et les étudiants | 4 |
| Unswipe | `unswipe` | `…0003` | ses réseaux sans les formats courts | 0 |
| Atala | `atala` | `…0004` | course à pied (running) | 4, inactive |

La liste de référence est **le catalogue** :
`src/features/moteur/catalogueApplications.ts` (et sa copie pour les fonctions
Edge, `supabase/functions/_shared/catalogue_applications.ts`, tenue identique
par un test). Une application = une ligne : slug, id, nom dans l'OS, marque
telle qu'on l'écrit dans un post, concept. L'ordre de la liste est celui des
graphes et des écrans.

Partent du catalogue, sans rien écrire de plus : les noms affichés, l'ordre et
la couleur dans les graphes, la liste des liens à 1 000 abonnés (Réglages), les
rayons de la banque de captures, le nom de l'appli dans les commentaires des
comment masters, et les phrases « nos applis » des prompts (OCR des stickers,
FAQ, classement des CTA).

## 3. Où vit quoi

| Quoi | Où | Qui le change |
|---|---|---|
| Nom, marque, concept, ordre | le catalogue (code) | un développeur |
| Logo | `src/assets/applications/<slug>.png` + `logosApplications.ts` | un développeur |
| Couleur des graphes | `--app-<slug>` dans `src/index.css` (clair et sombre) | un développeur |
| Concurrents | `_shared/concurrents.ts` (`MOTIFS_PAR_APPLICATION`) | un développeur |
| Nom dans le suivi Notion | `_shared/notion.ts` (`APP_VERS_NOTION`) + l'option « App » dans Notion | un développeur |
| Interrupteur, langues ciblées | Labels & applications → Applications | l'admin, à l'écran |
| Prompts `pertinence_<slug>`, `placement_<slug>` | Configuration → Traduction & placement | l'admin, à l'écran |
| Fiche de l'appli (agents de langue, relecteurs) | Fiches | l'admin, à l'écran |
| Lien à 1 000 abonnés | Réglages → Textes aux posteurs | l'admin, à l'écran |
| Labels qui la servent | Labels & applications → Labels | l'admin, à l'écran |
| File des créateurs par application | Réglages → Warmup & file de labels | l'admin, à l'écran |
| Angles de placement (label × application) | Configuration → Traduction & placement | l'admin, à l'écran |
| Captures et mises en scène | Bibliothèque | l'admin, les podz |

**L'état de préparation d'une application se lit à l'écran** : Labels &
applications → Applications → déplier la ligne. La liste « Préparation » donne,
dans l'ordre, ce qui est fait et ce qui manque (code, prompts, lien à 1 000
abonnés, labels, langues, interrupteur). Le point en gras est le prochain.

## 4. Ajouter une application

Dans cet ordre. Les étapes 1 à 3 sont du code ; les tests refusent une
application à moitié déclarée et disent ce qui manque
(`catalogueApplications.test.ts`, `concurrents_test.ts`).

1. **Le catalogue** : une ligne dans `catalogueApplications.ts`, à la fin, avec
   un id fixe (`…0005` pour la suivante). Recopier le corps du fichier dans
   `_shared/catalogue_applications.ts`.
2. **Le logo et la couleur** : `src/assets/applications/<slug>.png` (128 × 128,
   plein cadre, l'arrondi vient du CSS), une ligne dans `LOGOS`
   (`src/components/brand/logosApplications.ts`), et dans `src/index.css` `--app-<slug>` deux fois
   (thème clair, thème sombre) plus `--color-app-<slug>`.
3. **Les concurrents et Notion** : son motif dans `_shared/concurrents.ts`,
   inscrit dans `MOTIFS_PAR_APPLICATION` ; sa ligne dans `APP_VERS_NOTION`.
4. **La base**, par une migration sur le modèle de `0761_application_atala.sql` :
   la ligne `applications` (même id que le catalogue, **inactive**), ses deux
   prompts, son lien à 1 000 abonnés. Appliquer la migration avant de merger.
5. **À l'écran** : relire ses prompts, écrire sa fiche, créer ses labels
   (§ 5), lancer le rattrapage de pertinence si un label existant la sert,
   puis l'activer.

On peut aussi créer l'application depuis l'écran (« Ajouter une application ») :
elle naît inactive avec deux prompts vides. Elle marche sans les étapes 1 à 3,
avec une pastille grise à la place du logo et les seuls concurrents de Sophia.
La ligne « Préparation » le signale.

Un prompt écrit d'avance, sans le vrai pitch, commence par une ligne
`[BROUILLON À RELIRE …]`. Tant que cette ligne est dans le texte, la carte le
montre « en brouillon » et **l'activation est refusée**. La retirer, c'est dire
« relu ».

## 5. Ajouter un label

Labels & applications → Labels. Les labels sont rangés par application ; le
bouton « Label <application> » d'un groupe ouvre le formulaire avec la bonne
application.

1. **L'application.** Une seule. Le label la sert (`label_applications`) et la
   prend comme application principale (`labels.application_id`, lue par le
   doublement du jeudi et la banque d'images des podz).
2. **Le nom**, en minuscules et tirets bas. Il n'est pas décoratif : il fixe
   l'identité des comptes du label. Le formulaire l'annonce avant de créer.

   | Le nom contient | @ et bio des comptes | Exemple de @ | Niche dite au posteur |
   |---|---|---|---|
   | `run`, `running`, `runner`, `marathon`, `trail`, `jogging` (mot entier) | running, en @ variés (voir plus bas) | `emma.mrtn04`, `itsleaa217`, `lou2003.sunday` | running |
   | `study`, `etud` | études | `lea.revisions318` | study |
   | `rh`, `career`, `carriere` | carrière | `emma.career204` | career advice |
   | `psych`, `mental` | psycho | `noah.mind611` | psychology |
   | `plony`, `stoi`, `philo` | philo | `marc.stoic530` | philosophy |
   | `alpha`, `male` (hors `female`) | discipline | `jakob.discipline473` | self-improvement |
   | `clean` | bien-être | `mia.glow385` | wellness |
   | `girl`, `smart`, `beau` | lecture et culture | `lena.books129` | books and culture |
   | rien de tout ça | culture générale | `lea.culture218` | general knowledge |

   **La niche du warm-up suit le label** (19/11). L'accueil d'un posteur est
   le même pour toutes les applications ; une seule chose dépend de son
   compte : la niche où on lui demande de scroller et de s'abonner pendant le
   warm-up. C'est la dernière colonne, en anglais comme tous les textes aux
   posteurs (`NICHE_PAR_THEME`, `label_theme.ts` et sa copie `themeLabel.ts`).
   Elle est dite à six endroits :
   - les écrans d'accueil (« Your first week » et « Your warm-up »), qui la
     nomment quand le label du compte est lisible, sinon « your niche » ;
   - l'étape 4 du dashboard, celle du warm-up : les 5 étapes d'un posteur
     Upwork (`CinqEtapes`) et la checklist d'un posteur Ruul
     (`ChecklistRuul`), une ligne « Scroll and follow accounts in your
     niche: … », absente si le label n'est pas lisible ;
   - la checklist du premier post (`ChecklistPremierPost`), dans la question
     des commentaires ;
   - la bienvenue Upwork (réglage `accueil_message_texte`, variable `{niche}`) ;
   - les nudges « warmup » et « pret » de la page Onboarding posters (réglage
     `onboarding_nudges`, variable `{niche}`) ;
   - le message « Not warmed up » du dimanche soir.

   Côté dashboard, la niche est lue par le posteur lui-même sur les labels de
   son compte (`maNiche.ts`). Avant, les trois messages disaient « general
   knowledge » à tout le monde, même à un compte de running. Pour changer une niche : `NICHE_PAR_THEME`,
   dans les deux fichiers. Un compte à plusieurs labels prend la niche du
   premier, par ordre alphabétique, qui en a une à lui.

   Le running passe avant le reste : `clean_girl_run` prend l'identité du
   running, mais garde le genre et la banque de photos de profil de
   `clean_girl`. Un label Atala se termine donc par `_run`, un label micabo par
   `_study` ; le formulaire le rappelle si le nom ne colle pas.

   **Les @ variés (running).** Trente comptes « prenom.mot-de-course123 » se
   reconnaissent au premier coup d'œil. Les comptes d'un label de running
   tirent donc chacun une forme différente, parmi une quarantaine
   (`persona_handles_varies.ts`) :
   - le nom seul, environ une fois sur deux : `emma.mrtn04`, `clara_bonnet482`,
     `leaa217`, `itsjade1999`, `cest.manon305`, `theo_g2004` ;
   - le prénom et un mot, deux fois sur cinq : `lou.sunday22`, `matcha.ines671`,
     `noahsmaps48`, et de temps en temps un mot de course (`paul_foulees66`) ;
   - deux mots sans nom, rarement : `slow.mornings914`.

   **Toujours un nombre**, de 2 à 4 chiffres (une année de naissance ou un
   nombre quelconque) : un @ sans chiffres est presque toujours déjà pris sur
   TikTok, et la recrue ne pourrait pas créer son compte. Les formes les plus
   simples (prénom + nom entier, prénom seul, deux mots sans nom) en prennent
   3 ou 4. Le nombre est à la fin, parfois juste après le prénom
   (`emma04.mrtn`).

   Un mot de course apparaît dans moins d'un @ sur cinq, et une bio sur trois
   seulement parle de course. Le nom affiché reste « Prénom Nom », celui que le
   @ reprend. Si le @ est quand même pris, la recrue donne le sien dans « My
   TikTok account » et l'OS le remplace.
   Pour passer un autre thème aux @ variés : l'ajouter à `THEMES_VARIES`
   (`persona_identite.ts`) et à `EXEMPLES_VARIES` (`groupesLabels.ts`).
3. **Le genre** des comptes (prénoms, noms, photo de profil). Proposé d'après
   le nom (`male_run` → homme, `…_girl…` et `…female…` → femme), modifiable.
4. Ensuite, le formulaire le rappelle :
   - ajouter ses comptes source et les importer (Sources) ;
   - le mettre dans la file des créateurs de son application (Réglages →
     Warmup & file de labels), sinon les recrues ne le reçoivent que par le
     choix équilibré ;
   - écrire son style d'écriture (ligne dépliée du label), utile aux
     créations manuelles et aux podz ;
   - si besoin, un angle de placement et une fiche label.

Mettre un label de côté : décocher sa dernière application. Il passe dans le
groupe « Sans application », rien n'est supprimé.

## 6. Recruter avant l'activation

Recruter et publier sont deux choses (migration 0770, 19/11).

- **Activer** une application ouvre la publication. C'est refusé tant que ses
  prompts sont des brouillons.
- Une application **en préparation** (inactive, mais servie par au moins un
  label slideshow) peut recevoir les nouvelles recrues. Elle apparaît dans
  Allocation → « Répartition entre applis », marquée « Inactive ». **C'est la
  part qu'on lui saisit dans la cible qui décide** : à 0, elle ne reçoit rien.

Ce que devient un compte créé pour elle : `parts_applications =
{"<slug>": 100}`, un de ses labels (File de l'application, sinon le choix
équilibré : sans stock, ses labels pèsent pareil et les comptes se répartissent
entre eux), son identité, son warm-up. Ensuite la nuit le passe (« application
désactivée », quota intact) jusqu'à l'activation. Il ne publie jamais pour une
autre application.

À avoir en tête :

- **Le warm-up finit un lundi.** Il faut que l'application soit activée et que
  ses labels aient du stock d'ici là, sinon le posteur n'a rien à publier.
- **Les recrues du site suivent la cible comme les autres** (19/11). Avant,
  le site choisissait l'application de ses candidats : il demandait toujours
  Sophia, et une recrue sur trois échappait à la cible. Voir
  `docs/hub-posteurs.md`, « Qui choisit l'application d'un poster du site ».
- **Tous ses labels reçoivent des comptes**, à parts égales tant qu'aucun n'a
  de stock. Retirer l'application d'un label qu'on ne veut pas voir servi.

La règle « en préparation » vit en base (`applications_en_preparation()`), lue
par le moteur (`stats_choix_application`) et par la page
(`lireApplicationsEnPreparation`, `candidates.ts`) : les deux ne peuvent pas se
contredire.

## 7. Atala : où on en est (19/11)

Fait :
- l'application en base (`…0004`), **inactive**, toutes langues (0764) ;
- le catalogue, le logo, la couleur (vert), le nom Notion ;
- ses concurrents : Runna, Nike Run Club / NRC, Couch to 5K, Runkeeper,
  adidas Running app / Runtastic, Coopah, Kiprun Pacer, Campus Coach,
  RunMotion, TrainingPeaks, Garmin Coach, None to Run, Trenara, RunSmart,
  Runcoach, MapMyRun, Zombies Run, Run with Hal. Pas Strava ni les montres :
  ce sont des outils cités dans le conseil. Liste écrite avant tout stock, à
  mesurer sur les premières sources importées ;
- l'identité des comptes de running : des @ variés (§ 5), des bios de course
  ou de tous les jours, dans les 32 langues ;
- le lien à 1 000 abonnés : `taap.it/atala` ;
- la Bible : la section « Runvik » (nom de travail) est devenue « Atala »,
  reliée à l'application (0765). Dans l'ajout en masse, « runvik » désigne
  toujours Atala.

- ses premiers labels (19/11) : `classic_girl_run`, `clean_girl_run`,
  `male_run`, `manga_tok`. Aucune source, aucun contenu, aucun compte ;
- le recrutement avant l'activation (§ 6) : Atala a sa ligne dans Allocation,
  il suffit de lui donner une part pour que les prochaines recrues soient des
  comptes Atala.

Reste à faire, à l'écran :
1. **Relire les deux prompts** (`pertinence_atala`, `placement_atala`). Ce sont
   des brouillons : ils ne savent d'Atala que « course à pied » et
   n'affirment aucune fonctionnalité. Compléter le bloc « PITCH À COMPLÉTER »
   du placement, puis retirer la ligne `[BROUILLON …]` de chacun.
2. **Créer le lien** `taap.it/atala` (ou corriger le lien dans Réglages).
3. **Compléter ses labels** (ceux de la Bible qui manquent :
   `white_female_run`, `white_bg_run`, `anxiety_run`…), ajouter leurs sources
   et les importer. `manga_tok` n'a pas `run` dans son nom : ses comptes
   prennent l'identité « culture générale », pas celle du running (§ 5).
4. Écrire sa fiche (Fiches), ajouter l'option « Atala » au select « App » du
   suivi Notion.
5. **L'activer**, avant le lundi où ses premières recrues sortent du warm-up.

## 8. Pièges connus

- **Ne pas décocher Sophia d'un label existant** pour le donner à une autre
  application : tous ses comptes changeraient d'application. Créer un label.
- **Une application sans lien à 1 000 abonnés** : ses comptes recevraient le
  lien de Sophia. La ligne « Préparation » le signale.
- **Le nom d'un label ne se change pas à la légère** : l'identité des comptes
  déjà créés ne bouge pas, celle des suivants si.
- **Un compte UGC reste Sophia**, quelle que soit l'application de son label.
- **Désactiver une application ne coupe pas son recrutement** si elle garde des
  labels et une part dans la cible : elle redevient « en préparation » (§ 6).
  Pour l'arrêter tout à fait, remettre sa part à 0 dans Allocation.
- Les migrations se passent à la main (SQL Editor ou MCP), hors fenêtres de
  nuit (21:50–23:15 UTC, 03:55–04:15 UTC) ; les fonctions Edge se déploient au
  merge.
