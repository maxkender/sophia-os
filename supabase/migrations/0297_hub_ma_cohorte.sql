-- 0297 : l'accueil de l'OS reconnaît la « cohorte Ruul ».
--
-- Les posters venus du site (Sophia Culture Hub, voir docs/hub-posteurs.md)
-- n'ont pas de HM : ils sont rattachés au profil « RUUL cohort », payés chaque
-- semaine par Ruul et suivis dans le salon Slack #ruul-cohort. Leur parcours
-- d'accueil remplace donc deux écrans (Slack, Payments), avec l'adresse email
-- à utiliser sur Ruul : celle de leur candidature, gardée dans
-- `hub_posteurs.email_perso`, que RLS réserve à l'admin.
--
-- `hub_ma_cohorte()` ne rend que la ligne du créateur connecté, rien d'autre.
-- Aucune ligne = poster recruté par un HM (accueil standard).
--
-- Le profil « RUUL cohort » lui-même est une donnée, pas du schéma : son id
-- vit dans le réglage `hub_posteurs` (`{"cohorte_ruul_id": "<uuid>"}`), lu
-- par la fonction hub-posteurs. Sans ce réglage, elle rattache au HM de la
-- zone, comme avant.
--
-- Retour arrière : `drop function public.hub_ma_cohorte();`

create or replace function public.hub_ma_cohorte()
returns table (cohorte_ruul boolean, email_ruul text)
language sql
stable
security definer
set search_path = public
as $$
  select true, h.email_perso
  from public.hub_posteurs h
  where h.profile_id = auth.uid()
    and h.statut = 'cree'
  limit 1;
$$;

revoke all on function public.hub_ma_cohorte() from public, anon;
grant execute on function public.hub_ma_cohorte() to authenticated;
