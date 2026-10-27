-- 0379 : Relecture native · les fiches des trois applis (27/10).
--
-- Première version des fiches de Sophia, micabo et UnSwipe, écrite à partir
-- des documents existants : prompts de placement et de pertinence de chaque
-- appli (table `prompts`), consigne UnSwipe du pod page blanche
-- (pods/page-blanche/posts/UNSWIPE.md), analyse du pod clean_study, page
-- Notion « Réponse Stat F » (présentation des trois applis), concurrents
-- détectés par l'OS (supabase/functions/_shared/concurrents.ts) et captures
-- validées (table `captures_app`).
--  - `contenu` : la fiche complète, en français, sur le modèle de l'OS. Lue
--    par les agents de langue.
--  - `presentation_relecteur` : le texte court, en anglais, montré au
--    relecteur dans « What is … ? » (ce que fait l'appli, comment la nommer,
--    ce qu'on ne promet jamais).
-- Créées seulement si la fiche n'existe pas : une fiche déjà écrite dans
-- l'OS n'est jamais écrasée. Chaque création garde sa version (0376).
--
-- Trois consignes du kit (posts 4, 5 et 8) sont alignées sur ces fiches,
-- seulement si elles n'ont pas été modifiées depuis 0377.
-- Retour arrière : delete from public.fiches_appli where updated_by is null;

insert into public.fiches_appli (application_id, contenu, presentation_relecteur)
select a.id, f.contenu, f.presentation
from (values
  ('sophia', $fiche$# Sophia

## Ce que fait l'appli
Sophia est une appli de culture générale. On y suit des cours courts de culture générale (histoire, art, sciences, philosophie…), écrits par des profs d'université, rangés en un parcours qu'on avance comme un jeu. L'appli peut aussi bloquer TikTok, Instagram… tant qu'on n'a pas lu un cours.
Disponible en 26 langues, sur iPhone (Android prévu).

## À qui elle s'adresse
- Des élèves, des étudiants et des jeunes actifs, surtout hors des pays anglophones.
- Ceux qui veulent avoir des choses à raconter, comprendre les références, être pris au sérieux, combler ce que l'école n'a pas appris.

## Ce qu'on a le droit d'affirmer
Seulement ces faits, dits simplement :
- APP BLOCKER : elle bloque TikTok, Instagram… tant qu'on n'a pas lu un cours de culture générale.
- PROFS : des cours écrits par des profs d'université.
- PARCOURS : un parcours de culture générale, comme un jeu.
- COURS COURTS : des cours courts.
- 250 COURS : les 250 cours de culture générale les plus importants.
Ce qu'elle apporte (l'idée de la slide, pas une fonctionnalité) : avoir toujours une anecdote à sortir, comprendre les références d'un film, d'un musée, d'un livre, suivre une conversation sur l'actu ou l'histoire, être pris·e au sérieux en entretien ou en cours, combler ce que l'école n'a jamais appris, savoir de quoi on parle en voyage, avoir des arguments dans un débat.

## Ce qu'on ne dit jamais
- Rien d'inventé : aucune durée (« 5 minutes par jour »), aucun quiz, streak, flashcard, audio, notification, prix, nombre d'utilisateurs.
- Pas de « micro-learning », « micro-leçon », « apprendre un truc par jour ».
- Le téléphone, les réseaux, le scroll, bloquer : seulement si la slide en parle déjà.
- Aucune formule de pub : télécharge, essaie, lien en bio, la meilleure appli, ne rate pas…
- Jamais de fiche produit (« available on… », « helps you… », deux fonctionnalités dans une phrase).
- Jamais une autre de nos applis (micabo, UnSwipe) dans la même slide.

## Les fonctionnalités qu'on peut citer
Seulement si le conseil de la slide l'appelle clairement :
- PROFS : études, carrière, sérieux.
- PARCOURS : « par où commencer ».
- COURS COURTS : manque de temps.
- 250 COURS : « ce que tout le monde devrait savoir ».
- APP BLOCKER : seulement si la slide parle du téléphone ou des réseaux.
La plupart du temps : aucune fonctionnalité, juste l'appli et l'idée de la slide.

## Comment la nommer
- Toujours avec « comme », jamais comme une marque. Forme principale : « une appli de culture générale comme Sophia » ; aussi « une appli comme Sophia », « des applis comme Sophia » (« culture générale » apparaît alors ailleurs dans la phrase).
- Par langue : en « a general knowledge app like Sophia », « an app like Sophia » ; de « eine Allgemeinbildungs-App wie Sophia », « Apps wie Sophia » ; es « una app de cultura general como Sophia » ; it « un'app di cultura generale come Sophia » ; pt « uma app de cultura geral como a Sophia » ; tr « Sophia gibi bir genel kültür uygulaması » ; pl « aplikacja do wiedzy ogólnej, taka jak Sophia » ; nl « een algemene-kennisapp zoals Sophia » ; ro « o aplicație de cultură generală precum Sophia » ; hu « egy olyan általános műveltségi app, mint a Sophia » ; cs « aplikace na všeobecný přehled jako Sophia » ; el « μια εφαρμογή γενικών γνώσεων όπως η Sophia » ; sv « en allmänbildningsapp som Sophia ».
- Jamais : « the Sophia app », « l'appli Sophia », « die Sophia-App », « an app called Sophia », un impératif (« use Sophia », « try Sophia »).
- « Sophia » ne se traduit pas ; une seule mention par slide ; « culture générale » une seule fois, jamais dans le titre de la slide.

## Les captures disponibles
- Aucune capture validée dans l'OS (table des captures) pour l'instant.
- Le pod 11 (remakes @fathom0g) utilise une carte d'appli Sophia.

## Ses concurrents
Détectés et retirés par l'OS (la slide qui les cite devient la slide Sophia) : Vent Now, ReadUp, Unscroll, Elqo, Noctua, Kodi AI, Actualize, Bycat, Turbo Resume. Aussi : Fathomly (pod 11), et en général Duolingo, Blinkist et les applis de micro-learning. Jamais cités dans un post.

## À trancher
- La durée : le placement automatique interdit toute durée, mais nos originaux de pods écrivent « 5 minutes a day of history, art or science ». À fixer pour les relecteurs.

## Sources
Prompts `placement_sophia`, `pertinence` et `cta_sophia` (table prompts) ; concurrents.ts ; page Notion « Réponse Stat F ».
$fiche$,
   $pres$Sophia is a general knowledge app: short courses (history, art, science, philosophy…) written by university professors, organised as a path you move through like a game. It can also block apps like TikTok or Instagram until you've read a course.

How to name it, in your language: always "a general knowledge app like Sophia" or "an app like Sophia". Never "the Sophia app", never "an app called Sophia", never "download / try / use Sophia".

Never claim: a duration ("5 minutes a day"), quizzes, streaks, flashcards, audio, prices or numbers of users. Only mention the phone or social media if the slide already talks about them. One mention of Sophia per post.$pres$),

  ('micabo', $fiche$# micabo

## Ce que fait l'appli
micabo est une appli de révision avec une IA, pour les élèves et les étudiants :
- l'élève lui donne tous ses cours (notes, photos, PDF), même des montagnes ;
- l'IA en fait des supports interactifs : des leçons simples, des flashcards et des quiz faits à partir de SES cours ;
- il donne la date de son examen et la note qu'il vise : micabo lui fait un plan jusqu'au jour J, il sait quoi réviser chaque jour ;
- il révise environ 10 minutes par jour, et l'appli lui redemande ce qu'il a raté.
Disponible en 14 langues, sur iPhone. Lancée en septembre 2026.

## À qui elle s'adresse
Des élèves et des étudiants qui ont des cours à retenir et des examens à passer : lycée, prépa, fac, médecine, droit, langues…

## Ce qu'on a le droit d'affirmer
- L'IA transforme tes cours en leçons, flashcards et quiz interactifs (la promesse la plus forte).
- Tu lui donnes toutes tes montagnes de cours d'un coup.
- Le plan jusqu'à l'exam : tu sais chaque jour quoi réviser.
- 10 minutes par jour, et l'appli te redemande ce que tu as raté.
- Tu te testes sur ton propre cours au lieu de relire.
- Tu arrives à l'exam prêt, sans tout réviser la veille.
Un ou deux arguments par slide, jamais la liste complète, avec des mots d'élève.

## Ce qu'on ne dit jamais
- Aucun chiffre inventé (« 20x plus vite », « +3 points »), aucune statistique, aucun témoin inventé (prof, parent, ami).
- Pas d'audio (lecture à voix haute, podcast). Elle ne fait pas les devoirs à la place de l'élève.
- Ce n'est pas une appli de culture générale.
- Pas de « site », de « plateforme » ni de nom de domaine.
- Pas de hype IA (magique, révolutionnaire, le futur) ni de jargon (répétition espacée, active recall, courbe de l'oubli, algorithme). « IA » une fois au plus, jamais si le post est contre l'IA.
- Aucune formule de pub : télécharge, essaie, lien en bio, gratuit, la meilleure appli…
- Jamais Sophia ni UnSwipe dans la même slide.
- Le contexte scolaire du pays du compte seulement (barème, examens, niveaux) : jamais celui d'un autre pays.

## Les fonctionnalités qu'on peut citer
Import des cours (notes, photos, PDF) ; leçons, flashcards et quiz faits à partir de ses cours ; plan jusqu'à la date de l'examen ; 10 minutes par jour ; l'appli redemande ce qu'on a raté.

## Comment la nommer
- Toujours en minuscules, même en début de phrase, avec le mot pour « appli » : fr « l'appli micabo » ; en « the micabo app » ; es « la app micabo » ; it « l'app micabo » ; de « die micabo-App » (le nom d'abord) ; tr « micabo uygulaması » (le suffixe va sur uygulaması : micabo uygulamasını, uygulamasında…).
- Une seule mention par slide.

## Les captures disponibles
Écran « parcours » sur iPhone, validé en de, en, es, fr, it, pt et tr ; une version ordinateur en fr (table des captures). Le pod 10 (remakes @yasminespixels) utilise les vraies captures de micabo.

## Ses concurrents
Détectés et remplacés par l'OS : Wilgo, Quizlet, Anki, Knowunity, StudySmarter, Studocu, Brainly, Gauth, Photomath, Turbo AI, StudyFetch, Revisely, Mindgrasp, Flashka, ElibroAI, Aistote, Nerdmask, Astra AI, PeECH, et ceux de Sophia (Vent Now, ReadUp, Bycat…). Une slide qui recommande une appli de révision sans la nommer compte aussi. Jamais cités dans un post.

## Sources
Prompts `placement_micabo` et `pertinence_micabo` (table prompts) ; pods/clean-study (AGENT.md, ANALYSE.md) ; concurrents.ts ; table captures_app ; page Notion « Réponse Stat F ».
$fiche$,
   $pres$micabo is an AI revision app for students. You give it all your courses (notes, photos, PDFs) and its AI turns them into simple lessons, flashcards and quizzes made from YOUR courses. You enter your exam date and the grade you aim for: micabo plans what to revise each day until the exam, about 10 minutes a day, and asks you again what you got wrong.

How to name it, in your language: always lowercase, with your word for "app": "the micabo app" (die micabo-App, la app micabo, l'app micabo, micabo uygulaması…).

Never claim: numbers or stats ("20x faster"), audio or podcasts, doing homework for you. It is not a general knowledge app. Use your country's grades and exams, never American ones.$pres$),

  ('unswipe', $fiche$# UnSwipe

## Ce que fait l'appli
UnSwipe enlève les formats courts de tes applis : Instagram sans les Reels (tu gardes les messages, les stories et les posts de tes amis), tes autres applis sans les vidéos courtes ni le scroll infini, et tu peux bloquer complètement une appli comme TikTok.
Positionnement : « tes réseaux, sans les Reels ». Promesse : « pas besoin de tout supprimer pour arrêter de scroller ».
Lancée le 7 octobre 2026, sur iPhone ; le traitement reste sur le téléphone. V2 (plus de feeds bloqués) et Android prévus.

## À qui elle s'adresse
Ceux pour qui ce que promet le post (aimer sa vie, un cerveau qui remarche, mieux se concentrer, de meilleures notes, mieux dormir, devenir une meilleure version de soi) se gagne en scrollant moins.

## Ce qu'on a le droit d'affirmer
- Instagram sans les Reels : on garde les messages, les stories et les posts des amis.
- Les autres applis sans les vidéos courtes ni le scroll infini.
- On peut bloquer complètement une appli comme TikTok.
- Pas besoin de supprimer ses réseaux pour arrêter de scroller.
La phrase sur l'appli donne son nom et UN bénéfice concret, compris en 2 secondes.

## Ce qu'on ne dit jamais
- Rien qu'elle ne fait pas : pas de statistiques ni de limite de temps d'écran, pas de minuteur, pas de notifications coupées, pas de téléphone bloqué en entier, aucun chiffre (« 2 h de gagnées »).
- Pas d'ordre de suppression (« supprime les formats courts », « vire les Reels »).
- Pas de métaphores ni de mots compliqués (batterie mentale, hygiène numérique, minimalisme numérique, écosystème).
- Aucune formule de pub : télécharge, essaie, lien en bio, gratuit, la meilleure appli…
- Jamais Sophia ni micabo dans la même slide.
- UnSwipe n'est jamais le sujet n°1 de la slide : d'abord l'habitude (scroller moins), l'appli en dernier, comme le moyen.

## Les fonctionnalités qu'on peut citer
Instagram sans les Reels ; les applis sans vidéos courtes ni scroll infini ; TikTok (ou une autre appli) bloqué complètement.

## Comment la nommer
- « UnSwipe » : un seul mot, S majuscule (« unswipe » toléré dans un post tout en minuscules). Ne se traduit pas.
- Jamais seul : toujours avec le mot pour « appli » : fr « l'appli UnSwipe » ; en « the UnSwipe app », « an app like UnSwipe » ; de « die UnSwipe-App » ; es « la app UnSwipe » ; it « l'app UnSwipe » ; tr « UnSwipe uygulaması ».
- « Reels » ne se traduit pas ; « formats courts » se traduit (en « short videos », de « Kurzvideos », es « vídeos cortos », it « video brevi », tr « kısa videolar »).
- Instagram, TikTok et les Reels peuvent être nommés : ce sont les applis dont on parle.

## Les captures disponibles
Aucune capture validée dans l'OS (table des captures) pour l'instant. Le pod 6 (remakes @mentalapp) utilise l'icône UnSwipe et la légende « delete short-videos (UnSwipe app) ».

## Ses concurrents
Détectés et remplacés par l'OS : Opal, one sec, ScreenZen, AppBlock, Clearspace, Brick, Freedom, Forest, Unscroll, ReadUp, et ceux de Sophia (Vent Now…). Aussi @mentalapp (pod 6). Jamais cités dans un post.

## À trancher
- La 1re personne : le placement automatique ne fait jamais dire à l'auteur qu'il utilise UnSwipe ni qu'elle a changé sa vie (l'appli arrive comme une info). Le kit garde cette règle ; c'est une hypothèse à tester un jour.
- Le nom dans l'OS est « Unswipe », la marque « UnSwipe ».

## Sources
Prompts `placement_unswipe` et `pertinence_unswipe` (table prompts) ; pods/page-blanche/posts/UNSWIPE.md ; pods/clean-study/ANALYSE.md ; concurrents.ts ; page Notion « Réponse Stat F ».
$fiche$,
   $pres$UnSwipe removes short videos from your apps: Instagram without Reels (you keep your messages, stories and your friends' posts), your other apps without short videos or endless scrolling, and you can block an app like TikTok completely. The idea: no need to delete everything to stop scrolling.

How to name it, in your language: always with your word for "app": "the UnSwipe app", "an app like UnSwipe". Never "UnSwipe" alone. "Reels" is never translated.

Never claim: screen-time stats or limits, timers, muted notifications, a fully blocked phone, or numbers ("2 hours saved"). The habit comes first (scrolling less), the app last, as the way to do it. Never say it changed your life.$pres$)
) as f (slug, contenu, presentation)
join public.applications a on a.slug = f.slug
on conflict (application_id) do nothing;

-- Le kit, aligné sur les fiches (seulement les consignes encore d'origine).
update public.kit_natif
   set consigne_cta = 'Slide 4 credits another app ("vent now") inside a personal story about cleaning up the social media feed. Keep the story and its place, but the UnSwipe app arrives as a tip for the reader: never say it changed your life.'
 where rang = 4
   and consigne_cta = 'Slide 4 credits another app ("vent now") for a tip about cleaning up the social media feed. Keep that personal story on slide 4, with UnSwipe instead.';

update public.kit_natif
   set consigne_cta = 'Before / after, in the first person: "before, I … ; now I …", and a general knowledge app like Sophia is how. On slide 7, the last tip before the sources. No duration.'
 where rang = 5
   and consigne_cta = 'Before / after, in the first person: "before, I … ; now I open Sophia every morning and …". On slide 7, the last tip before the sources.';

update public.kit_natif
   set consigne_cta = 'A form that already worked for UnSwipe: "I''ll never delete my social media, but the UnSwipe app removes the Reels and keeps my messages". Put it on slide 8, the one about screen time.'
 where rang = 8
   and consigne_cta = 'A form that already worked for UnSwipe: "I''ll never delete my social media, but UnSwipe removes the Reels and keeps my messages". Put it on slide 8, the one about screen time.';
