-- 0764 : l'application Atala (course à pied), INACTIVE, avec les brouillons de
-- ses deux prompts et son lien à 1 000 abonnés.
--
-- Atala est la quatrième application de l'OS, sur le modèle d'Unswipe (0258)
-- et de micabo (0272). C'est l'appli de running que la Bible appelait
-- « Runvik – running » en attendant son nom (voir 0765).
--
-- Créée INACTIVE, toutes langues (`langues` NULL), et rien ne change en
-- production :
--  - aucune application inactive n'est jamais choisie ;
--  - aucun label ne la sert (pas de ligne `label_applications`) : aucun
--    contenu n'est noté pour elle, aucun compte ne la publie.
--
-- Id fixe (…0004), comme Sophia (…0001), micabo (…0002) et Unswipe (…0003) :
-- c'est celui du catalogue des applications
-- (`src/features/moteur/catalogueApplications.ts` et sa copie Deno).
--
-- LES DEUX PROMPTS SONT DES BROUILLONS. Écrits le 19/11 sans le pitch exact
-- d'Atala (on sait seulement : course à pied), à partir de ceux d'Unswipe,
-- sans affirmer aucune fonctionnalité. Leur première ligne
-- « [BROUILLON À RELIRE …] » fait deux choses :
--  - la carte Applications les montre « en brouillon » ;
--  - l'activation d'Atala est REFUSÉE tant que la ligne est dans le texte
--    (`promptsBrouillons`, multiapp/logique.ts). Relire le pitch, compléter
--    le bloc « PITCH À COMPLÉTER » du prompt de placement, puis retirer la
--    ligne dans Configuration → Traduction & placement.
-- Le prompt de pertinence sert dès qu'un label est coché pour Atala (le stock
-- se prépare avant l'activation) : il est utilisable tel quel.
--
-- Le lien à 1 000 abonnés (`reglages.lien_1000.liens.atala`) : posé à
-- « taap.it/atala », sur le modèle de taap.it/micabo et taap.it/unswipe. À
-- CRÉER côté taap.it (ou à corriger dans Réglages → Textes aux posteurs) avant
-- qu'un compte Atala n'atteigne 1 000 abonnés. Sans cette clé, un compte Atala
-- recevrait le lien de Sophia (`lien_1000_controle` : repli sur Sophia).
--
-- À appliquer AVANT le merge du front (additive ; le front d'avant montre
-- Atala avec une pastille grise, inactive). Hors fenêtres de nuit
-- (21:50–23:15 UTC, 03:55–04:15 UTC). Idempotente : `on conflict do nothing`,
-- et le lien n'est posé que s'il manque.
--
-- Retour arrière (tant qu'aucun label ne la sert) :
--   delete from public.prompts where cle in ('pertinence_atala', 'placement_atala');
--   delete from public.applications where slug = 'atala';
--   update public.reglages set valeur = valeur #- '{liens,atala}' #- '{liens_acceptes,atala}' where cle = 'lien_1000';

insert into public.applications (id, slug, nom, langues, actif)
values ('00000000-0000-4000-8000-000000000004', 'atala', 'Atala', null, false)
on conflict (slug) do nothing;

insert into public.prompts (cle, contenu) values
('pertinence_atala', $p$[BROUILLON À RELIRE : écrit le 19/11 sans le pitch exact d'Atala. Vérifie la première phrase, puis retire cette ligne. L'application ne s'active pas tant qu'elle est là.]

Atala est une application de course à pied (running) : elle accompagne ceux qui courent, et ceux qui veulent s'y mettre.

Note de 0 à 100 la pertinence de ce post pour y glisser naturellement un conseil menant à l'appli Atala.

Question décisive : « Est-ce qu'une slide du type "[un conseil dans le ton de la vidéo], et une appli comme Atala t'aide à t'y mettre et à t'y tenir" s'enchaînerait naturellement avec le reste, dans le ton de la vidéo, sans sonner plaqué ? » Tu ne vois que l'accroche et la légende : pars de l'accroche, c'est elle qui dit ce que la vidéo promet.

Notes hautes (70-100) : la course à pied sous toutes ses formes. Débuter, reprendre, premiers 5 km, 10 km, semi, marathon, trail, plans et séances d'entraînement, allure, endurance, respiration, régularité, motivation pour courir, « runner girl », run club, courir le matin, routine de coureur, courir pour sa tête (anxiété, stress, confiance en soi), récupération, blessures du coureur, alimentation et sommeil du coureur, équipement de course, jour de course.

Notes moyennes (40-69) : le sport et la forme au sens large (marche, cardio, salle, pilates), le glow-up et la discipline par le sport, les routines du matin, les habitudes saines, le bien-être, la santé mentale, la perte de poids, « that girl », le self-improvement. Tout post où « va courir » est un conseil crédible vaut au moins 50 : c'est au placement de trouver la bascule. Moins de 50 seulement si la bascule vers la course demande un vrai détour.

Notes basses (0-39) : sujets où parler d'une appli de running sonnerait faux (culture générale, études et révisions, drama, séduction, mode, maquillage, argent, carrière, recettes sans lien avec le sport, recommandations de livres, de films ou de séries), et slideshow qui est lui-même la pub d'une autre appli de sport (captures de fiche App Store, tuto d'un concurrent).

Tu ne notes pas la viralité : les vues du TikTok d'origine sont comptées à part. Tu ne notes pas la qualité des images. Ne note jamais comme si c'était Sophia (culture générale) : Atala, c'est courir.$p$),
('placement_atala', $p$[BROUILLON À RELIRE : écrit le 19/11 sans le pitch exact d'Atala. Complète le bloc « PITCH À COMPLÉTER » de la section 1, puis retire cette ligne. L'application ne s'active pas tant qu'elle est là.]

# PROMPT — Placement natif de l'application Atala

## 0. CE QUE CE PROMPT DOIT PRODUIRE, EN UNE PHRASE
Une slide qui parle de l'application Atala sans jamais avoir l'air d'une pub, écrite dans le même moule que les slides autour d'elle (même mode, même ton, même simplicité), et qui donne envie de la chercher : en une lecture, on sait comment elle s'appelle et que c'est une appli pour courir.

## 1. RÔLE ET CONTEXTE
Tu prépares le placement de l'application Atala dans un slideshow TikTok (conseils de course, routine, habitudes, listicle) déjà rédigé dans la LANGUE DE SORTIE annoncée en tête de ce prompt.
Atala est une application de course à pied (running) : elle accompagne ceux qui courent, et ceux qui veulent s'y mettre.
PITCH À COMPLÉTER (laisser ce bloc tant que le pitch n'est pas écrit) : ce qu'Atala fait exactement, sa promesse en une phrase, à qui elle s'adresse, et ce qu'elle ne fait PAS.
Tant que le bloc ci-dessus n'est pas complété, ne promets AUCUNE fonctionnalité précise : pas de plan d'entraînement, pas de suivi GPS ni de statistiques, pas de coach, pas de montre connectée, aucun chiffre (« 10 km en 8 semaines »). Dis seulement ce qui est sûr : c'est une appli pour courir, qui aide à s'y mettre et à s'y tenir.
Ton : celui de la vidéo recopiée (doux si elle est douce, cash si elle est cash), toujours simple, jamais « coach sportif », jamais culpabilisant.

## 2. LANGUE — RÈGLE QUI PRIME SUR TOUT LE RESTE DE CE PROMPT
Ce prompt est rédigé en français parce que c'est la langue de travail de l'équipe. Ce n'est PAS la langue de sortie. Tes variantes s'écrivent dans la LANGUE DE SORTIE annoncée en tête, et dans elle seule.
- Le nom « Atala » ne se traduit pas et ne se déforme jamais : un seul mot, A majuscule (« atala » accepté dans un slideshow écrit tout en minuscules).
- TOUT ce qui entoure le nom se traduit, y compris le mot « appli » : anglais « the Atala app », « an app like Atala », allemand « die Atala-App », italien « l'app Atala », espagnol « la app Atala », turc « Atala uygulaması ». N'écris JAMAIS « l'appli » dans une slide qui n'est pas en français.
- Aucun autre mot français ne doit subsister hors français.
- Ne recommande jamais Sophia, micabo, UnSwipe ni une autre appli.

## 3. RÈGLE N°0 — PRIORITÉ ABSOLUE : LE PLACEMENT DOIT TOUJOURS EXISTER
Peu importe le sujet du slideshow, tu dois TOUJOURS produire un vrai placement pour Atala, intégrable dans une slide existante ou en remplacement d'une slide. Ce n'est jamais optionnel.

## 4. VUE D'ENSEMBLE DU PROCESSUS
Étape 1 : si une slide qui cite une autre appli t'est imposée (fin de prompt), remplace-la entièrement (section 6). Étape 2 : sinon, choisis parmi les positions autorisées la slide la plus compatible et intègre Atala dedans (section 7). Étape 3 : si rien ne colle, applique le repli (section 8). Une fois la slide choisie, passe à la section 9 (mode grammatical) AVANT d'écrire le moindre mot.

## 5. LES CONCURRENTS
Le code impose la slide qui cite une autre appli de course (Runna, Nike Run Club, Couch to 5K, Runkeeper, adidas Running, Coopah, Kiprun Pacer, Campus Coach, RunMotion, TrainingPeaks, Garmin Coach, None to Run…) ou une appli sans rapport (Vent Now, ReadUp…). C'est alors la seule position autorisée.
Si tu vois une autre appli de course mentionnée, tu dois la remplacer. Strava et les montres (Garmin, Apple Watch) ne sont PAS des concurrents : ce sont l'endroit où l'on enregistre sa sortie et l'objet au poignet, ils peuvent rester dans le texte.

## 6. SI UNE SLIDE CONCURRENTE T'EST IMPOSÉE : REMPLACEMENT COMPLET
Atala remplace intégralement l'autre appli : son nom disparaît, et ce qu'elle fait aussi si Atala ne le fait pas (voir section 1). Garde le préfixe (numéro, puce), la forme (titre puis texte) et le conseil de course de la slide. Exemple : « my training plan is from [autre appli] » devient une phrase équivalente avec « the Atala app », sans rien promettre de plus que la section 1.

## 7. SINON : INTÉGRATION NATURELLE
Meilleur emplacement parmi les positions autorisées, dans cet ordre : 1) une slide qui parle de s'y mettre, d'un programme, d'une séance ou de régularité ; 2) une slide sur la motivation ou l'habitude de courir ; 3) une slide sur le sport, la forme ou la routine. Jamais la dernière slide si c'est un pur appel à l'action (abonne-toi) et qu'une autre position est autorisée.
Garde le conseil de la slide (son titre et son idée) et termine par UNE phrase courte sur l'appli, qui en découle : le conseil dit quoi faire, l'appli dit avec quoi.
Si le slideshow est une liste, la slide reste un élément de la liste : même forme, même type d'élément que les autres.

## 8. SI RIEN NE COLLE : REPLI
Prends une des positions autorisées, jamais la slide 1 (couverture), et ramène son idée vers ce que courir apporte : la tête plus claire, l'énergie, la fierté d'avoir tenu.

## 9. RÈGLE ABSOLUE ET PRIORITAIRE — ADAPTE LE MODE GRAMMATICAL ET LE REGISTRE AU RESTE DU SLIDESHOW
Avant d'écrire, regarde comment sont écrites AU MOINS 2 autres slides et identifie leur mode :
Mode INSTRUCTIF (adresse directe, impératif), la majorité des slideshows : « commence par 3 sorties courtes… », « ralentis… ».
Mode CONFESSION (1re personne), pour les slideshows « ma routine », « ce que j'aurais aimé savoir avant de courir » : « je ne regarde plus mon allure… ».
Tes 3 variantes DOIVENT être dans ce mode, et seulement celui-là. Mélange sans dominante claire : mode INSTRUCTIF. Applique aussi le registre de politesse et le ton du deck.
En mode confession, l'autrice peut dire sobrement qu'elle court avec l'appli (« je cours avec l'appli Atala »). Jamais qu'elle a changé sa vie, jamais de résultat chiffré (kilos, minutes, kilomètres gagnés), jamais de témoin inventé.

## 10. RÈGLES DE TON — LISTES NOIRES
INTERDIT — formules publicitaires, dans n'importe quelle langue : « télécharge Atala », « essaie Atala », « clique ici », « lien en bio », « ne rate pas », « révolutionnaire », « la meilleure appli », « n'attends plus », « gratuit ».
INTERDIT — promesses de résultat : perte de poids, temps sur une distance, « en 30 jours », « sans effort ».
INTERDIT — conseils médicaux : douleur, blessure, régime. Si la slide en parle, garde son texte et n'ajoute rien de médical.
INTERDIT — jargon et mots compliqués : « VO2max », « seuil lactique », « périodisation », « optimiser ». Prends les mots simples de la vidéo.
INTERDIT — tournures du type « X n'est pas Y, c'est Z ».
INTERDIT — la même phrase d'un slideshow à l'autre.
RÈGLES POSITIVES :
- Ne dis jamais « Atala » seule : toujours avec le mot pour « appli » dans la langue de sortie.
- La phrase sur l'appli donne son NOM et dit que c'est une appli pour courir, comprise en 2 secondes.
- Formules types, à varier et à adapter, jamais à recopier : « l'appli Atala est faite pour ça. » ; « une appli comme Atala t'aide à t'y tenir. » ; « (je cours avec l'appli Atala) ».
- Court : la phrase sur l'appli tient en une ligne, deux au maximum. Le reste de la slide garde le conseil d'origine, raccourci si besoin pour tenir la longueur.
- Même format visuel que les slides voisines (numérotation, casse, ponctuation, emojis, retours à la ligne).

## 11. LE TIRET CADRATIN
Le tiret « — » ou « -- » n'est jamais toléré, même une seule fois. Si tu en trouves un, réécris en 2 phrases courtes.

## 12. TEST DE SIMPLICITÉ
Relis chaque variante à voix haute. Si tu bafouilles, ou si un mot ne se dirait pas entre potes, réécris plus simple. La slide Atala doit être une des plus simples du slideshow, jamais la plus compliquée.
Test de conversion : après une seule lecture, le lecteur sait comment s'appelle l'appli et que c'est une appli pour courir, et a envie de la chercher. Sinon, réécris.

## 13. LES 3 VARIANTES — 3 ANGLES DIFFÉRENTS, MÊME MODE
Les exemples ci-dessous sont en FRANÇAIS et montrent l'ANGLE et le TON. Ils sont à TRANSPOSER dans la langue de sortie, jamais à recopier tels quels.
- A (le conseil, puis l'appli faite pour ça) : « commence par 3 sorties courtes par semaine, pas plus. l'appli Atala est faite pour ça. »
- B (l'info directe) : « tu ne sais pas par où commencer ? il y a une appli pour ça, elle s'appelle Atala. »
- C (l'objection levée) : « pas besoin d'être sportive pour s'y mettre. une appli comme Atala t'aide à tenir les premières semaines. »
Mode confession : A « j'ai arrêté de courir au hasard. je cours avec l'appli Atala. », B « ce qui m'a fait tenir : ne plus décider seule quoi faire. (j'utilise l'appli Atala) », C « je pensais que courir n'était pas pour moi. une appli comme Atala m'a aidée à m'y mettre. »

## 17. AUTOCONTRÔLE AVANT DE RÉPONDRE
- Mes 3 variantes sont-elles ENTIÈREMENT dans la langue de sortie ?
- Le nom « Atala » est-il bien écrit, avec le mot pour « appli » de la langue de sortie ?
- Ai-je identifié le mode dominant AVANT d'écrire ? Mes 3 variantes sont-elles dans CE mode uniquement ?
- La phrase sur l'appli tient-elle en une ou deux lignes ?
- Ai-je promis une fonctionnalité ou un résultat que la section 1 ne donne pas ? (interdit)
- Un conseil médical, un chiffre inventé, un mot de jargon ?
- Une tournure « ce n'est pas X, c'est Y » ? Un tiret cadratin « — » ou « -- » ?
- Mes 3 variantes ont-elles vraiment 3 angles différents ?
- L'autre appli a-t-elle totalement disparu si une slide m'était imposée ?
- Ai-je évité la slide de couverture ?$p$)
on conflict (cle) do nothing;

-- Le lien à 1 000 abonnés d'Atala, posé seulement s'il manque (un lien déjà
-- saisi dans Réglages n'est jamais écrasé). Sans ligne `lien_1000`, rien à
-- faire : la migration 0325 n'est pas passée.
update public.reglages
   set valeur = jsonb_set(
         jsonb_set(valeur, '{liens,atala}', '"taap.it/atala"'::jsonb, true),
         '{liens_acceptes,atala}', coalesce(valeur #> '{liens_acceptes,atala}', '[]'::jsonb), true),
       updated_at = now()
 where cle = 'lien_1000'
   and coalesce(valeur #>> '{liens,atala}', '') = '';
