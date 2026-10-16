-- 0286 : index sur post_slides.media_id — appliqué à la main le 16/10/2026.
--
-- Les règles RLS de media_library (`media_select_slides`, `media_select_hiring`)
-- vérifient, pour CHAQUE image lue, qu'elle figure dans un slide d'un post du
-- poster : `exists (select 1 from post_slides ps … where ps.media_id = media_library.id …)`.
-- Sans index sur media_id, Postgres reconstruisait à chaque image la liste de
-- tous les slides du poster. Aux heures de pointe, ces lectures dépassaient le
-- statement timeout (14/10 21h-23h, 15/10 19h-19h45, heure de Paris) : pages
-- poster bloquées sur « Chargement… », « Preparing the photos… », 504.
--
-- Mesure (EXPLAIN ANALYZE en poster, post de 7 slides) : 603 ms → 109 ms.
--
-- Créé hors transaction (`concurrently`) pour ne pas bloquer les écritures.
-- Retour arrière : `drop index concurrently public.post_slides_media_id_idx;`

create index concurrently if not exists post_slides_media_id_idx on public.post_slides (media_id);
