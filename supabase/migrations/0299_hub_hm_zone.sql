-- 0299 : la zone des posters de la cohorte Ruul.
--
-- Les posters venus du site sont rattachés au profil « RUUL cohort », qui n'a
-- pas de zone : la page Posters les rangeait donc dans « Sans zone ». Ils
-- relèvent pourtant de la zone de leur pays, celle du HM qui a ouvert ce pays
-- (sans en être le HM). `hub-posteurs` retient désormais ce HM à la création
-- (`hm_zone_id`), et la page range le poster dans la zone de ce HM, sous un
-- bloc « RUUL cohort ».
--
-- Rattrapage : les posters déjà créés reçoivent le HM dont la zone porte
-- exactement le nom de leur pays (seule la France est concernée au 17/10).
--
-- Retour arrière : `alter table public.hub_posteurs drop column hm_zone_id;`

alter table public.hub_posteurs
  add column if not exists hm_zone_id uuid references public.profiles(id) on delete set null;

update public.hub_posteurs h
set hm_zone_id = p.id
from public.profiles p
join public.user_roles r on r.user_id = p.id and r.role = 'hiring_manager'
where h.hm_zone_id is null
  and h.statut = 'cree'
  and h.pays_code = 'FR'
  and lower(btrim(p.zone_recrutement)) = 'france'
  and p.is_active;
