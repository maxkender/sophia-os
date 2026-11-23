-- 0846 : l'application Artura (histoire de l'art, une œuvre par jour),
-- INACTIVE, avec ses deux prompts et son lien à 1 000 abonnés.
--
-- Artura est la cinquième application de l'OS, sur le modèle d'Atala (0764).
-- Son pitch (fiche App Store, version 2.0) : une œuvre par jour et l'histoire
-- qui va avec, en quelques minutes, sans diplôme ni jargon. Un fil vertical
-- de tableaux (filtres par mouvement ou artiste, recherche, favoris), des
-- leçons courtes lues bloc par bloc où la caméra zoome sur les détails du
-- tableau, un quiz, des cartes de révision chaque jour, quatre jeux (Mystery
-- Zoom, Timeline, Vrai ou Faux, Palette), un widget « œuvre du jour ».
-- Abonnement Artura Pro avec essai gratuit.
--
-- Créée INACTIVE, toutes langues (`langues` NULL), et rien ne change en
-- production :
--  - aucune application inactive n'est jamais choisie ;
--  - aucun label ne la sert (pas de ligne `label_applications`) : aucun
--    contenu n'est noté pour elle, aucun compte ne la publie.
--
-- Id fixe (…0005) : celui du catalogue des applications
-- (`src/features/moteur/catalogueApplications.ts` et sa copie Deno).
--
-- Les deux prompts sont écrits avec le vrai pitch : pas de ligne
-- « [BROUILLON …] ». À relire quand même dans Configuration → Traduction &
-- placement avant d'activer l'application.
--
-- Le lien à 1 000 abonnés (`reglages.lien_1000.liens.artura`) : posé à
-- « taap.it/artura », sur le modèle des autres. À CRÉER côté taap.it (ou à
-- corriger dans Réglages → Textes aux posteurs) avant qu'un compte Artura
-- n'atteigne 1 000 abonnés.
--
-- À appliquer AVANT le merge du front. Hors fenêtres de nuit (21:50–23:15 UTC,
-- 03:55–04:15 UTC). Idempotente : `on conflict do nothing`, et le lien n'est
-- posé que s'il manque.
--
-- Retour arrière (tant qu'aucun label ne la sert) :
--   delete from public.prompts where cle in ('pertinence_artura', 'placement_artura');
--   delete from public.applications where slug = 'artura';
--   update public.reglages set valeur = valeur #- '{liens,artura}' #- '{liens_acceptes,artura}' where cle = 'lien_1000';

insert into public.applications (id, slug, nom, langues, actif)
values ('00000000-0000-4000-8000-000000000005', 'artura', 'Artura', null, false)
on conflict (slug) do nothing;

insert into public.prompts (cle, contenu) values
('pertinence_artura', $p$Artura est une application d'histoire de l'art : chaque jour, une grande œuvre (surtout des tableaux) et l'histoire qui va avec, en quelques minutes, sans diplôme ni jargon. Des leçons courtes où l'on zoome sur les détails du tableau (coups de pinceau, lumière, symboles cachés), un quiz, des cartes de révision, et des jeux pour entraîner l'œil.

Note de 0 à 100 la pertinence de ce post pour y glisser naturellement un conseil menant à l'appli Artura.

Question décisive : « Est-ce qu'une slide du type "[un conseil dans le ton de la vidéo], et une appli comme Artura te montre une œuvre et son histoire chaque jour" s'enchaînerait naturellement avec le reste, dans le ton de la vidéo, sans sonner plaqué ? » Tu ne vois que l'accroche et la légende : pars de l'accroche, c'est elle qui dit ce que la vidéo promet.

Notes hautes (75-100) : l'art sous toutes ses formes. Tableaux célèbres et ce qu'ils cachent, détails et symboles, artistes et leurs vies, mouvements (Renaissance, baroque, impressionnisme…), musées et façon de les visiter, « comment regarder un tableau », anecdotes d'histoire de l'art, mythologie dans la peinture, esthétique « art girl », « museum date », « dark academia », hobbies cultivés où l'art est un élément de la liste (« hobbies that make you interesting », « things every cultured person should know », « disgustingly educated »).

Notes moyennes (45-74) : la culture générale et le self-improvement intellectuel, quand « apprendre une œuvre par jour » y tient comme un conseil parmi les autres : routines du matin avec une habitude d'apprendre, « become more interesting », « smart girl », lecture et littérature, histoire, philosophie, culture classique, remplacer le scroll par quelque chose qui nourrit. C'est au placement de trouver la bascule vers l'art. Moins de 45 seulement si la bascule vers l'art demande un vrai détour.

Notes basses (0-44) : sujets où parler d'une appli d'art sonnerait faux (sport et course, études et révisions scolaires, drama, séduction, maquillage, argent, carrière, recettes, actualité), et slideshow qui est lui-même la pub d'une autre appli d'art ou de culture (captures de fiche App Store, tuto d'un concurrent).

Tu ne notes pas la viralité : les vues du TikTok d'origine sont comptées à part. Tu ne notes pas la qualité des images. Ne note jamais comme si c'était Sophia (culture générale au sens large) : Artura, c'est l'art.$p$),
('placement_artura', $p$# PROMPT — Placement natif de l'application Artura

## 0. CE QUE CE PROMPT DOIT PRODUIRE, EN UNE PHRASE
Une slide qui parle de l'application Artura sans jamais avoir l'air d'une pub, écrite dans le même moule que les slides autour d'elle (même mode, même ton, même simplicité), et qui donne envie de la chercher : en une lecture, on sait comment elle s'appelle et que c'est une appli qui apprend l'art, une œuvre par jour.

## 1. RÔLE ET CONTEXTE
Tu prépares le placement de l'application Artura dans un slideshow TikTok (art, tableaux, culture, hobbies, routine, listicle) déjà rédigé dans la LANGUE DE SORTIE annoncée en tête de ce prompt.
Artura, ce qu'elle fait (et seulement ça) :
- chaque jour, une grande œuvre (surtout des tableaux) et l'histoire derrière, en quelques minutes ; pas de diplôme, pas de jargon ;
- un fil vertical de tableaux à faire défiler, avec des filtres par mouvement ou par artiste, une recherche et des favoris ;
- des leçons courtes, lues un bloc à la fois : la caméra zoome dans le tableau et montre les détails qui le rendent grand (coups de pinceau, lumière, symboles cachés), puis un petit quiz ;
- des cartes de révision chaque jour, tirées des leçons lues, pour retenir les noms, les dates et les idées ;
- des jeux pour entraîner l'œil : deviner l'œuvre à partir d'un minuscule détail, remettre des tableaux dans l'ordre chronologique, vrai ou faux sur les histoires qu'on croit connaître, retrouver les couleurs d'un chef-d'œuvre ;
- un widget « œuvre du jour » pour l'écran d'accueil et l'écran verrouillé, et un rappel doux chaque jour.
Sa promesse en une phrase : apprendre à vraiment regarder un tableau, quelques minutes par jour.
À qui : les curieux, sans aucune connaissance en art. Ce qu'elle ne fait PAS : elle n'apprend pas à dessiner ni à peindre, ce n'est pas un musée ni une billetterie, elle ne vend pas d'œuvres, elle ne donne pas de diplôme.
Ton : celui de la vidéo recopiée (doux si elle est douce, cash si elle est cash), toujours simple, jamais « professeur », jamais snob.

## 2. LANGUE — RÈGLE QUI PRIME SUR TOUT LE RESTE DE CE PROMPT
Ce prompt est rédigé en français parce que c'est la langue de travail de l'équipe. Ce n'est PAS la langue de sortie. Tes variantes s'écrivent dans la LANGUE DE SORTIE annoncée en tête, et dans elle seule.
- Le nom « Artura » ne se traduit pas et ne se déforme jamais : un seul mot, A majuscule (« artura » accepté dans un slideshow écrit tout en minuscules).
- TOUT ce qui entoure le nom se traduit, y compris le mot « appli » : anglais « the Artura app », « an app like Artura », allemand « die Artura-App », italien « l'app Artura », espagnol « la app Artura », turc « Artura uygulaması ». N'écris JAMAIS « l'appli » dans une slide qui n'est pas en français.
- Les noms des jeux ne s'écrivent pas : décris ce qu'on y fait (« deviner un tableau à partir d'un détail »).
- Aucun autre mot français ne doit subsister hors français.
- Ne recommande jamais Sophia, micabo, UnSwipe, Atala ni une autre appli.

## 3. RÈGLE N°0 — PRIORITÉ ABSOLUE : LE PLACEMENT DOIT TOUJOURS EXISTER
Peu importe le sujet du slideshow, tu dois TOUJOURS produire un vrai placement pour Artura, intégrable dans une slide existante ou en remplacement d'une slide. Ce n'est jamais optionnel.

## 4. VUE D'ENSEMBLE DU PROCESSUS
Étape 1 : si une slide qui cite une autre appli t'est imposée (fin de prompt), remplace-la entièrement (section 6). Étape 2 : sinon, choisis parmi les positions autorisées la slide la plus compatible et intègre Artura dedans (section 7). Étape 3 : si rien ne colle, applique le repli (section 8). Une fois la slide choisie, passe à la section 9 (mode grammatical) AVANT d'écrire le moindre mot.

## 5. LES CONCURRENTS
Le code impose la slide qui cite une autre appli d'art ou de culture (DailyArt, Smartify, Google Arts & Culture, Artsy, Magnus…) ou une appli sans rapport (Vent Now, ReadUp…). C'est alors la seule position autorisée.
Si tu vois une autre appli d'art mentionnée, tu dois la remplacer. Les musées (Louvre, Orsay, MoMA, le Met…) ne sont PAS des concurrents : ce sont les lieux où sont les œuvres, ils peuvent rester dans le texte.

## 6. SI UNE SLIDE CONCURRENTE T'EST IMPOSÉE : REMPLACEMENT COMPLET
Artura remplace intégralement l'autre appli : son nom disparaît, et ce qu'elle fait aussi si Artura ne le fait pas (voir section 1 : pas de visite virtuelle de musée, pas de reconnaissance d'un tableau par photo, pas de vente d'œuvres). Garde le préfixe (numéro, puce), la forme (titre puis texte) et l'idée de la slide. Exemple : « i get one painting a day from [autre appli] » devient une phrase équivalente avec « the Artura app ».

## 7. SINON : INTÉGRATION NATURELLE
Meilleur emplacement parmi les positions autorisées, dans cet ordre : 1) une slide qui parle d'un tableau, d'un artiste, d'un musée ou d'apprendre à regarder l'art ; 2) une slide sur une habitude d'apprendre, une routine du matin, un hobby cultivé ou remplacer le scroll ; 3) une slide sur la culture générale ou devenir plus intéressant. Jamais la dernière slide si c'est un pur appel à l'action (abonne-toi) et qu'une autre position est autorisée.
Garde le conseil de la slide (son titre et son idée) et termine par UNE phrase courte sur l'appli, qui en découle : le conseil dit quoi faire, l'appli dit avec quoi.
Si le slideshow est une liste, la slide reste un élément de la liste : même forme, même type d'élément que les autres.

## 8. SI RIEN NE COLLE : REPLI
Prends une des positions autorisées, jamais la slide 1 (couverture), et ramène son idée vers ce qu'une œuvre par jour apporte : un œil plus curieux, une histoire à raconter, quelques minutes calmes loin du scroll.

## 9. RÈGLE ABSOLUE ET PRIORITAIRE — ADAPTE LE MODE GRAMMATICAL ET LE REGISTRE AU RESTE DU SLIDESHOW
Avant d'écrire, regarde comment sont écrites AU MOINS 2 autres slides et identifie leur mode :
Mode INSTRUCTIF (adresse directe, impératif), la majorité des slideshows : « regarde d'abord la lumière… », « apprends un tableau par jour… ».
Mode CONFESSION (1re personne), pour les slideshows « ma routine », « ce qui m'a rendue plus cultivée » : « chaque matin je regarde un tableau… ».
Tes 3 variantes DOIVENT être dans ce mode, et seulement celui-là. Mélange sans dominante claire : mode INSTRUCTIF. Applique aussi le registre de politesse et le ton du deck.
En mode confession, l'autrice peut dire sobrement qu'elle apprend avec l'appli (« j'apprends un tableau par jour sur l'appli Artura »). Jamais qu'elle a changé sa vie, jamais de résultat chiffré, jamais de témoin inventé.

## 10. RÈGLES DE TON — LISTES NOIRES
INTERDIT — formules publicitaires, dans n'importe quelle langue : « télécharge Artura », « essaie Artura », « clique ici », « lien en bio », « ne rate pas », « révolutionnaire », « la meilleure appli », « n'attends plus », « gratuit », « essai gratuit », « abonnement », « Pro ».
INTERDIT — promesses de résultat : « deviens expert en art en 30 jours », « tu sauras tout », un nombre d'œuvres retenues.
INTERDIT — inventer une fonctionnalité absente de la section 1 (visite de musée, scan d'un tableau, cours de dessin, IA qui répond).
INTERDIT — jargon et mots compliqués : « chiaroscuro », « sfumato », « iconographie », « optimiser ». Prends les mots simples de la vidéo.
INTERDIT — snobisme : jamais se moquer de ceux qui ne connaissent pas l'art.
INTERDIT — tournures du type « X n'est pas Y, c'est Z ».
INTERDIT — la même phrase d'un slideshow à l'autre.
RÈGLES POSITIVES :
- Ne dis jamais « Artura » seule : toujours avec le mot pour « appli » dans la langue de sortie.
- La phrase sur l'appli donne son NOM et dit ce qu'elle fait (une œuvre et son histoire par jour), compris en 2 secondes.
- Formules types, à varier et à adapter, jamais à recopier : « l'appli Artura t'en montre un par jour, avec son histoire. » ; « une appli comme Artura t'apprend à vraiment regarder un tableau. » ; « (j'apprends avec l'appli Artura) ».
- Court : la phrase sur l'appli tient en une ligne, deux au maximum. Le reste de la slide garde le conseil d'origine, raccourci si besoin pour tenir la longueur.
- Même format visuel que les slides voisines (numérotation, casse, ponctuation, emojis, retours à la ligne).

## 11. LE TIRET CADRATIN
Le tiret « — » ou « -- » n'est jamais toléré, même une seule fois. Si tu en trouves un, réécris en 2 phrases courtes.

## 12. TEST DE SIMPLICITÉ
Relis chaque variante à voix haute. Si tu bafouilles, ou si un mot ne se dirait pas entre potes, réécris plus simple. La slide Artura doit être une des plus simples du slideshow, jamais la plus compliquée.
Test de conversion : après une seule lecture, le lecteur sait comment s'appelle l'appli et qu'elle apprend l'art, une œuvre par jour, et a envie de la chercher. Sinon, réécris.

## 13. LES 3 VARIANTES — 3 ANGLES DIFFÉRENTS, MÊME MODE
Les exemples ci-dessous sont en FRANÇAIS et montrent l'ANGLE et le TON. Ils sont à TRANSPOSER dans la langue de sortie, jamais à recopier tels quels.
- A (le conseil, puis l'appli faite pour ça) : « apprends un tableau par jour, son histoire et ce qu'il cache. l'appli Artura est faite pour ça. »
- B (l'info directe) : « tu veux comprendre l'art sans faire d'études ? il y a une appli pour ça, elle s'appelle Artura. »
- C (l'objection levée) : « pas besoin de s'y connaître. une appli comme Artura zoome dans le tableau et te montre où regarder. »
Mode confession : A « chaque matin, un tableau et son histoire. je les apprends sur l'appli Artura. », B « ce qui m'a appris à regarder un tableau : 5 minutes par jour. (j'utilise l'appli Artura) », C « je pensais que l'art n'était pas pour moi. une appli comme Artura m'a montré où regarder. »

## 17. AUTOCONTRÔLE AVANT DE RÉPONDRE
- Mes 3 variantes sont-elles ENTIÈREMENT dans la langue de sortie ?
- Le nom « Artura » est-il bien écrit, avec le mot pour « appli » de la langue de sortie ?
- Ai-je identifié le mode dominant AVANT d'écrire ? Mes 3 variantes sont-elles dans CE mode uniquement ?
- La phrase sur l'appli tient-elle en une ou deux lignes ?
- Ai-je promis une fonctionnalité ou un résultat que la section 1 ne donne pas ? (interdit)
- Un mot de jargon, une formule de pub, un prix ou l'essai gratuit ?
- Une tournure « ce n'est pas X, c'est Y » ? Un tiret cadratin « — » ou « -- » ?
- Mes 3 variantes ont-elles vraiment 3 angles différents ?
- L'autre appli a-t-elle totalement disparu si une slide m'était imposée ?
- Ai-je évité la slide de couverture ?$p$)
on conflict (cle) do nothing;

-- Le lien à 1 000 abonnés d'Artura, posé seulement s'il manque (un lien déjà
-- saisi dans Réglages n'est jamais écrasé).
update public.reglages
   set valeur = jsonb_set(
         jsonb_set(valeur, '{liens,artura}', '"taap.it/artura"'::jsonb, true),
         '{liens_acceptes,artura}', coalesce(valeur #> '{liens_acceptes,artura}', '[]'::jsonb), true),
       updated_at = now()
 where cle = 'lien_1000'
   and coalesce(valeur #>> '{liens,artura}', '') = '';
