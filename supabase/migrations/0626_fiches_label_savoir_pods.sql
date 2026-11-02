-- 0626 : fiches label, version 2 : le savoir des pods (30/10).
--
-- Adrien : « c'est eux qui ont le plus de knowledge ». Chaque pod qui écrit
-- les originaux d'un label a été lu (pods/*/AGENT.md, ANALYSE.md, playbook,
-- CTA.md, notes des livraisons) : où il place l'appli et pourquoi, ses
-- versions de CTA (A/B/C) et celles qu'il a retirées, ses meilleures slides
-- d'appli, ses règles. Quand la pratique d'un pod contredit la fiche CTA
-- (slide avant la 4, impératif avec l'appli, l'appli à la place du conseil),
-- la fiche le dit. Aucun refus motivé dans pod_livraisons : les retours
-- humains sont dans les fichiers des pods.
--
-- Chaque version 2 part de la version 1 (0625, auteur « premier-jet ») :
--   * la ligne « Sources » cite le pod ;
--   * une rubrique « What the pod knows » s'ajoute avant les exemples (ou
--     avant « Avoid » pour les labels remake) ;
--   * quelques lignes s'ajoutent à « Avoid in this label ».
-- 11 labels ont un pod ; alpha_male_film, classic_study et medical_study
-- gardent leur version 1.
--
-- Une nouvelle version par label (les anciennes restent), auteur « savoir-pods ».
-- Retour arrière : delete from bleo_fiches where sorte = 'label' and auteur = 'savoir-pods';

insert into public.bleo_fiches (sorte, cle, version, contenu, auteur)
select 'label', p.cle,
       (select max(b.version) from public.bleo_fiches b where b.sorte = 'label' and b.cle = p.cle) + 1,
       rtrim(replace(replace(replace(v1.contenu, p.sources_avant, p.sources_apres),
                             p.ancre, p.pod || E'\n\n' || p.ancre),
                     p.autre_avant, p.autre_apres), E'\n') || E'\n' || p.a_eviter,
       'savoir-pods'
from (values
('weird_alpha',
 $t$Sources: our published posts of the last 60 days and Maximilien's placement angle.$t$,
 $t$Sources: Maximilien's placement angle, the pod's knowledge (pods/originaux) and our published posts of the last 60 days.$t$,
 $t$## Placement examples$t$,
 $t$## What the pod knows (pods/originaux, read 30/10)
The pod writes the English originals of this label; it has delivered 85 of them.
- Where: « Slide 5 = slide Sophia : un item « apprendre un truc chaque jour en 5 minutes » (art, histoire, sciences) ». Decks have 6 slides; 73 originals put the app on slide 5, 12 on slide 4 (when the source's slide 4 cites a competing app), never on slide 6.
- Its three versions (since 26/10), alternated from one delivery to the next:
  - A, before / after in the first person: « one lesson a day / i used to scroll for an hour every night. now i spend 5 minutes on one lesson in the Sophia app instead: the ocean, a painting, a moment in history. my brain finally feels fed. »
  - B: « the Sophia app turns it into one short lesson a day ».
  - C, slide 4: « i do it with the Sophia app, one lesson a day, five minutes ».
- Retired on 26/10: « a micro-learning app like the Sophia app makes it easy », judged « trop usée » after the first 47 originals.
- Another of its app slides: « five minute deep dives / pick one topic you know nothing about and give it 5 minutes a day: an art movement, an ancient city. a micro-learning app like the Sophia app makes it easy, and interesting people are calm around anyone. » (after « standing calls / take every important call standing up and walking around… »).
- Pod rules: the app on one slide only; no em dash, no semicolon.
- For the native rewrite: the first-person version suits decks that already speak in « i »; in a deck of « you » items, keep the deck's mode (CTA sheet).$t$,
 $t$- A forced link, flagged by the pod: « he shares random, smart facts he just learned on… » on a dating slide.
- « therapist made me download »-style lines (pod analysis).
$t$,
 $t$$t$, $t$$t$),

('alpha_male_yellow',
 $t$Sources: our published posts of the last 60 days and Maximilien's placement angle.$t$,
 $t$Sources: Maximilien's placement angle, the pod's knowledge (pods/alpha-yellow) and our published posts of the last 60 days.$t$,
 $t$## Placement examples$t$,
 $t$## What the pod knows (pods/alpha-yellow, read 30/10)
The pod writes the English originals of this label; it has delivered 63 of them.
- Where: « Slide 5 = slide Sophia : un item sur l'apprentissage (apprendre un peu de tout, avoir quelque chose à dire sur tout) ». Since 26/10 it moves the slide around (mostly 5 or 7 of 8).
- Its three versions (since 26/10), alternated:
  - A, a first-person tip: « I do five minutes a day on a micro-learning app like the Sophia app. History, art, science. »
  - B, before / after: « Before: nothing to add when the talk got deep. After: five minutes a day on a micro-learning app like the Sophia app. History, art, science. Now I've always got a reference ready. »
  - C, a 30-day challenge: « Try this for 30 days: five minutes a day on a micro-learning app like the Sophia app. History, art, science. Knowing a bit about everything makes you calmer and sharper in any discussion. »
- Replaced on 26/10 (no reason written): the app in the middle of the item, « Swap five minutes of scrolling for… », and « benefit first, the app at the end ».
- Another of its app slides: « Always have one interesting thing to share. A micro-learning app like the Sophia app gives you five minutes a day of history, art or science. You'll never be the one stuck for something to say. » (after « Want an honest opinion? Ask "What would you change?" instead of "What do you think?"… »).
- Pod rules: the app slide never sits on a recognisable star's face, and the text never makes the person in the photo speak.
- For the native rewrite: the pod's own recipe is that every item starts with a verb; « Before: / After: » breaks it, so keep the verb opening of the neighbours.$t$,
 $t$- Phone addiction as the angle (the pod's playbook lists it under « a_eviter »).
$t$,
 $t$$t$, $t$$t$),

('alpha_male',
 $t$Sources: our published posts of the last 60 days and Maximilien's placement angle.$t$,
 $t$Sources: Maximilien's placement angle, the pod's knowledge (pods/alpha-male) and our published posts of the last 60 days.$t$,
 $t$## Placement examples$t$,
 $t$## What the pod knows (pods/alpha-male, read 30/10)
The pod writes the English originals of this label (36 accounts, 22 languages, all Sophia).
- Where, from the winners: « sur le dernier item. « Learn one new thing every day », « stop wasting your screen time »… ou dans un post de signes, « he learns something new every day » ». It must be « une idée concrète, dans le même mode que le deck (« you », « he », « I ») ». 22 of its 30 originals put the app on the last item.
- Its three versions (since 26/10), alternated:
  - A, last item: « Use a micro-learning app / like the Sophia app: / history, science or art / in 5 minutes. »
  - B, last item, first-person testimony: « I swap my morning scroll for / 5 minutes on the Sophia app. » It replaced the « screen time » angle, « trop proche de A ».
  - C, one tip among others in the middle of the deck: « 3. School ends. / Learning shouldn't. / Learn one thing a day / on the Sophia app: 5 minutes / of history, science or art. »
- Two of its app slides that keep the deck's mould:
  - « 4. He's curious. / He learns one thing a day / on the Sophia app: 5 minutes / of history, science or art. » (after « 3. He takes bad news calmly. / He deals with it first, / reacts later. »)
  - « 5. If Someone Mentions / Something You Don't Know... / Ask About It: / Don't nod along. / Don't fake it. / Then learn a little every day / with a micro-learning app / like the Sophia app. / Curiosity earns respect. »
- Pod rules: the app slide's image shows no person, no app, no readable screen.
- For the native rewrite: not version A's « Use a micro-learning app… » (no imperative with the app, CTA sheet); keep the item's own reason line instead of swapping it for the app line; keep the deck's « you », « he » or « I ».$t$,
 $t$- An app slide much longer than its neighbours: the pod's are about 1.4 times longer, up to 2 times.
$t$,
 $t$$t$, $t$$t$),

('smart_girl',
 $t$Sources: our published posts of the last 60 days and Maximilien's placement angle.$t$,
 $t$Sources: Maximilien's placement angle, the pod's knowledge (pods/smart-girl) and our published posts of the last 60 days.$t$,
 $t$## Placement examples$t$,
 $t$## What the pod knows (pods/smart-girl, read 30/10)
The pod writes the English originals of this label (61 accounts, 24 languages, all Sophia).
- Where: « dans un post de vocabulaire, sur le dernier mot (« autodidact », « erudite ») ; dans une liste, sur l'item « learn something new every day in 5 minutes » ou « always have something interesting to say » ». From its winners: the last slide « savoir articuler ses pensées » of @b3tteryou carries an app, « c'est la place de Sophia ».
- Its three versions (current set), alternated:
  - A, last item, a first-person tip (« I learn … with a micro-learning app like the Sophia app »).
  - B, in the middle of the deck, on a fact or a story: « 3. Know one story before / you go. I learn the story / behind one painting a day / with a micro-learning app / like the Sophia app. »
  - C, the app as a ritual of the list, in place of the scroll (« an app like Sophia instead of the feed »).
- Retired on 26/10: « the easy way: a micro-learning app like the Sophia app » (the app instead of the tip).
- Two of its app slides:
  - « Autodidact: a self-taught / person / (aw-toh-DY-dakt) / Example: / She became an autodidact with / a micro-learning app like the / Sophia app, 5 minutes a day. » (after « Pensive: lost in deep or / serious thought / (PEN-siv) / Example: / She looked pensive by the / window. »)
  - « instead of "very interesting" / say "fascinating" / the real secret? / i learn 5 minutes a day with / a micro-learning app like the / sophia app. new ideas bring / new words. »
- Pod rules: never say the app is free; no real person on the app slide's image.
- For the native rewrite: keep the length of the neighbours (the pod's app slide is longer than the slide before in 42 of 43 decks).$t$,
 $t$$t$,
 $t$$t$, $t$$t$),

('beau_smart_girl',
 $t$Sources: our published posts of the last 60 days and Maximilien's placement angle.$t$,
 $t$Sources: Maximilien's placement angle, the pod's knowledge (pods/beau-smart-girl) and our published posts of the last 60 days.$t$,
 $t$## Placement examples$t$,
 $t$## What the pod knows (pods/beau-smart-girl, read 30/10)
The pod writes the French originals of this label for Sophia (19 Sophia accounts; the 8 UnSwipe accounts keep the imports).
- Where: « L'angle qui marche pour ce label : apprendre un truc sur le monde chaque jour, et avoir toujours une histoire à raconter. Dans les gagnants, Sophia est souvent le dernier item, avant la slide de fin. »
- Its three versions (CTA.md, since 26/10), alternated:
  - A, the last item, before / after in the first person: « avant, quand on parlait d'art ou d'histoire, je hochais la tête. maintenant, j'ouvre l'appli Sophia chaque matin. et c'est moi qui raconte. »
  - B, the anecdote of the day, item 2 or 3: « ce matin, l'appli Sophia m'a appris [le même fait]. je l'ai raconté trois fois dans la journée. » The fact changes every time and is checked on a real page first (one was dropped on 25/10: « la tour eiffel devait être démontée au bout de 20 ans »).
  - C, the first item: « si tu ne testes qu'un truc de cette liste : l'appli Sophia chaque matin, pendant 7 jours. tu me diras. »
- Retired on 26/10: « 5 minutes d'histoire, d'art ou de sciences » as the main sentence, « elle a servi sur presque toutes les livraisons du 19 au 25/10 ».
- Another of its app slides: « 5. dans les transports, elle ouvrait l'appli Sophia. / 5 minutes d'histoire, d'art ou de sciences entre deux stations. / elle arrivait en cours avec une anecdote, tous les jours. » (after « 4. avant un film historique, elle lisait la vraie histoire. / cinq minutes, pas plus. / … / et elle adorait le dire. »)
- Pod rules: no scientific promise about the app; every fact true and checked.
- For the native rewrite: not version C (first item, so before slide 4, and the app is the tip itself) nor B on slide 3 (CTA sheet: slide 4 or later, a tip that stands without the app). Keep the deck's voice: one deck switched from « elle » to « moi » on the app slide.$t$,
 $t$$t$,
 $t$$t$, $t$$t$),

('RH',
 $t$Sources: our published posts of the last 60 days and Maximilien's placement angle.$t$,
 $t$Sources: Maximilien's placement angle, the pod's knowledge (pods/rh) and our published posts of the last 60 days.$t$,
 $t$## Placement examples$t$,
 $t$## What the pod knows (pods/rh, read 30/10)
The pod writes the French originals of this label (never naming TurboResume, the source's app).
- Where: the source puts its app on slides 4 to 6, so the pod uses « une seule slide (la 5) »; since 26/10 it moves between 3 and 6. The angle: « avoir toujours un sujet de conversation en entretien ou avec son manager, briser la glace ».
- Its versions, alternated:
  - A, confession: « 5 / « vous avez une culture générale solide ? » / perso, j'ouvre l'appli Sophia 5 minutes chaque matin. en ce moment c'est l'histoire, et je peux en parler »
  - B, instruction: « utilise l'appli Sophia… ».
  - D (since 26/10, replacing the C challenge « teste 5 minutes sur l'appli Sophia… »): the app is one item of a list of reflexes, not the punchline: « « en ce moment j'apprends un peu d'histoire de l'art » / 10/10 / mes 3 sources : mes voyages, mes podcasts, et 5 minutes par jour sur l'appli Sophia »
- Two of its app slides that keep the deck's frame:
  - « 4 / « vous lisez quoi en ce moment ? » / j'ai dit « plein de petites choses sur l'histoire de l'art » / la vérité : 5 minutes par jour sur l'appli Sophia dans le métro, et j'avais de quoi en parler 10 minutes » (after « 3 / « vous avez déjà dit non à votre manager ? » / j'ai dit « … » / la vérité : … »)
  - « elle avait toujours une anecdote à la pause café / un truc qui avait rien à voir avec le boulot. / mon équivalent : 5 minutes par jour sur l'appli Sophia, et maintenant c'est moi qu'on vient voir à la pause » (after « elle bloquait une heure sans réunion chaque matin… »)
- For the native rewrite: not version B (« utilise l'appli Sophia » is an imperative with the app, CTA sheet), not slide 3, and keep the deck's question-and-answer frame on the app slide.$t$,
 $t$- Dropping the deck's frame on the app slide (« tu réponds / « … » » gone on one deck).
$t$,
 $t$$t$, $t$$t$),

('clean_study',
 $t$The examples are real posts of ours$t$,
 $t$Sources: the pod's knowledge (pods/clean-study) and our published posts of the last 60 days. The examples are real posts of ours$t$,
 $t$## Placement examples$t$,
 $t$## What the pod knows (pods/clean-study, read 30/10)
The pod writes the originals of this label without any app: « Tu écris un seul texte, sans aucune appli ». It leaves the slot, and the OS places the app:
- « un item où l'on se teste sur ses cours, revoit ses notes ou prépare un examen : l'OS y place micabo ; un item sur le téléphone, le scroll, les Reels ou la concentration : l'OS y place UnSwipe. » Lately: micabo on slide 4, UnSwipe on slide 6.
- Slots it prepared, for example: « Active recall 🧠 / Best for: Biology, History, Geography / close the book, write down everything you remember, then check what you missed. » (micabo) and « 25 minutes, no phone 📵 / Best for: every single subject / 25 minutes of real focus beats 3 hours of studying next to your notifications. » (UnSwipe).
- App lines the OS wrote on its posts, quoted in its analysis: « mets tes cours 10 minutes le soir dans une appli comme micabo pour te tester » and « je ne supprimerai jamais mes réseaux, mais UnSwipe enlève les Reels d'Instagram et me laisse les messages ».
- Pod rules: no real person and no readable screen on the app slide's image; no other study app in the text (Quizlet, Anki, Notion…).
- For the native rewrite: some slots sit on slide 2 or 3, and one deck has two micabo slots; use slide 4 or later and one mention.$t$,
 $t$$t$,
 $t$$t$, $t$$t$),

('white_bg',
 $t$the rules below come from pods/page-blanche.$t$,
 $t$the rules below come from pods/page-blanche.$t$,
 $t$## Avoid in this label$t$,
 $t$## What the pod knows (pods/page-blanche, read 30/10)
- Remakes of @amayareading, whose app slide was ReadUp: « Seul le texte change, et la slide de l'app devient Sophia » (a Sophia screenshot and its App Store banner). A remake keeps the original's position; an original varies it (middle of the list, second to last, last). « Un post sans slide d'app n'est pas déposé. »
- The logic: « tant qu'à être sur ton tel, apprends un truc au lieu de scroller ».
- Pod rules: « jamais « Sophia » seul »; no ad formula, no « X n'est pas Y, c'est Z », no em dash, no semicolon. UnSwipe variants: « UnSwipe n'est jamais le sujet numéro 1 »; no stats, timer, time limit or notifications; « En confession, l'autrice ne dit jamais qu'elle utilise l'appli »; one ad only.
- For the native rewrite: some originals put the app on slide 2 or 3, and one says « try the Sophia app »; use slide 4 or later (or the original's app slide on a remake) and no imperative with the app.$t$,
 $t$- Ironic decks that name the app as a joke (« definitely don't open the Sophia app »).
$t$,
 $t$$t$, $t$$t$),

('Fathomly',
 $t$the rules below come from pods/fathom.$t$,
 $t$the rules below come from pods/fathom.$t$,
 $t$## Avoid in this label$t$,
 $t$## What the pod knows (pods/fathom, read 30/10)
- Accounts: German and European Portuguese. The Sophia step « remplace une étape »; its title is « une vraie étape de la liste, dans son style ». Decision of 23/10: no more app slide at the end.
- Card lines in use: A « learn something new every day, / in 5 minutes. »; B « 5 minutes a day / to know a bit about everything. »; C « what I open / instead of scrolling. » (in German: « was ich öffne, / statt zu scrollen. »).
- UnSwipe card lines: « keep Instagram, lose the Reels. / no need to delete anything. » and « Instagram without the Reels. / messages and stories stay. »
- Delivered: « IF YOU ONLY / HAVE 5 MINUTES » with card C; « LEARN NEW / TOPICS » and « ANSWER RANDOM QUESTIONS » with card A.
- For the native rewrite: some decks put Sophia on slide 3 and UnSwipe on slide 2 (both back to back in one deck); keep slide 4 or later unless it is the original's app slide. On « 10/10 Skills » decks, give the Sophia step the same sub-line as its neighbours.$t$,
 $t$$t$,
 $t$$t$, $t$$t$),

('mentalmaxxing',
 $t$the rules below come from pods/mentalapp.$t$,
 $t$the rules below come from pods/mentalapp.$t$,
 $t$## Avoid in this label$t$,
 $t$## What the pod knows (pods/mentalapp, read 30/10)
- Languages: en, fr, de, es, it, tr. No account attached yet.
- Remakes put the element on slide 2 (a tier list is a cover and one list). Tier-list originals: slide 2, « à une place qui a du sens (en tête du S+ sur un sujet d'attention) ». Carousels: the app is its own item, written in the first person.
- Versions: A, the first box of S+; B, the last box of S+; C, a first-person carousel item. The caption is fixed, so the versions vary by form and place.
- Carousel items it delivered: « My focus came back the week I deleted short videos with UnSwipe. Now one hour of work is actually one hour. » and « What finally worked for me: I deleted short videos with UnSwipe. Not more willpower, less temptation. »
- Pod rules: the name always comes with the language's word for « app » (« (UnSwipe app) »); no em dash, no semicolon in translations; never the app's name in the TikTok caption. Celebrities may stay, even on the app slide (Adrien, 21/10).
- The « slide 4 or later » floor of the CTA sheet cannot apply to a two-slide tier list: the element stays in the list.$t$,
 $t$$t$,
 $t$$t$, $t$$t$),

('that_girl_study',
 $t$the rules below come from pods/yasmine.$t$,
 $t$the rules below come from pods/yasmine.$t$,
 $t$## Avoid in this label$t$,
 $t$## What the pod knows (pods/yasmine, read 30/10)
- Languages: fr, en, es, de, it, pt, tr (Adrien, 24/10); micabo always in lowercase. One exception on Adrien's request: yp-003 also shows UnSwipe and Sophia cards.
- The micabo slide always lands on a study step.
- Version A, delivered in the text of a tip:
  - « teste-toi au lieu de relire.🧠 / relire ses fiches donne l’impression de savoir. moi, je mets mes cours dans micabo et je fais ses quiz : je vois tout de suite ce que je ne sais pas encore. »
  - « révise tôt🌸 / le bachotage de dernière minute, c’est le pire pour ta santé mentale. moi, je mets mes cours dans micabo et je fais 10 min de quiz par jour : rien ne s’empile. »
- Retired on 23/10: the iPhone screenshot pasted at the end (« et pour réviser, / je mets mes notes dans micabo »), judged « pas fluide du tout ».
- For the native rewrite: some posts put micabo on slide 3; use slide 4 or later unless it replaces an app the original shows. A caption that only works with the app (« une étape de ton parcours⚡ », « micabo >> ») doesn't stand alone.$t$,
 $t$$t$,
 $t$App: micabo only, in French.$t$, $t$App: micabo only.$t$)

) as p(cle, sources_avant, sources_apres, ancre, pod, a_eviter, autre_avant, autre_apres)
join public.bleo_fiches v1
  on v1.sorte = 'label' and v1.cle = p.cle and v1.auteur = 'premier-jet';
