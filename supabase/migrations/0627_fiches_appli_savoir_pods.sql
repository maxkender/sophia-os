-- 0627 : fiches appli : ce que les pods savent de chaque appli (30/10).
--
-- Demande d'Adrien, après les fiches label (0626). Pour Sophia, micabo et
-- UnSwipe, une rubrique « Ce que les pods en savent » s'ajoute avant « Les
-- captures disponibles » : où l'appli entre, les phrases qui passent, les
-- tournures retirées et pourquoi, ce que les pods ne font jamais. Les règles
-- de la fiche ne changent pas : quand la pratique des pods les contredit (le
-- nom, « micro-learning », l'impératif, la 1re personne, « delete »), c'est
-- noté dans « À trancher » (créée pour micabo).
--
-- Chaque mise à jour ne s'applique que si la fiche n'a pas bougé depuis sa
-- lecture (md5). Le déclencheur `fiches_appli_versionner` garde la version
-- d'avant dans `fiches_appli_versions`.
-- Retour arrière : remettre la version précédente depuis fiches_appli_versions.

-- sophia
update public.fiches_appli f
set contenu = replace(
      replace(f.contenu, $t$## Les captures disponibles$t$,
              replace($t$## Ce que les pods en savent (lu le 30/10)
Les pods écrivent les originaux de 8 labels Sophia (pods/originaux, alpha-yellow, alpha-male, smart-girl, beau-smart-girl, rh, page-blanche, fathom). Ce qui revient chez tous :
- L'idée qui marche : avoir toujours quelque chose à raconter (une histoire, une référence, un sujet de conversation), en entretien, en soirée, avec son manager, en cours.
- Où l'appli entre : sur l'item de la liste qui parle d'apprendre ou de curiosité, souvent le dernier avant la slide de fin ; dans un post de vocabulaire, sur le mot qui s'y prête (« autodidact », « erudite », « cultivé ») ; dans un récit, comme ce que la personne fait à ce moment-là.
- Les formes qu'ils alternent : l'habitude à la 1re personne (« perso, j'ouvre… chaque matin ») ; l'avant / après (le scroll du soir remplacé par un cours) ; l'anecdote du jour, un fait vrai, vérifié sur une vraie page avant d'être écrit ; l'appli comme un item parmi d'autres remplaçants du scroll (« un livre sur la table de nuit, des podcasts en marchant, et… »), jamais en premier ; la carte d'appli au milieu d'une liste (pod 11).
- Les tournures usées, retirées le 26/10 : « a micro-learning app like the Sophia app makes it easy » (« trop usée », pod 2) et « 5 minutes d'histoire, d'art ou de sciences » comme phrase principale (« elle a servi sur presque toutes les livraisons du 19 au 25/10 », pod 7). Varier la phrase d'un deck à l'autre.
- Ce qu'ils ne font jamais : dire que l'appli est gratuite ; une promesse scientifique sur l'appli (la science porte sur l'habitude, pas sur l'appli) ; une personne réelle sur l'image de la slide d'appli ; « lis un livre ET utilise Sophia », « n'importe quoi sauf ton tel » (pod 1).$t$, E'\n', E'\r\n') || E'\r\n\r\n## Les captures disponibles'),
      E'\r\n\r\n## Sources',
      E'\r\n' || replace($t$- Le nom : les pods écrivent « the Sophia app », « l'appli Sophia », « die Sophia-App » (leurs règles l'imposent ; le pod 7 interdit « l'application Sophia » et « Sophia » seul), à l'inverse de « Comment la nommer ».
- « micro-learning » et l'impératif : la plupart des originaux anglais des pods disent « a micro-learning app like the Sophia app », et certains « use a micro-learning app… » (pod 9) ou « utilise l'appli Sophia… » (pod 5).
- L'APP BLOCKER : le pod 1 n'écrit jamais « Sophia bloque tes applis ».$t$, E'\n', E'\r\n') || E'\r\n\r\n## Sources')
where f.application_id = (select id from public.applications where slug = 'sophia')
  and md5(f.contenu) = '5c3464e753d56b06c3d1114f72407ca0';

-- micabo
update public.fiches_appli f
set contenu = replace(
      replace(f.contenu, $t$## Les captures disponibles$t$,
              replace($t$## Ce que les pods en savent (lu le 30/10)
Pods : clean-study (il laisse la place, l'OS y met micabo), yasmine (remakes @yasminespixels), beau-smart-girl (comptes micabo).
- Où l'appli entre : un item où l'on se teste sur ses cours, revoit ses notes ou prépare un examen (pod 12) ; toujours une étape d'étude (pod 10).
- Les phrases qui passent, d'élève à élève, à la 1re personne :
  - « teste-toi au lieu de relire.🧠 / relire ses fiches donne l’impression de savoir. moi, je mets mes cours dans micabo et je fais ses quiz : je vois tout de suite ce que je ne sais pas encore. » (pod 10)
  - « révise tôt🌸 / le bachotage de dernière minute, c’est le pire pour ta santé mentale. moi, je mets mes cours dans micabo et je fais 10 min de quiz par jour : rien ne s’empile. » (pod 10)
  - écrite par l'OS sur un post du pod 12 : « mets tes cours 10 minutes le soir dans une appli comme micabo pour te tester ».
- Retiré le 23/10 : l'iPhone avec une capture plaqué à la fin d'un post qui ne montre pas d'appli (« et pour réviser, / je mets mes notes dans micabo »), jugé « pas fluide du tout » par Adrien. micabo prend la place d'une appli que le post montre déjà, ou entre dans le texte d'un conseil.
- Jamais : « non sponsorisé », « pas une pub » ; une capture avec une notification ou une donnée perso ; une personne réelle ou un écran lisible sur l'image de la slide (pod 12) ; une légende qui ne tient qu'avec l'appli (« micabo >> »).$t$, E'\n', E'\r\n') || E'\r\n\r\n## Les captures disponibles'),
      E'\r\n\r\n## Sources',
      E'\r\n\r\n## À trancher\r\n' || replace($t$- Le nom : le pod 10 écrit « je mets mes cours dans micabo », sans le mot « appli » que demande « Comment la nommer ».$t$, E'\n', E'\r\n') || E'\r\n\r\n## Sources')
where f.application_id = (select id from public.applications where slug = 'micabo')
  and md5(f.contenu) = '6cd2bd8a610cc40d425fcfd78d6953af';

-- unswipe
update public.fiches_appli f
set contenu = replace(
      replace(f.contenu, $t$## Les captures disponibles$t$,
              replace($t$## Ce que les pods en savent (lu le 30/10)
Pods : mentalapp (pod 6, UnSwipe seul), page-blanche (variantes UnSwipe), fathom (carte UnSwipe), clean-study (l'OS y met UnSwipe), beau-smart-girl (comptes UnSwipe).
- Où l'appli entre : un item sur le téléphone, le scroll, les Reels ou la concentration (pod 12) ; une étape sur le scroll, les vidéos courtes, le temps d'écran, l'attention ou les réseaux, jamais plaquée sur une liste de compétences ou de vidéos à regarder (pod 11) ; la slide parle d'abord du scroll, l'appli vient en dernier (pod 1).
- Les phrases qui passent :
  - cartes du pod 11 : « keep Instagram, lose the Reels. / no need to delete anything. » ; « Instagram without the Reels. / messages and stories stay. »
  - écrite par l'OS sur un post du pod 12 : « je ne supprimerai jamais mes réseaux, mais UnSwipe enlève les Reels d'Instagram et me laisse les messages ».
  - pod 7 : « you don't have to delete your socials to fix it. / an app like Unswipe removes reels from instagram so you keep your chats without the endless feed. »
- Tier lists du pod 6 : l'élément UnSwipe remplace leur appli (l'icône « Mental », la case « BONUS tier ») ou un élément sur le téléphone (« low screen time », « no doomscrolling »), en tête ou en fin du S+.
- Jamais : « Journey », « Mental », « check bio », « lien en bio » ; le nom de l'appli dans la légende TikTok (pod 6) ; « En confession, l'autrice ne dit jamais qu'elle utilise l'appli » (pod 1).$t$, E'\n', E'\r\n') || E'\r\n\r\n## Les captures disponibles'),
      E'\r\n\r\n## Sources',
      E'\r\n' || replace($t$- La 1re personne, suite : le pod 6 la teste déjà dans ses carrousels (« My focus came back the week I deleted short videos with UnSwipe. Now one hour of work is actually one hour. »).
- L'ordre de suppression : la légende fixe du pod 6 est « delete short-videos (UnSwipe app) », alors que la fiche interdit « supprime les formats courts ».$t$, E'\n', E'\r\n') || E'\r\n\r\n## Sources')
where f.application_id = (select id from public.applications where slug = 'unswipe')
  and md5(f.contenu) = '7d1360c90c11402c4f1a079d1803e717';
