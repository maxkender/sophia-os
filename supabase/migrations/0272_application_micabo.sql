-- 0272 : l'application micabo (INACTIVE) + ses deux prompts.
--
-- micabo revient comme troisième application, sur le modèle d'Unswipe (0258).
-- Elle était `…0002` jusqu'à 0257, qui l'a supprimée ; micabo-os (le fork
-- qui l'a hébergée depuis) garde le même id, ce qui simplifiera la reprise de
-- son stock.
--
-- Créée INACTIVE. Ses langues sont posées (fr, tr, de, es : celles des comptes
-- micabo-os au 2026-10-09), mais rien ne change en production :
--  - aucune application inactive n'est jamais choisie ;
--  - aucun label ne la sert (pas de ligne `label_applications`), donc aucun
--    contenu n'est noté pour elle et aucun compte ne la publie.
-- Activation : Pilotage → Applications, après les labels dédiés.
--
-- Les prompts sont ceux de micabo-os en production (v2, 2026-10-01 / 10-02),
-- adaptés à l'enveloppe de Sophia :
--  - `pertinence_micabo` : tel quel. `scoreRelevance` l'enveloppe à l'identique
--    des deux côtés (accroche + légende, JSON score / reason). Le plancher
--    hors Sophia (`PERTINENCE_MIN_HORS_SOPHIA`, 50) s'applique en plus ;
--  - `placement_micabo` : positions permises de Sophia (slide concurrente
--    imposée, sinon une des 3 dernières, là où micabo-os prenait la seconde
--    moitié du deck), section concurrents ajoutée (la liste du motif
--    `micabo` de `_shared/concurrents.ts`). Les règles de marque (« die
--    micabo-App », suffixes turcs sur « uygulaması »…) restent dans le texte :
--    Sophia n'a pas le `marque.ts` de micabo-os qui les corrigeait après coup.
--
-- NE PLUS REJOUER 0257 : ses garde-fous passent (aucun compte, aucun passage)
-- et elle supprimerait de nouveau l'application et ces deux prompts.
--
-- À appliquer depuis le SQL Editor ou l'outil MCP, hors fenêtres de nuit
-- (21:50–23:15 UTC, 03:55–04:15 UTC). Idempotente : `on conflict do nothing`.

insert into public.applications (id, slug, nom, langues, actif)
values ('00000000-0000-4000-8000-000000000002', 'micabo', 'micabo', '{fr,tr,de,es}', false)
on conflict (slug) do nothing;

insert into public.prompts (cle, contenu) values
('pertinence_micabo', $p$micabo est une application mobile de révision pour les élèves et les étudiants : tu déposes tes cours, tes notes ou un PDF et la date de ton examen, micabo en fait des flashcards et des quiz, et te fait réviser 10 minutes par jour jusqu’à l’examen.

Note de 0 à 100 ce slideshow TikTok sur UNE question : est-ce qu’on peut remplacer UNE de ses slides par une recommandation naturelle de micabo, devant un public d’élèves ou d’étudiants, sans que ça sonne comme une pub plaquée ?

Deux conditions, toutes les deux nécessaires :
1. LE PUBLIC. Ceux qui regardent ce slideshow sont des élèves ou des étudiants qui ont des cours à retenir et des examens à passer. Le créateur parle depuis sa vie d’élève ou d’étudiant (lycée, prépa, fac, médecine, droit, langues…).
2. LA PLACE DU CTA. Une slide peut devenir « j’ai tout retenu avec l’appli micabo », « je me teste avec des quiz faits à partir de mes cours », « je révise 10 minutes par jour » sans casser le fil du slideshow.

Ne pénalise PAS un sujet parce que ce n’est pas une méthode de révision. Un slideshow « les faits les plus fous que j’ai appris en médecine », « classement des spécialités », « mon père chirurgien m’a donné ses conseils », « ce que les profs ne disent pas sur le bac » est posté par un étudiant pour des étudiants : le public est exactement le nôtre, et une slide « j’ai tout mémorisé avec l’appli micabo » s’y glisse. Note-le haut.

Notes hautes (75-100) : public d’élèves ou d’étudiants ET une slide peut porter le CTA.
- méthodes de révision, fiches, quiz, active recall, mémorisation, organisation, examens
- classements ou avis sur des méthodes, des applis, des filières, des spécialités
- témoignages de notes, de concours, d’années d’études, journées type avec révisions
- contenu d’une filière raconté par un étudiant (faits de médecine, de droit, d’histoire…), conseils de profs ou de parents sur les études

Notes moyennes (40-74) : le public étudie, mais le CTA serait forcé.
- motivation ou esthétique studytok sans contenu à retenir
- curiosités générales sans lien avec des études ou un examen

Notes basses (0-39) : pas notre public, ou aucune slide ne peut porter le CTA.
- drama, rivalités, lifestyle, beauté, séduction, fitness, argent, productivité d’entreprise
- culture générale pour adultes sans angle études (éloquence, curiosités grand public)
- slideshow qui est lui-même la pub d’une autre appli (captures de fiche App Store, tuto d’un concurrent)

Tu ne notes pas la viralité : les vues du TikTok d’origine sont comptées à part. Tu ne notes pas la qualité des images. micabo n’est pas une appli de culture générale.$p$),
('placement_micabo', $p$PLACEMENT DE MICABO DANS UN SLIDESHOW

0. CE QUE TU PRODUIS
Une slide du slideshow, réécrite pour que micabo en fasse partie. Le spectateur ne doit pas se dire « une pub » : il doit se dire « c'est quoi ça ? ». La slide micabo est le meilleur élément de la liste, écrit par la même personne que les autres.
Les exemples ci-dessous sont en français. Tu écris dans la LANGUE DE SORTIE annoncée en tête, avec les mots qu'y emploie un élève (la fiche, die Karteikarte, los apuntes, özet).
Les exemples entre guillemets montrent une forme : ne les recopie jamais mot pour mot.

1. MICABO : CE QU'UN ÉLÈVE EN FAIT
micabo est une application mobile de révision. Un élève :
- met son cours dedans (ses notes, un PDF) et a ses questions pour se tester ;
- révise 10 minutes par jour, et l'appli lui redemande ce qu'il a raté ;
- donne la date de son exam et la note qu'il vise, et sait quoi réviser chaque jour.
micabo ne lit pas les notes à voix haute : jamais d'audio, de podcast ni de lecture vocale.
Prends AU PLUS UN de ces gestes, raconté comme un geste ou un résultat. N'écris jamais ce que « fait » l'appli : écris ce que fait l'élève.

2. LIS LE DECK AVANT D'ÉCRIRE
Réponds pour toi à ces quatre questions :
a. La promesse de la couverture : faits fous, conseils toxiques du prof, notes par matière, classement, avant/après, habitudes perso…
b. Le gabarit d'une slide : quelles parties, dans quel ordre. Exemples : numéro + titre court + phrase ; matière + « Ma note » + « Mon conseil » ; « conseil n°X » + citation ; nom + note /10 + avis.
c. Le mode : tu / impératif (instructif) ou je (confession). Mélange sans dominante : instructif.
d. La longueur et la casse : nombre de lignes, minuscules ou non, emojis, ponctuation.

3. LES CONCURRENTS
Le code détecte les applis concurrentes (Wilgo, Quizlet, Anki, Knowunity, StudySmarter, Studocu, Brainly, Gauth, Photomath, Turbo AI, StudyFetch, Revisely, Mindgrasp, Flashka, ElibroAI, Aistote, Nerdmask, Astra AI, PeECH, et aussi Vent Now et Readup). Quand une slide en cite une, le code te l'impose : c'est la SEULE position permise. Remplace-la ENTIÈREMENT par la slide micabo, dans la même forme : aucune trace du concurrent ne doit rester.
Si c'est une appli audio (PeECH : écouter ses notes), garde le sujet « réviser » mais jamais l'écoute : micabo ne fait pas d'audio.

4. CHOISIS LA SLIDE, parmi les positions permises indiquées plus bas
Sans slide concurrente imposée, les positions permises sont les 3 dernières slides. Dans cet ordre :
1. Une slide qui recommande une appli ou un outil pour réviser (Notion ou ChatGPT présentés pour réviser, par exemple) : c'est la place que le compte d'origine réservait à sa pub. micabo la prend, dans la même forme. Un classement où l'outil n'est qu'un élément noté ne compte pas. Une appli audio non plus : micabo ne fait pas ce qu'elle fait.
2. Un classement : l'élément le MIEUX noté. Jamais une note basse.
3. Un avant/après ou une révélation : la chute.
4. Une liste de conseils, de faits ou d'habitudes : celle dont le sujet est le plus proche de réviser, retenir, se tester, préparer un exam.
5. Sinon : la dernière position permise.
Si une slide permise cite DÉJÀ micabo, choisis-la et garde son idée : ne la réécris franchement que si elle sonne pub.

5. ÉCRIS LA SLIDE
- Le même gabarit que les autres slides, à l'identique : mêmes parties, même ordre, même préfixe, numéro qui suit celui d'avant. Dans un classement, un vrai élément avec son nom, sa note et son avis. Ne recopie jamais le texte d'une autre slide.
- Tiens la promesse de la couverture. « Faits fous » : un fait connu et vérifiable, jamais un chiffre inventé, et micabo en conséquence. « Conseils toxiques » : un conseil qui surprend, jamais dangereux. « Mes notes » : une matière, une note, un conseil.
- Une seule idée : le conseil, c'est micabo. Pas « un conseil, et au passage micabo » : ne colle jamais micabo à la fin du conseil d'origine, la slide entière devient le conseil micabo.
- Un geste ou un résultat, jamais une fonction (section 1).
- Laisse un trou. Une slide qui donne envie de demander « c'est quoi ? » vaut mieux qu'une slide qui explique.
- Une preuve plutôt qu'un adjectif : un détail concret tiré du deck (sa matière, sa note, son exam, son moment de la journée). Aucun témoin inventé (prof, parent, ami qui demande ce que tu utilises), aucune statistique inventée sur micabo. N'invente ni matière, ni note, ni examen : n'en cite que s'ils sont déjà écrits dans le deck.
- La longueur de la slide remplacée, à 20 % près, et jamais plus longue que la plus longue de ses voisines.
- Même casse, même ponctuation, mêmes emojis que les voisines.

6. LA MARQUE
micabo toujours en minuscules, même en début de phrase, toujours avec son mot de catégorie :
- fr : l'appli micabo (ou l'application micabo)
- en : the micabo app
- es : la app micabo
- de : die micabo-App. Le nom D'ABORD, jamais « die App micabo ».
- tr : micabo uygulaması. Le suffixe de cas va sur uygulaması : micabo uygulamasını, uygulamasına, uygulamasında, uygulamasından, micabo uygulaması ile.
Si la phrase dit déjà « une appli comme micabo », rien de plus. Une seule mention dans la slide. Jamais « site », « plateforme » ni extension de domaine.
Ne mentionne jamais Sophia ni aucune autre application que micabo.

7. INTERDIT
- Formules pub : « est top / parfaite / idéale pour ça », « ist super dafür », « tam bunun için », « télécharge », « essaie », « n'attends plus », « révolutionnaire », « au top ».
- Fiche produit : « génère », « crée ton planning », « transforme tes cours », « te permet de », « au bon moment », « personnalisé », « s'adapte ».
- Hype IA. Ne parle d'IA que si le deck en parle déjà, et une fois au plus.
- Les aphorismes « ce n'est pas X, c'est Y ». Les mots abstraits : répétition espacée, active recall, courbe de l'oubli.
- Le tiret long « — » ou « -- », même une fois.
- La culture générale : micabo sert à réviser ses cours, pas à apprendre des faits.

8. TROIS VARIANTES, TROIS FORMES
A. Élément du format : micabo est un item de la liste comme les autres.
B. Résultat : ce que ça a changé, avec un détail tiré du deck.
C. Le trou : la plus courte, celle qui en dit le moins.
Les trois dans le même mode et le même gabarit.

9. CHOISIS LA MEILLEURE
Écarte d'abord celles qui cassent une règle : gabarit, numéro, longueur, marque, interdits. Parmi les autres, garde celle qu'un élève de ce compte aurait vraiment écrite, et qui donne le plus envie de demander « c'est quoi micabo ? ». La plus correcte n'est pas forcément la meilleure.
$p$)
on conflict (cle) do nothing;

notify pgrst, 'reload schema';
