-- 0271 : écart minimum avant qu'un même post repasse sur le même compte.
--
-- Constat qui a motivé la règle, sur un compte néerlandais : 28 posts reçus en
-- 14 jours, 21 decks distincts, donc 7 répétitions à l'identique (mêmes images
-- ET même texte), dont une à un seul jour d'intervalle. Réseau entier sur 60
-- jours : 301 répétitions sur un même compte, dont 30 à moins de 3 jours.
--
-- La cause n'était pas un bug mais un trou dans la règle de tirage. Un contenu
-- déjà posté par le compte était seulement RÉTROGRADÉ d'une bande
-- (`bandesDeTirage`), sans qu'on regarde jamais depuis quand. Le seul
-- garde-fou daté (`ECART_MIN_JOURS_AUTRE_APPLICATION`, 7 jours) ne valait
-- qu'entre applications DIFFÉRENTES : à l'intérieur d'une même application,
-- aucun délai. Les langues à petit vivier (5 comptes en nl, 9 en pl) épuisaient
-- leur bande de contenus frais et retombaient sur du déjà vu dès le lendemain.
--
-- Le code lit `tierlist.ecart_min_meme_contenu` (défaut 14 dans
-- `chargerAssignationReglages`, donc cette ligne ne fait que rendre le réglage
-- visible et modifiable depuis Réglages > Assignation). Ce n'est PAS une
-- exclusion : le contenu trop récent part dans les deux dernières bandes de
-- tirage et reste servi si le compte n'a rien d'autre. Un doublon espacé vaut
-- mieux qu'un créneau vide, et aucun quota ne baisse à cause de cette règle.
-- 0 désactive.
--
-- Additive et idempotente : fusionne la clé dans le jsonb existant.

-- La ligne `tierlist` existe depuis longtemps ; l'insert n'est là que pour une
-- base neuve. Le `not (valeur ? …)` garantit qu'un rejeu ne réécrase JAMAIS une
-- valeur réglée à la main depuis l'interface.

insert into public.reglages (cle, valeur)
values ('tierlist', jsonb_build_object('ecart_min_meme_contenu', 14))
on conflict (cle) do nothing;

update public.reglages
   set valeur = valeur || jsonb_build_object('ecart_min_meme_contenu', 14)
 where cle = 'tierlist'
   and not (valeur ? 'ecart_min_meme_contenu');
