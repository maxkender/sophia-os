-- 0793 : Comment Masters dans toutes les langues (Max, 20/11). Additif.
-- Les régions manquantes (lt, lv, ja, da), inactives tant qu'elles n'ont pas de Comment Master.
insert into public.comment_master_regions (langue, region, comment_master, actif)
values ('lt', 'Lithuania', null, false),
       ('lv', 'Latvia', null, false),
       ('ja', 'Japan', null, false),
       ('da', 'Denmark', null, false)
on conflict (langue) do nothing;
