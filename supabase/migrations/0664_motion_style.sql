-- 0664 : Motion, plusieurs styles de vidéo (demande d'Adrien du 8/11).
--
-- « papier »     : papier découpé (le style d'origine, videos/suisse-guerre, videos/moyen-age).
-- « geographie » : vidéo explicative sur une vraie carte du monde (frontières Natural Earth),
--                  pilotée par le script (videos/geo-modele) : vols de caméra, pays surlignés,
--                  points, flèches, zones.
-- Le moteur lit `style` dans la tâche (fonction `motion`, action `prendre`) et choisit le modèle.
--
-- Additive. ✅ Appliquée le 2026-11-08 (MCP). Retour arrière : alter table public.motion_videos drop column style;

alter table public.motion_videos
  add column if not exists style text not null default 'papier';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'motion_videos_style_check') then
    alter table public.motion_videos
      add constraint motion_videos_style_check check (style in ('papier', 'geographie'));
  end if;
end $$;
