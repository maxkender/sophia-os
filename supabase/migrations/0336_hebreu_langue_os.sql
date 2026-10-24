-- 0336 : l'hébreu devient une langue de l'OS à part entière.
--
-- POURQUOI. `he` est dans `LANGUES_CIBLES` depuis longtemps et tout le moteur
-- sait le servir : nom, drapeau, pays (Israël), sens d'écriture RTL, jeu de
-- hashtags des deux côtés (front et Edge), la table `LANGUES` de `gemini.ts`
-- qui nomme la langue au modèle, et le prompt `traduction_he` en base. La
-- seule chose qui manquait, c'est la couche comment masters : 0321 a semé une
-- région pour 24 langues en reprenant les deux du test (de, it), et l'hébreu
-- n'y était pas. Israël y est traité comme un pays ARABOPHONE — la ligne
-- ('ar', 'IL') — ce que dit l'en-tête de 0321 : « `ar` les Émirats comme
-- Israël ». C'est ce raccourci qui faisait qu'un créateur israélien se
-- rangeait sous `ar` faute de mieux.
--
-- CE QUE ÇA CHANGE. Une région `he` et un seuil pour IL en hébreu. Rien
-- d'autre : la région naît INACTIVE, comme les 24 de 0321, parce que la
-- contrainte `comment_master_regions_actif_complet` exige un comment master ET
-- un canal Slack vérifié pour l'allumer. Elle s'allumera depuis l'écran
-- Comment masters quand les deux existeront.
--
-- ('ar', 'IL') RESTE. La clé de `comment_master_pays` est (langue, pays), les
-- deux lignes coexistent, et c'est voulu : le compte israélien déjà en base
-- publie en arabe et garde son seuil. Un post est rangé par la langue DU
-- COMPTE, pas par le pays seul.
--
-- CE QUI N'EST PAS ICI. Le choix d'application. Sophia sert déjà l'hébreu :
-- depuis le 21/10 les trois applications ont `applications.langues` à NULL,
-- c'est-à-dire toutes les langues, et Sophia ne se restreint jamais par
-- construction. Sur le marché he/IL, vide, Sainte-Laguë donne 70 à Sophia
-- contre 20 à Micabo et 10 à Unswipe : le premier créateur hébréophone part
-- sur Sophia sans qu'on ait rien à poser.
--
-- Idempotente : `on conflict do nothing` des deux côtés, elle peut passer deux
-- fois sans rien casser.
--
-- Retour arrière :
--   delete from public.comment_master_pays where langue = 'he';
--   delete from public.comment_master_regions where langue = 'he';

set lock_timeout = '10s';

-- Région hébreu. Inactive : pas de comment master ni de canal Slack encore.
insert into public.comment_master_regions (langue, region, actif) values
  ('he', 'Israel', false)
on conflict (langue) do nothing;

-- Seuil de vues d'Israël en hébreu. `provisoire` comme tout marché qu'on
-- n'a pas encore mesuré : le recalibrage du lundi (fonction `comment-masters`,
-- cible ~1 post sur 20) l'ajustera, tant que personne ne met le cadenas.
insert into public.comment_master_pays (langue, pays, seuil_vues, seuil_source) values
  ('he', 'IL', 5000, 'provisoire')
on conflict (langue, pays) do nothing;
