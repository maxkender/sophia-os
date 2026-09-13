-- Retire le label thématique UGC AI VIDEO « test ».
-- Réactions / utilisations : ON DELETE RESTRICT → on détache d’abord.
-- Posts UGC : ON DELETE SET NULL. hm_ugc_video_labels cascade.

update public.ugc_reactions r
set label_id = null
from public.labels l
where r.label_id = l.id
  and lower(trim(l.slug)) = 'test'
  and lower(trim(l.nom)) = 'test';

update public.ugc_utilisations u
set label_id = null
from public.labels l
where u.label_id = l.id
  and lower(trim(l.slug)) = 'test'
  and lower(trim(l.nom)) = 'test';

delete from public.labels
where lower(trim(slug)) = 'test'
  and lower(trim(nom)) = 'test';
