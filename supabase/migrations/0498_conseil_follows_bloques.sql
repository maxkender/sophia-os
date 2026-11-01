-- 0498 : TikTok bloque les follows des comptes neufs (remonté par une recrue le 1er nov.).
-- Le conseil (même texte que la FAQ « tiktok_follow_bloque » de 0497), modifiable
-- dans Settings > textes aux posteurs (groupe « debut »). Montré quand le compte
-- reste à 0 follow plus de 24 h après Start warmup : dans le pop-up Start Tuesday /
-- Postpone (mon_debut le rend déjà avec les autres debut_popup_*) et à l'étape 4 du
-- dashboard (mes_textes_debut ci-dessous). Additif : un réglage et une fonction.

insert into public.reglages (cle, valeur, updated_at) values
  ('debut_popup_follows_bloque', to_jsonb('TikTok sometimes limits new accounts. Fill in your profile (photo, name, birthday), verify your phone in TikTok settings, watch videos on the For You page for 10–15 minutes, then follow accounts one by one (not too fast). If it still doesn''t work, wait a few hours and try again, then tell us in #questions.'::text), now())
on conflict (cle) do nothing;

-- Les textes debut_popup_* pour le posteur connecté (le dashboard en a besoin même sans Start Tuesday).
create or replace function public.mes_textes_debut()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(g.cle, g.valeur #>> '{}'), '{}'::jsonb)
    from public.reglages g
   where g.cle like 'debut_popup_%' and auth.uid() is not null;
$$;
revoke all on function public.mes_textes_debut() from public, anon;
grant execute on function public.mes_textes_debut() to authenticated;

notify pgrst, 'reload schema';
