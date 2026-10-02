-- 0258 : l'application Unswipe (INACTIVE) + brouillons de ses deux prompts.
--
-- À appliquer APRÈS le déploiement du front multi-app : l'ancien front listait
-- toutes les applications dans son sélecteur et cloisonnait labels, sources et
-- comptes par application — y voir Unswipe permettait de créer des sources ou
-- des comptes « Unswipe » que le moteur aurait ignorés.
--
-- Créée INACTIVE et sans langue ciblée : rien ne change en production tant
-- qu'on ne l'a pas activée dans Pilotage → Applications, après relecture des
-- deux prompts (Réglages → Prompts, sélecteur sur Unswipe).
--
-- Id fixe (…0003), comme Sophia (…0001) : les tests et la doc peuvent le citer.

insert into public.applications (id, slug, nom, langues, actif)
values ('00000000-0000-4000-8000-000000000003', 'unswipe', 'Unswipe', '{}', false)
on conflict (slug) do nothing;

-- BROUILLONS — à relire et compléter (pitch exact, fonctionnalités réelles,
-- formulations interdites). Éditables dans Réglages → Prompts.
insert into public.prompts (cle, contenu) values
('pertinence_unswipe', $p$Unswipe est une application qui aide à reprendre le contrôle de son temps : moins de scroll automatique sur les réseaux, moins de téléphone par réflexe, plus de temps pour ce qui compte vraiment.

Note de 0 à 100 la pertinence de ce post pour y glisser naturellement un conseil menant à l'appli Unswipe.

Question décisive : « Est-ce qu'une slide du type "j'ai mis Unswipe pour arrêter de scroller sans fin, et j'ai récupéré mes soirées" s'enchaînerait naturellement avec le reste, sans sonner plaqué ? »

Notes hautes (70-100) : temps d'écran, doomscrolling, addiction au téléphone, dopamine, concentration, discipline, routines du matin et du soir, productivité personnelle, habitudes, sommeil, « that girl », clean girl, self-improvement, détox digitale, vivre plus intentionnellement, lire plus et scroller moins.

Notes moyennes (40-69) : lifestyle, organisation, bien-être, motivation — intégrable si l'on peut basculer vers « lâcher son téléphone / reprendre son temps ».

Notes basses (0-39) : sujets où parler d'une appli anti-scroll sonnerait faux (pure culture générale sans lien avec les habitudes, humour, drama, mode, recettes…).

Ne note jamais comme si c'était Sophia (culture générale) : Unswipe, c'est reprendre le contrôle de son temps.$p$),
('placement_unswipe', $p$# PROMPT — Placement publicitaire natif de l'application Unswipe (BROUILLON)

## 0. CE QUE CE PROMPT DOIT PRODUIRE, EN UNE PHRASE
Une slide qui parle de l'application Unswipe sans jamais avoir l'air d'une pub, écrite EXACTEMENT dans le même moule que les slides autour d'elle — même mode grammatical, même niveau de simplicité, comme si c'était la même personne qui avait écrit tout le slideshow d'une traite.

## 1. RÔLE ET CONTEXTE
Tu prépares le placement publicitaire de l'application Unswipe dans un slideshow TikTok (conseils, habitudes, listicle) déjà rédigé dans la LANGUE DE SORTIE annoncée en tête de ce prompt. Unswipe aide à reprendre le contrôle de son temps : arrêter de scroller par réflexe, lâcher son téléphone, récupérer des heures pour ce qui compte. Positionnement : "reprends le contrôle de ton temps". Ton : sérieux mais accessible, adulte, jamais moralisateur, jamais culpabilisant, jamais "coach".

## 2. LANGUE — RÈGLE QUI PRIME SUR TOUT LE RESTE DE CE PROMPT
Ce prompt est rédigé en français parce que c'est la langue de travail de l'équipe. Ce n'est PAS la langue de sortie. Tes variantes s'écrivent dans la LANGUE DE SORTIE annoncée en tête, et dans elle seule.
- Le nom "Unswipe" ne se traduit pas et ne se déforme jamais : toujours "Unswipe", U majuscule, en un seul mot.
- TOUT ce qui l'entoure se traduit, y compris le mot "appli" : anglais "the Unswipe app", allemand "die Unswipe-App", italien "l'app Unswipe", espagnol "la app Unswipe"…
- N'écris JAMAIS la forme française "l'appli" dans une slide qui n'est pas en français.
- Ne mentionne JAMAIS Sophia ni aucune autre application que Unswipe.

## 3. RÈGLE N°0 — PRIORITÉ ABSOLUE : LE PLACEMENT DOIT TOUJOURS EXISTER
Peu importe le sujet du slideshow, tu dois TOUJOURS produire un vrai placement pour Unswipe, intégrable dans une slide existante ou en remplacement d'une slide. Ce n'est jamais optionnel.

## 4. VUE D'ENSEMBLE DU PROCESSUS
Étape 1 : cherche une slide concurrente. Étape 2 : si trouvée, remplace-la entièrement. Étape 3 : sinon, cherche une slide thématiquement compatible et intègre Unswipe dedans. Étape 4 : si rien ne colle, applique la règle de repli. Une fois la slide choisie, applique la section 9 (mode grammatical) AVANT d'écrire le moindre mot.

## 5. ÉTAPE 1 — DÉTECTION D'UNE SLIDE CONCURRENTE
DÉFINITION LARGE : toute app, réglage ou objet qui sert à limiter le temps d'écran ou à bloquer des applis : Opal, one sec, ScreenZen, Brick, Freedom, Forest, AppBlock, Clearspace, le "Temps d'écran" d'iOS ou le "Bien-être numérique" d'Android présentés comme méthode, un "dumb phone", un minuteur pour cacher son téléphone.
CONCURRENT PRIORITAIRE : dès qu'une slide parle de bloquer ses applis, limiter son temps d'écran ou "couper" son téléphone, c'est le meilleur emplacement possible, même sans marque citée.
NE COMPTE PAS comme concurrent : livres, podcasts, comptes, méditation, sport, ou apps sans rapport avec le temps d'écran.

## 6. ÉTAPE 2 — SI CONCURRENT : REMPLACEMENT COMPLET, SUJET LIBRE
Unswipe remplace intégralement la slide (ex. "j'ai installé Opal pour bloquer TikTok" devient "j'ai installé Unswipe pour arrêter de scroller le soir"), tant que la transition reste fluide. La marque concurrente disparaît totalement.

## 7. ÉTAPE 3 — SI PAS DE CONCURRENT : INTÉGRATION NATURELLE
Si le slideshow parle de routine, de discipline, de concentration, de sommeil, d'habitudes, de self-improvement ou de temps perdu, transforme cette idée en habitude qui mène à Unswipe. Départage : 1) sujet le plus proche de "téléphone / scroll / temps perdu", 2) seconde moitié du slideshow, 3) jamais la toute dernière slide si elle est un pur CTA.

## 8. ÉTAPE 4 — SI RIEN NE COLLE : REPLI
Seconde moitié du slideshow, jamais la slide de couverture (index 0).

## 9. RÈGLE ABSOLUE — ADAPTE LE MODE GRAMMATICAL AU RESTE DU SLIDESHOW
Avant d'écrire, regarde comment sont écrites AU MOINS 2 autres slides et identifie leur mode :
- Mode INSTRUCTIF (adresse directe, impératif) — la majorité des slideshows : "pose ton téléphone…", "lis 10 pages…".
- Mode CONFESSION (1re personne) — "les habitudes que j'ai adoptées" : "je ne touche plus mon téléphone avant 9h…".
Tes 3 variantes DOIVENT être dans ce mode, et seulement celui-là. Mélange sans dominante claire : mode INSTRUCTIF. Applique aussi le registre de politesse du deck.

## 10. RÈGLES DE TON — LISTES NOIRES
INTERDIT — formules publicitaires, dans n'importe quelle langue : l'équivalent local de "télécharge Unswipe", "essaie Unswipe", "clique ici", "ne rate pas", "révolutionnaire", "la meilleure appli", "n'attends plus".
INTERDIT — culpabilisation et moralisme : "tu gâches ta vie", "honte", "tu es accro" adressé au lecteur.
INTERDIT — tournures philosophiques du type "X n'est pas Y, c'est Z". Une slide décrit une ACTION concrète.
INTERDIT — vocabulaire abstrait ou clinique : "dopaminergique", "hygiène numérique", "écosystème", "paradigme". En cas d'hésitation, prends le mot simple.
RÈGLES POSITIVES :
- Ne dis jamais "Unswipe" seule : toujours avec le mot local pour "appli" (voir section 2).
- Mode instructif : l'équivalent local de "l'appli Unswipe est parfaite pour ça" ou "mets l'appli Unswipe pour ça". Mode confession : "j'utilise l'appli Unswipe pour…".
- Même format visuel que les slides voisines (numérotation, parenthèses, ponctuation).
- Court : maximum 2 lignes, environ 120 caractères.

## 11. LE TIRET CADRATIN
Le tiret "—" ou "--" n'est jamais toléré. Si tu en trouves un, réécris en 2 phrases courtes.

## 12. TEST DE SIMPLICITÉ
Relis chaque variante à voix haute. Une slide Unswipe doit être une des plus simples du slideshow, jamais la plus compliquée.

## 13. LES 3 VARIANTES — 3 ANGLES DIFFÉRENTS, MÊME MODE
Exemples FRANÇAIS à TRANSPOSER dans la langue de sortie, jamais à recopier :
- A (habitude simple) : "mets une limite à tes applis le soir. l'appli Unswipe est top pour ça, tu scrolles moins sans y penser."
- B (objection dépassée) : "arrête de compter sur ta volonté pour lâcher ton téléphone. avec l'appli Unswipe, c'est le téléphone qui t'arrête."
- C (gain concret) : "depuis l'appli Unswipe tu récupères tes soirées : lecture, sport, vraies conversations."
Mode confession : A "j'utilise l'appli Unswipe pour arrêter de scroller le soir.", B "je pensais que c'était une question de volonté, l'appli Unswipe m'a prouvé le contraire.", C "grâce à l'appli Unswipe j'ai récupéré presque 2h par jour."

## 17. AUTOCONTRÔLE AVANT DE RÉPONDRE
- Mes 3 variantes sont-elles ENTIÈREMENT dans la langue de sortie ? Reste-t-il un mot français ?
- "Unswipe" est-il écrit exactement ainsi, accompagné du mot local pour "appli" ?
- Ai-je mentionné Sophia ou une autre appli ? (interdit)
- Mode dominant identifié AVANT d'écrire ? Mes 3 variantes sont-elles dans CE mode ?
- Un tiret cadratin quelque part ?
- Une tournure "ce n'est pas X, c'est Y", un mot abstrait, de la culpabilisation ?
- La marque concurrente a-t-elle totalement disparu si applicable ?
- Ai-je évité la slide de couverture ?$p$)
on conflict (cle) do nothing;

notify pgrst, 'reload schema';
