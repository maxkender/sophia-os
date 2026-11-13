-- 0666 : UGC IA — langue des démos et nettoyage final des vidéos.
--
-- Une démo est dans une langue (celle de l'appli à l'écran) ; la vidéo
-- complète prend celle de sa démo, pour l'envoyer à un compte de la même
-- langue. Après le réencodage, la fonction `ugc-ia` nettoie le MP4 (balises,
-- XMP, Content Credentials C2PA) et vérifie qu'il n'en reste rien : le
-- rapport est gardé dans `nettoyage`.
--
-- ✅ Appliquée le 2026-11-09 (MCP) : langue (défaut en) et nettoyage sur les
-- démos, langue et nettoyage sur les vidéos complètes.

alter table public.ugc_ia_demos
  add column if not exists langue text not null default 'en',
  add column if not exists nettoyage jsonb;

alter table public.ugc_ia_assemblages
  add column if not exists langue text,
  add column if not exists nettoyage jsonb;

comment on column public.ugc_ia_demos.langue is 'UGC IA (0666) : langue de la démo (celle de l''appli à l''écran).';
comment on column public.ugc_ia_assemblages.langue is 'UGC IA (0666) : langue de la vidéo complète, celle de sa démo.';
comment on column public.ugc_ia_demos.nettoyage is 'UGC IA (0666) : rapport du nettoyage final du MP4 { retires, verifie, taille }.';
comment on column public.ugc_ia_assemblages.nettoyage is 'UGC IA (0666) : rapport du nettoyage final du MP4 { retires, verifie, taille }.';
