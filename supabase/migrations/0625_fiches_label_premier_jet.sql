-- 0625 : premier jet des fiches label (30/10), à relire dans la page Fiches.
--
-- Depuis 0624, une fiche label est écrite à la main : le format du deck, où va
-- l'appli, des exemples réels de placements réussis, ce qu'il faut éviter.
-- Ce premier jet part de deux sources :
--   * l'angle de placement actif de Maximilien (`angles_placement`, 24-25/10),
--     cité tel quel : ce que l'appli apporte selon le sujet du post, le ton et
--     le persona (7 labels, tous pour Sophia) ;
--   * nos posts publiés des 60 derniers jours (la slide de l'appli, marquée
--     `position_sophia`, et la slide d'avant), choisis pour la qualité du
--     placement, pas pour les vues.
-- Les labels « remake » (white_bg, Fathomly, mentalmaxxing, that_girl_study)
-- ont leur texte dans l'image : leur fiche reprend les règles de leur pod
-- (pods/*/AGENT.md).
-- Pas de fiche pour faceless_study, Hook et UGC AI VIDEO : aucun post publié.
--
-- Une nouvelle version par label (les anciennes restent), auteur « premier-jet ».
-- Retour arrière : delete from bleo_fiches where sorte = 'label' and auteur = 'premier-jet';

insert into public.bleo_fiches (sorte, cle, version, contenu, auteur)
select 'label', f.cle,
       coalesce((select max(b.version) from public.bleo_fiches b where b.sorte = 'label' and b.cle = f.cle), 0) + 1,
       f.contenu, 'premier-jet'
from (values

('smart_girl', $fiche$# Label sheet: smart_girl

> Apps: Sophia. The cultured, eloquent, elegant girl. Sources: our published posts of the last 60 days and Maximilien's placement angle. The examples are real posts of ours, quoted as published (« / » is a line break). Adapt the idea, never copy the sentence, and name the app as the app sheet says.

## The deck
- Hooks: vocabulary lists (« les plus beaux mots à ajouter à ton vocabulaire », « arrête de dire « très » »), hobbies or habits to become a genius, rules of elegant women (« 12 règles de savoir-vivre des femmes élégantes »).
- Slides: one item per slide, short. Vocabulary: word, definition, then « Exemple : » and a sentence. Lists: number, title, one or two lines. Lowercase and small symbols (✧ ୨୧ ⋆) when the deck has them.
- The last slide is often an outro (« abonne-toi pour plus de mots ! / partie 3 ? »): never the app slide.

## The angle (Maximilien, 25/10): what the app brings, by topic
> Sophia's active placement angle for this label, quoted as written. It decides what the app slide promises; the examples below show where it goes.

- IF the post is about conversations, dates or friends: knowing a bit about everything, so she always has something to bring up.
- IF it’s about school or studies: culture beyond the syllabus.
- IF it’s about museums, books or films: getting the references.
- OTHERWISE: smart without showing off.
- Tone: personal and calm, like a tip to a friend. Never school-like.
- Persona: female creator, use feminine agreements.

## Where the app goes
- Vocabulary deck: keep the item format. Either the word itself fits (cultivé, curieux, érudit) and the app lives in its example sentence, or the app comes as « le vrai secret » under an existing word. Never a word invented for the app.
- Hobbies or habits list: one item about general culture or learning something every day, in exactly the layout of the other items.
- Rules in the third person (« Elle… »): the app slide is one more rule, in the third person too.
- Usually the last real item, just before the outro.

## Placement examples
### 1. « arrête de dire « très » / les mots pour paraître dangereusement cultivée » (fr)
- Slide before: « un seul mot précis ça tape toujours + fort que « très » + un mot basique / ça montre direct que tu choisis tes mots »
- App slide: « au lieu de « très intéressant » / dis « fascinant » / le vrai secret ? / j'apprends 5 min par jour avec une appli comme sophia app / nouvelles idées = nouveaux mots »
- Why it works: the slide keeps the deck's « au lieu de… dis… » pattern; the app arrives as the secret behind the words, in the first person.

### 2. « 5 mots stylés pour pimper ton vocabulaire » (fr)
- Slide before: « Révérencieux / qui montre un respect immense / Exemple : / Ils parlaient sur un ton révérencieux. »
- App slide: « Cultivé / qui a une culture générale vaste et variée / Exemple : / L'appli Sophia t'aide à le devenir en 5 minutes par jour. »
- Why it works: a real word with a real definition; the app lives only in the example sentence.

### 3. « 12 règles de savoir-vivre des femmes élégantes » (fr)
- Slide before: « 11. Elle se lève pour saluer ou serrer une main. Ami, collègue ou inconnu, se lever est un petit geste qui dit : tu es important. »
- App slide: « 12. Elle sait parler d'art, d'histoire ou de sciences avec aisance. Elle utilise l'application Sophia pour apprendre une nouvelle chose chaque jour. »
- Why it works: the rule stands without the app, in the same « Elle… » voice and length as rule 11.

## Avoid in this label
- An imperative with the app in the example sentence (« Exemple : utilise une appli de micro-apprentissage comme l'appli Sophia pour devenir érudit facilement. »): the example must read like a real sentence using the word.
- Breaking the numbering: one published deck went « 5. » then « 7. la culture générale » then « 7. ». Reread the whole list.
- The app on the outro slide.
$fiche$),

('weird_alpha', $fiche$# Label sheet: weird_alpha

> Apps: Sophia (and UnSwipe on some decks). Strange habits and hobbies that make you smarter or more confident. Sources: our published posts of the last 60 days and Maximilien's placement angle. The examples are real posts of ours, quoted as published (« / » is a line break). Adapt the idea, never copy the sentence, and name the app as the app sheet says.

## The deck
- Hooks: « hobbies that will make you disgustingly intelligent », « hobbies that will make you dangerously confident », « les habitudes bizarres pour devenir la personne la + attirante du groupe ». Lowercase.
- Slides: a short, odd name for the hobby (« memory palaces », « mirror writing », « public stillness ») then two or three lowercase lines: what to do, then why it works. Some decks number « 2) ».

## The angle (Maximilien, 24/10): what the app brings, by topic
> Sophia's active placement angle for this label, quoted as written. It decides what the app slide promises; the examples below show where it goes.

- IF the post is about AI, the brain or mental health: keeping a mind of her own.
- IF it’s about being likable, attractive or confident: having unexpected things to talk about.
- IF it’s about routines or self-care: learning as care for the mind.
- OTHERWISE: standing out by knowing things others don’t.
- Tone: personal, slightly quirky, confident.

## Where the app goes
- One of the hobbies, around slide 4 or 5 of 6. It gets its own odd, concrete name like its neighbours; the app is the way to practise it.
- The last line keeps the deck's punchline about what it does to you.
- UnSwipe: a hobby that replaces scrolling, on a deck about attention or confidence.

## Placement examples
### 1. « hobbies that will make you disgustingly intelligent » (en)
- Slide before: « why chains / ask "why" five times about one thing you believe. most opinions collapse by the third why, and the ones that survive are actually yours. »
- App slide: « five minutes of history / spend 5 minutes a day on one moment from history: a revolution, an invention, a forgotten queen. a micro-learning app like the Sophia app turns it into a daily habit without eating your time. »
- Why it works: a specific hobby with concrete examples; the app is only how you do it.

### 2. « les habitudes qui te donnent DANGEREUSEMENT confiance en toi » (fr)
- Slide before: « s'habiller le mardi / mets ta tenue préférée un mardi au hasard, sans aucune raison. … »
- App slide: « la curiosité du matin / chaque matin, passe 5 min sur un truc qui t'a toujours intrigué. une appli comme Sophia app a des mini leçons d'art, d'histoire et de science. les gens curieux ont toujours quelque chose à raconter. »
- Why it works: a ritual tied to a moment of the day, like its neighbour; it ends on confidence, the promise of the hook.

### 3. « les habitudes bizarres pour devenir la personne la + attirante du groupe » (fr)
- Slide before: « parler + lentement / parle un peu + lentement et un peu + bas pendant une semaine. … »
- App slide: « apprendre un truc surprenant / apprends un truc fou chaque jour en 5 min : un animal bizarre, une cité perdue. une appli comme Sophia rend ça hyper simple, et les gens passionnants ont toujours un truc nouveau à raconter. »
- Why it works: the weird examples (an odd animal, a lost city) keep the « bizarre » tone.

### 4. « hobbies that can f**k with your psychological understandings » (en)
- Slide before: « 2) lucid dreaming / train yourself to control dreams by reality checking hourly… »
- App slide: « 3) perspective shifting / read about philosophy or science daily. a micro-learning app like the Sophia app helps you gain deep insights in 5 minutes to completely reshape how you view reality »
- Why it works: same « 3) » numbering and lowercase; the hobby stays psychological.

## Avoid in this label
- Naming the hobby after the app category (« micro-learning », « active learning »): several published decks did it, and the slide reads as the ad. Give it an odd, specific name.
- A generic line with no punchline (« use a micro-learning app… to get short daily lessons on art and history. »).
$fiche$),

('alpha_male_yellow', $fiche$# Label sheet: alpha_male_yellow

> Apps: Sophia. Social skills and self-improvement for young men, in the @stonemag.co style. Sources: our published posts of the last 60 days and Maximilien's placement angle. The examples are real posts of ours, quoted as published (« / » is a line break). Adapt the idea, never copy the sentence, and name the app as the app sheet says.

## The deck
- Hooks: « Rare skills that will make you unforgettable », « 7 compétences pour devenir imbattable dans ta vingtaine », « How to become extremely good at flirting in your 20s », « how to gracefully disarm any insult ».
- Slides: an imperative title sentence (« Get good at toasts. », « Learn to change the subject smoothly. ») then a concrete scene, often with a quoted line, about 35 to 50 words.
- The last slide is the page brand (« STONE MAG. », « KLEVR.MIND »): never the app slide.

## The angle (Maximilien, 25/10): what the app brings, by topic
> Sophia's active placement angle for this label, quoted as written. It decides what the app slide promises; the examples below show where it goes.

- IF the post is about talking, charisma or dating: never running out of things to say.
- IF it’s about respect or boundaries: being taken seriously because he knows his stuff.
- IF it’s about work or ambition: knowing more than the guys around him.
- OTHERWISE: getting educated in his 20s.
- Tone: assured and direct, no emojis.
- Persona: male creator, use masculine agreements.

## Where the app goes
- One skill about conversation: having stories, knowing the story behind things, asking good questions. The app gives the material; the last sentence says what it changes socially.
- Middle of the deck (slide 5 of 8 is typical).

## Placement examples
### 1. « Rare skills that will make you unforgettable » (en)
- Slide before: « Get good at toasts. Birthdays, weddings, a friend's new job. Thirty seconds, one specific memory, raise your glass. Most people mumble "Cheers, guys." Be the one who says something that actually lands »
- App slide: « Become the guy who knows random things. A micro-learning app like the Sophia app gives you five minutes a day of history, art or science. People never forget the friend who always has a story. »
- Why it works: same mould (imperative title, three sentences, social payoff at the end).

### 2. « Social skills that will make you unforgettable » (en)
- Slide before: « Learn to change the subject smoothly. When a chat gets tense or dull, build a bridge. … »
- App slide: « Always have a good question ready. A micro-learning app like the Sophia app gives you five minutes a day of history, art or science. Ask about any century, then actually know something about it. »
- Why it works: the skill (a good question) stands alone; the app feeds it.

### 3. « how to gracefully disarm any insult » (en)
- Slide before: « 3) expose their intention / smile and ask "what are you hoping to get out of saying that?" it calls out their frustration. »
- App slide: « 4) redirect the conversation cleanly / shift to an interesting topic instead. a micro-learning tool like the Sophia app gives you quick daily ideas. »
- Why it works: the deck's lowercase « 4) » format, and the slide stays on the hook's topic (insults).

### 4. « comment te faire remarquer instantanément par les filles » (fr)
- Slide before: « Ne cherche pas à être le plus bruyant. / Le mec qui crie pour qu'on le remarque s'oublie très vite. / … »
- App slide: « Aie toujours des trucs intéressants à raconter. / L'art, la science, l'histoire ou l'actualité. / Une appli de micro-apprentissage comme Sophia permet d'enrichir ta culture générale en 5 minutes par jour. »
- Why it works: short lines like its neighbour, and the advice answers the hook.

## Avoid in this label
- The brand outro slide.
- A plain study tip in a deck about social skills (« Passe 5 minutes par jour sur une appli de micro-apprentissage… Tu vas apprendre plein de trucs ») with no link to what it changes in a conversation.
- A recognisable celebrity's face on the app slide (pod rule): the star would seem to recommend the app.
$fiche$),

('alpha_male', $fiche$# Label sheet: alpha_male

> Apps: Sophia. Rules and advice between men: discipline, habits, social psychology, relationships. Sources: our published posts of the last 60 days and Maximilien's placement angle. The examples are real posts of ours, quoted as published (« / » is a line break). Adapt the idea, never copy the sentence, and name the app as the app sheet says.

## The deck
- Hooks: « Mec à mec / Voilà comment tourner la page pour de bon », « des conseils chelou qui marchent à 100% », « les règles de couple quand on s'embrouille », « 7 faits psychologiques sur les êtres humains », « How you master small talk: ».
- Slides: number, short title, one or two lines. Some decks repeat a formula on every slide (« Sois en colère contre moi, mais… »); some use Title Case titles and a short closing maxim.

## The angle (Maximilien, 25/10): what the app brings, by topic
> Sophia's active placement angle for this label, quoted as written. It decides what the app slide promises; the examples below show where it goes.

- IF the post is about respect, status or being listened to: tie knowing things to how seriously others take him.
- IF it’s about habits or transformation: learning as one of the habits that changes him.
- IF it’s about conversations or women: always having something interesting to say.
- OTHERWISE: being the interesting one in the room.
- Tone: direct, sober, short sentences. Never say “higher self” or “best version”.
- Persona: male creator, use masculine agreements.

## Where the app goes
- One rule or fact about learning or curiosity, often the last item.
- When the deck repeats a formula, the app slide repeats it too. In a facts deck, it stays a fact.

## Placement examples
### 1. « les règles de couple quand on s'embrouille » (fr)
- Slide before: « 7. Sois en colère contre moi, mais n'oublie pas qu'on est dans la même équipe. / C'est jamais toi contre moi, c'est nous deux contre le problème. »
- App slide: « 8. Sois en colère contre moi, mais continue d'ouvrir ton esprit. / Cinq minutes par jour sur une appli de micro-apprentissage comme Sophia aident à mieux prendre du recul. »
- Why it works: it keeps the anaphora and the couple topic; the app is how you step back.

### 2. « 7 faits psychologiques sur les êtres humains : » (fr)
- Slide before: « 5. Fermer les yeux aide à se souvenir des choses. »
- App slide: « 6. Apprendre un fait nouveau par jour stimule le cerveau. Une appli comme l'appli Sophia est parfaite pour ça. »
- Why it works: it is still a fact, as short as the others.

### 3. « How you master small talk: » (en)
- Slide before: « Remember Small Details. / Names, hobbies, goals, or recent events. / People appreciate being remembered. / Attention creates connection. »
- App slide: « Keep Fresh Knowledge. / Spend 5 minutes a day on a micro-learning app like the Sophia app. / Having quick facts on history or art makes small talk effortless. / Curiosity feeds conversation. »
- Why it works: Title Case title and a closing maxim, exactly like the neighbour.

### 4. « 5 conseils pour retrouver ton étincelle » (fr)
- Slide before: « 4. Tiens tes promesses envers toi-même / Rien ne détruit plus ton étincelle que de perdre confiance en toi. / … »
- App slide: « 5. Apprends quelque chose de nouveau chaque jour / Nourrir ta curiosité te redonne instantanément de l'élan. / Une appli de micro-apprentissage comme l'appli Sophia t'aide à le faire en 5 minutes. »
- Why it works: the advice answers the hook (the spark); the app comes second.

## Avoid in this label
- Preaching about the phone while pushing an app (« Arrête de perdre ton temps sur ton téléphone. … Focus. Franchement, fais-le pour toi. »).
- A person on the app slide's image (pod rule): use a room, a desk, a library or a landscape.
$fiche$),

('alpha_male_film', $fiche$# Label sheet: alpha_male_film

> Apps: Sophia. « how to become dangerously… » lists on film stills. Sources: our published posts of the last 60 days and Maximilien's placement angle. The examples are real posts of ours, quoted as published (« / » is a line break). Adapt the idea, never copy the sentence, and name the app as the app sheet says.

## The deck
- Hooks: « how to become dangerously focused », « how to become someone everyone wants to talk to », « how to become disgustingly educated », « comment être hyper sociable à 20 ans sans forcer ».
- Slides: five slides; a short title sentence, then two to four short lines.

## The angle (Maximilien, 25/10): what the app brings, by topic
> Sophia's active placement angle for this label, quoted as written. It decides what the app slide promises; the examples below show where it goes.

- IF the post is about talking, charisma or dating: never running out of things to say.
- IF it’s about respect or boundaries: being taken seriously because he knows his stuff.
- IF it’s about work or ambition: knowing more than the guys around him.
- OTHERWISE: getting educated in his 20s.
- Tone: assured and direct, no emojis.
- Persona: male creator, use masculine agreements.

## Where the app goes
- Slide 3 or 4 of 5: one habit about learning, tied to the hook's promise (focus, charisma, conversation, knowledge).

## Placement examples
### 1. « how to become dangerously focused » (en)
- Slide before: « Eliminate distractions. / Turn off notifications, put your phone away, and create an environment built for focus. Attention is your greatest asset. »
- App slide: « Build a daily learning habit. / Spend just 5 minutes a day feeding your mind. A micro-learning app like the Sophia app makes it easy to learn something new about history or science without getting distracted. »
- Why it works: it answers the hook (focus) and follows the distraction slide naturally.

### 2. « comment être hyper sociable à 20 ans sans forcer » (fr)
- Slide before: « sors de chez toi. rejoins des clubs, teste des activités et dis oui plus souvent. les opportunités vont pas taper à ta porte. »
- App slide: « nourris tes discussions. pour avoir des sujets de conversation, cultive-toi 5 minutes par jour. une appli de micro-apprentissage comme l'appli Sophia aide beaucoup. »
- Why it works: same lowercase one-paragraph layout; the habit serves sociability.

### 3. « how to become disgustingly educated » (en)
- Slide before: « Read every day. / Books contain decades of knowledge. Read consistently and you'll gain insights most people never will. »
- App slide: « Study multiple subjects. / An app like the Sophia app helps you explore history, art, science, and philosophy every day. Broadening your knowledge daily makes thinking deeper effortless. »
- Why it works: a real habit (breadth) next to reading; the app is how.

## Avoid in this label
- Gluing the app onto an unrelated tip: « Protect your sleep. / 7–9 hours of quality sleep plus five minutes on the appli sophia each day is the best combo for your energy and focus. » (sleep has nothing to do with the app, and the French name sits in an English deck).
- Opening with an imperative on the app (« Get a micro-learning app… », « use a micro-learning app… »).
$fiche$),

('beau_smart_girl', $fiche$# Label sheet: beau_smart_girl

> Apps: Sophia (mostly), UnSwipe, micabo. The pretty AND cultured girl, mostly in French, in the @studyavec_lea style. Sources: our published posts of the last 60 days and Maximilien's placement angle. The examples are real posts of ours, quoted as published (« / » is a line break). Adapt the idea, never copy the sentence, and name the app as the app sheet says.

## The deck
- Hooks: science-backed habits (« 7 trucs validés par la science pour réparer ta santé », « (sources à la fin) »), confessions (« les règles que j'ai volé à ma mère pour devenir ridiculeusement cultivé »), « ce que les gens confiants font JAMAIS », self-care resets.
- Slides: lowercase, emojis, « !! », one habit per slide with a short explanation.

## The angle (Maximilien, 25/10): what the app brings, by topic
> Sophia's active placement angle for this label, quoted as written. It decides what the app slide promises; the examples below show where it goes.

- IF the post is about books, classics, art or museums: having the background that makes references finally click.
- IF it’s about careers, law, writing or studies: culture as an edge for ambitious paths.
- IF it’s about confidence or independence: quietly knowing more than most people her age.
- OTHERWISE: the cultured girl.
- Tone: elegant and personal, never school-like.
- Persona: female creator, use feminine agreements.

## Where the app goes
- Sophia: an item about feeding your mind or swapping passive scrolling for curiosity.
- UnSwipe: an item about scrolling, comparison or attention.
- micabo: an item about revising without stress.

## Placement examples
### 1. Sophia · « les règles que j'ai volé à ma mère pour devenir ridiculeusement cultivé. » (fr)
- Slide before: « 2. écrire, écrire, écrire. / quand tu écris à la main, le cerveau mobilise simultanément plusieurs zones… »
- App slide: « 3. apprendre TOUS les jours / le secret c'est la régularité. j'ai pris l'habitude de lire une micro-leçon d'art ou d'histoire sur l'appli Sophia tous les matins. ça me prend 5 minutes et j'apprends un truc neuf. »
- Why it works: a first-person habit in a confession deck, with the capitalised word the deck likes.

### 2. Sophia · « pt.1 ce que les gens confiants font JAMAIS » (fr)
- Slide before: « chercher de la réassurance partout / ils apprennent à décider par eux-mêmes. ils s'aiment comme ils sont. »
- App slide: « se faire tout petit pour plaire / ils s'excusent pas de savoir des choses. ils s'informent en silence et gardent une longueur d'avance. une appli de culture générale comme Sophia donne cette assurance calme qui a pas besoin de hausser le ton. »
- Why it works: it keeps the « what they never do » title and the « ils » voice.

### 3. UnSwipe · « how to build more confidence + independence » (en)
- Slide before: « 3. make decisions without always consulting with someone else. … »
- App slide: « 4. stop comparing yourself while doomscrolling. / scrolling for hours ruins your mood and drains confidence. / you don't have to delete your socials to fix it. / an app like Unswipe removes reels from instagram so you keep your chats without the endless feed. / protect your peace of mind. »
- Why it works: the advice is about confidence; the app comes last, as the way to apply it.

### 4. micabo · « comment faire un reset après un coup de mou » (fr)
- Slide before: « 2. fais le tri autour de toi. / ton environnement a un impact énorme sur ton cerveau. / … »
- App slide: « 3. arrête de laisser tes cours s'accumuler. / quand tu dois réviser, ne perds plus des heures à relire. avec une appli comme micabo, tes cours deviennent des leçons et quiz interactifs en quelques secondes. / c'est le meilleur moyen de retrouver le rythme sans stress. »
- Why it works: a reset step like the others, aimed at the student reader.

## Avoid in this label
- Squeezing the app into a list of benefits (« ce que t'apporte l'automne : … temps idéal pour lire et apprendre »): it vanishes or reads as an ad.
- Science claims about the app: the science backs the habit, never the app.
$fiche$),

('RH', $fiche$# Label sheet: RH

> Apps: Sophia. Hiring and career advice, in French and English, in the @careerswemma style. Sources: our published posts of the last 60 days and Maximilien's placement angle. The examples are real posts of ours, quoted as published (« / » is a line break). Adapt the idea, never copy the sentence, and name the app as the app sheet says.

## The deck
- Hooks: « ce que ma première manager m'a appris sans jamais me le dire », « what the recruiter says vs what they actually mean », « les phrases pour poser une limite à ton manager sans te griller », « how to leave a toxic job without ending up unemployed ».
- Slides: lowercase, often a first-person story about a manager, a recruiter or a friend who recruits; quotes in « » or "".

## The angle (Maximilien, 25/10): what the app brings, by topic
> Sophia's active placement angle for this label, quoted as written. It decides what the app slide promises; the examples below show where it goes.

- IF the post is about interviews or job search: general knowledge makes a candidate memorable.
- IF it’s about meetings, managers or being treated like a junior: holding her own in small talk with senior people.
- IF it’s about quitting, toxic jobs or emails: the confidence that comes from knowing more than her job.
- OTHERWISE: being taken seriously at work.
- Tone: a colleague sharing her experience, concrete, never corporate.
- Persona: female creator, use feminine agreements.

## Where the app goes
- The narrator's own habit, in the first person (« perso, … »), attached to the story's moment: what the manager did, what the narrator copied.
- In a step-by-step deck, one step about protecting your mind or standing out.

## Placement examples
### 1. « les phrases pour poser une limite à ton manager sans te griller » (fr)
- Slide before: « 2. quand il écrit à 22 h / rien le soir. et le matin : « vu ton message, je m'en occupe ce matin » / la réponse arrive, juste pas à 22 h »
- App slide: « 3. quand tu sens que tu satures / « j'ai besoin de 30 minutes sans réunion par jour » / perso, la première chose que j'y fais : 5 minutes sur l'appli Sophia. ma tête souffle avant de replonger »
- Why it works: the boundary phrase stays the item; the app is what the narrator does with the time she won.

### 2. « ce que ma première manager m'a appris sans jamais me le dire » (fr)
- Slide before: « elle disait merci avec un détail / jamais « merci pour tout ». / « merci pour le tableau, il m'a fait gagner une heure » »
- App slide: « elle partageait un truc appris chaque lundi / perso, j'ai copié : 5 minutes par jour sur l'appli Sophia, et le lundi j'ai toujours une histoire à raconter »
- Why it works: the manager's habit first, the narrator's copy second; the story never jumps.

### 3. « how to leave a toxic job without ending up unemployed » (en)
- Slide before: « step 3: job hunt in stealth mode. never on your work computer. tell nobody. … »
- App slide: « step 4: protect your mental space. toxic jobs destroy your confidence. taking 5 minutes a day on a micro-learning app like the Sophia app keeps your mind curious and reminds you that your worth goes far beyond your current job. »
- Why it works: a real step of the plan; the app serves the step, not the other way round.

## Avoid in this label
- The app on the story's payoff or the final explanation (« pourquoi ça marche / pour avoir des choses concrètes à raconter en entretien et relancer intelligemment, j'utilise l'appli Sophia »): it steals the conclusion.
- A gap in the numbering (« 2 » then « 4 »): reread the list.
- Any other career tool or app name.
$fiche$),

('classic_study', $fiche$# Label sheet: classic_study

> Apps: micabo and UnSwipe (no Sophia). Study tips, mostly in French. The examples are real posts of ours, quoted as published (« / » is a line break). Adapt the idea, never copy the sentence, and name the app as the app sheet says.

## The deck
- Hooks: « les méthodes pour cartonner à tous tes examens », « les trucs de fou que je fais pour déchirer mes exams (conseils d'une meuf qui a toujours 18+) », « 7 astuces de révision que personne te dit ».
- Slides: short items, often a problem then a method (« du mal à retenir les infos ? »), sometimes in the first person.

## Where the app goes
- micabo: the tip about retaining or testing yourself (active recall, flashcards, spaced repetition). The method is the title; micabo does it from your own notes.
- UnSwipe: the tip about the phone or scrolling while revising.

## Placement examples
### 1. micabo · « 7 astuces de révision que personne te dit » (fr)
- Slide before: « 4. un "cahier d'erreurs" / note chaque erreur que tu refais en étudiant / … »
- App slide: « 5. teste-toi avant / de commencer à réviser / arrête de relire tes cours, micabo te teste direct et là ça reste. »
- Why it works: the method (test yourself first) stands alone; micabo is how.

### 2. micabo · « les trucs de fou que je fais pour déchirer mes exams » (fr)
- Slide before: « quand je suis cramée pour étudier... / je transforme mes notes en audio… »
- App slide: « la fausse deadline / je fais croire à mon cerveau que l'exam est demain. / avec le site micabo.app, j'ai mes révisions prêtes en 2 minutes à partir de mes notes, ça m'aide à me mettre dans le bain tout de suite. »
- Why it works: an odd, real trick in the first person; the app makes the trick possible.

### 3. micabo · « les méthodes pour cartonner à tous tes examens » (fr)
- Slide before: « lire te fatigue ? / convertis tes notes en audio… »
- App slide: « du mal à retenir les infos ? / arrête de relire tes cours en boucle, micabo.app te teste au bon moment pour que ça rentre. »
- Why it works: the same question-then-answer pattern as its neighbour.

### 4. UnSwipe · « comment je suis passée de rater mes bacs blancs à tout exploser au bac » (fr)
- Slide before: « 5. La régularité / je faisais pas des heures de fou / juste 2 à 3 vraies heures la plupart des jours / … »
- App slide: « 6. La vraie différence / tout le monde veut des 20/20 / mais personne veut couper les distractions pendant les révisions / pas besoin de tout supprimer : l'appli UnSwipe enlève les reels d'instagram pour garder seulement ce qui sert »
- Why it works: the story's last step; the app only removes the distraction.

## Avoid in this label
- A tip titled after the app (« La méthode micabo »).
- A bare imperative plus the app (« transforme tes cours en flashcards avec micabo.app »): no reason, it reads as an ad.
- Stacking tools: if the slide before already names a tool, the app slide doesn't add a second one in the same breath.
$fiche$),

('clean_study', $fiche$# Label sheet: clean_study

> Apps: micabo and UnSwipe (never Sophia). « That girl » studytok, mostly in French, in the @studyy.hackz and @katy._.studies style. The examples are real posts of ours, quoted as published (« / » is a line break). Adapt the idea, never copy the sentence, and name the app as the app sheet says.

## The deck
- Hooks: first-person confessions (« mes habitudes d'études toxiques dont je n'arrive pas à me débarrasser », « ce que je fais EN COURS parce que je refuse de tout réapprendre chez moi »), memes (« moi quand… »), quotes, « comment devenir la meilleure élève de ta classe ».
- Slides: the narrator's voice, lowercase, emojis (☘️ ✨), short lines.

## Where the app goes
- micabo is something the narrator does, in her voice: right after class, when she sits down, when she avoids the horrible chapters.
- The deck's format stays intact: a meme line stays a meme line, a toxic habit stays a toxic habit.

## Placement examples
### 1. micabo · « ce que je fais EN COURS parce que je refuse de tout réapprendre chez moi » (fr)
- Slide before: « je mets un "?" à côté / des trucs que je comprends / À PEU PRÈS / … »
- App slide: « juste après le cours, je donne mes notes / à l'appli micabo pour me tester direct / pendant que c'est encore frais / ça me prend 2 min / et ça me montre direct ce que j'avais pas capté !! »
- Why it works: a moment of her routine, in her rhythm; the app shows what she missed.

### 2. micabo · « mes habitudes d'études toxiques dont je n'arrive pas à me débarrasser » (fr)
- Slide before: « il me faut ma note / TOUT DE SUITE. / pas par drama / (bon un peu) / … »
- App slide: « des fois je donne tous mes cours d'un coup / à l'appli micabo et je fais des quiz / en boucle jusqu'à battre mon dernier score / est-ce que c'est utile de faire / de la compétition avec soi-même ? / non. / mais au moins son IA me fait réviser / sur mes propres cours sans m'ennuyer »
- Why it works: a « toxic » habit like the others, self-mocking; the app is part of the joke.

### 3. micabo · « moi quand faut analyser des personnages en cours » (fr)
- Slide before: « moi quand on parle du contexte historique »
- App slide: « moi quand l'appli micabo me fait des quiz sur mes cours »
- Why it works: the meme format stays exactly the same.

### 4. UnSwipe · « how to reach your full potential this school year part 1 » (en)
- Slide before: « pay attention in class / you can talk with your friends during break, focus on the material, this way studying will go easier »
- App slide: « block short videos on your apps / you don't need to delete instagram to focus. the Unswipe app removes reels so you stay on track »
- Why it works: a school-year tip about focus; the app removes only the reels.

## Avoid in this label
- A fake quote naming the app in a quotes deck (« « réviser devient simple quand l'appli micabo transforme tes cours en quiz » »): nobody is quoted saying an app name.
- Sophia: never in this label.
$fiche$),

('medical_study', $fiche$# Label sheet: medical_study

> Apps: micabo (mostly) and UnSwipe. Med school, in French. The examples are real posts of ours, quoted as published (« / » is a line break). Adapt the idea, never copy the sentence, and name the app as the app sheet says.

## The deck
- Hooks: rankings (« Classement des spécialités en médecine de la meilleure à la pire (c'est décevant) », « Classement des lieux de stage à l'hôpital du meilleur au pire »), « Les faits les plus fous que j'ai appris en médecine », « Mon père chirurgien m'a conseillé pour réussir médecine ».
- Slides: in a ranking, a name, a rating (« 9/10 ») and a short, blunt description.

## Where the app goes
- In a ranking: inside one ranked item, after its rating and description, where studying or working comes up naturally. Never an extra item.
- In a facts list: one fact about memory or revising, then the app as the way to use it.

## Placement examples
### 1. « Classement des lieux de stage à l'hôpital du meilleur au pire (c'est décevant) » (fr)
- Slide before: « Salle de staff du matin / 11/10 / Le vrai bon plan de l'externat. Café gratuit, chaise confortable, … »
- App slide: « Garde de nuit calme / 9/10 / À partir de 2h, plus d'entrées, plus personne. / Tu as une salle entière pour toi et une lampe. / C'est le seul moment de la semaine où tu peux vraiment travailler. / Avec l'appli micabo tu importes ton cours en PDF et tu te testes sur les flashcards en dix min »
- Why it works: the ranked item stands on its own; the app is what you do in that quiet moment.

### 2. « Les faits les plus fous que j'ai appris en médecine: » (fr)
- Slide before: « 2 Ton cerveau "supprime" l'image de ton nez h24 pour éviter de te distraire. … »
- App slide: « 3 Une étude de Stanford a démontré que se tester régulièrement sur ses cours est le meilleur moyen de les mémoriser. l'appli micabo est fait pour ça : tu révises quand il faut, sans stress. »
- Why it works: a fact first (testing yourself beats rereading), the app applies it. Keep the fact verifiable: name a study only if it is real.

## Avoid in this label
- Repeating the rating of the slide before (a published deck had « Médecine générale / 6/10 » then an app slide « 6/10 / Le burn-out assuré. … »).
- Attacking other brands (« utilise pas des IA globales comme gemini ou claude »).
- Gluing the app to the end of a specialty with a forced link (« Pour avoir cette spé la plus dure, l'appli micabo est parfait pour planifier tes révisions »).
- Invented studies or figures.
$fiche$),

('white_bg', $fiche$# Label sheet: white_bg

> Apps: Sophia, and UnSwipe in variants. « Page blanche » decks (pod 1): black text on a white background, first person, in the @amayareading formats. The text is set on the image by the pod; the rules below come from pods/page-blanche.

## The deck
- First-person, confessional lines about phone habits, reading and self-improvement.
- A remake keeps the original layout: the app slide stays where it was.

## Where the app goes
- The app replaces the scroll on the phone. Three versions, alternated from one delivery to the next:
  - A, before / after, in the first person: « i used to doomscroll, now when i'm on my phone anyway i do a 5 min lesson on the Sophia app ».
  - B, today's lesson, concrete: « today's 5 min on the Sophia app was why the renaissance started in italy. better than 40 min of reels ».
  - C, one item among scroll replacements, never first: « what replaced my scrolling: a book on the nightstand, podcasts on walks, and the Sophia app when i grab my phone anyway ».
- UnSwipe variant: the slide talks about the scroll, and the app comes last.

## Avoid in this label
- « read a book AND use Sophia », « anything but your phone », « Sophia blocks your apps ».
$fiche$),

('Fathomly', $fiche$# Label sheet: Fathomly

> Apps: Sophia, plus UnSwipe as a second card when a step fits. Remakes of @fathom0g (pod 11), English first. The text is set on the image by the pod; the rules below come from pods/fathom.

## The deck
- White background, giant titles, lists « 5 Ways To… » and « 10/10 Skills… » with real YouTube video cards. The hook is kept word for word.

## Where the app goes
- Sophia is one native step in the middle of the list, as an app card (« SOPHIA » and one positioning line), like UnSwipe. Never the last slide.
- Card lines, alternated: « learn something new every day, / in 5 minutes. »; « 5 minutes a day / to know a bit about everything. »; « what I open / instead of scrolling. » (first-person tip, in second position).
- UnSwipe card (« UNSWIPE » and one or two lines) only on a step about the phone or scrolling. Never on a list of skills or videos to watch.

## Avoid in this label
- download, try, link in bio, free, the best app.
- Their images, mascot or screenshots.
- Anything UnSwipe doesn't do: no stats, no timer, no blocked phone, no figure. « Reels » is never translated.
$fiche$),

('mentalmaxxing', $fiche$# Label sheet: mentalmaxxing

> App: UnSwipe only. Remakes of @mentalapp tier lists (pod 6) and first-person carousels. The text is set on the image by the pod; the rules below come from pods/mentalapp.

## The deck
- « mentalmaxxing » tier lists (S+ down to D) and first-person carousels about attention and self-improvement.

## Where the app goes
- The UnSwipe element replaces their app: the dark « Mental » icon with « (check bio) », or their « BONUS tier » box.
- Its caption is fixed: « delete short-videos (UnSwipe app) », translated.
- If their app isn't in the post, it replaces a phone item (« low screen time », « no doomscrolling », « digital detox »).
- Place: first or last box of S+ in a tier list, or a first-person item in a carousel.

## Avoid in this label
- « Journey », « Mental », « check bio », « link in bio », any call to download.
- An unrelated item, or the cover.
$fiche$),

('that_girl_study', $fiche$# Label sheet: that_girl_study

> App: micabo only, in French. Remakes of @yasminespixels « that girl / studytok » posts (pod 10): yellow title, iPad of notes, iPhone. The text is set on the image by the pod; the rules below come from pods/yasmine.

## The deck
- Study routines and « things i do to smash every exam » notes, photos of desks and notebooks.

## Where the app goes
- micabo only takes the place of an app the original already shows: an app card (« productivity apps », instead of Goodnotes), a home screen (« organise my phone »).
- One micabo slide, never the cover.
- Versions: A, a first-person tip in the text, no image; B, micabo staged in a full photo of a step; C, micabo staged in half a collage, under a tip caption.
- The sentence is natural, from one student to another.

## Avoid in this label
- An iPhone with a screenshot pasted on a post that shows no app (« et pour réviser… », on a routine step): judged « pas fluide du tout » (23/10).
- « non sponsorisé », « pas une pub ».
- Screenshots with a notification or personal data; any call to download or « lien en bio ».
$fiche$)

) as f(cle, contenu);
