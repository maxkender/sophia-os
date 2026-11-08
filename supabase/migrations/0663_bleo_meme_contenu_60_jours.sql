-- 0663 : jamais le même post sur un même compte à moins de 60 jours (Adrien, 7/11).
--
-- BLEO interdisait le même contenu sur un compte à moins de `garde_fous.meme_contenu_jours`
-- (14) jours, et le ressert juste après : 9 à 17 reposts du propre post d'un compte par
-- jour depuis la bascule (2 à 3 % des posts, écart médian 16 à 21 jours), contre 3 à 8
-- avant. Signalé par le chef pour page blanche (clara.grandit369 et paul.drive237, 6/11).
-- La limite passe à 60 jours pour le tirage, les remplaçants de la journée et le rapport
-- de 22 h (ils la lisent dans le réglage), et pour la tierlist de secours
-- (`tierlist.ecart_min_meme_contenu`). Les rappels J+7 des posts à 50 000 vues gardent
-- leur règle à part (D39 abandonnée le 4/11).
--
-- Retour arrière : remettre 14 dans les deux réglages.

update public.reglages
   set valeur = jsonb_set(valeur, '{garde_fous,meme_contenu_jours}', '60'::jsonb)
 where cle = 'bleo';

update public.reglages
   set valeur = jsonb_set(valeur, '{ecart_min_meme_contenu}', '60'::jsonb)
 where cle = 'tierlist' and valeur ? 'ecart_min_meme_contenu';
