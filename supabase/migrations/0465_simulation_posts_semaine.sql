-- 0465 — Validate en Test : le remboursement selon les posts de la semaine.
--
-- samedi_simulation (0464) disait « payée lundi » pour un Kill & pay à 0 post :
-- la semaine est alors à 0 $, rien n'est payé et la milestone financée est à
-- rembourser. La ligne donne maintenant le nombre de posts avec lien de la semaine.
--
-- Fonction remplacée à l'identique, sauf ce calcul. Aucune donnée modifiée.

create or replace function public.samedi_simulation(p_lundi date, p_kills jsonb)
returns table (poster_id uuid, nom text, choix text, desactivation text, slack text, fermeture text, remboursement text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_mode text := coalesce((select valeur #>> '{}' from public.reglages where cle = 'arret_auto'), 'off');
  v_test_ok boolean := coalesce((select a.erreur is null and (a.reponse #>> '{bilan,contrat_ferme}') = 'true'
                                   from public.upwork_appels a where a.action = 'test_fermeture_bilan'
                                  order by a.at desc limit 1), false);
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with k as (
    select (e ->> 'poster_id')::uuid as poster_id, nullif(e ->> 'compte_id', '')::uuid as compte_id, coalesce(e ->> 'choix', 'kill') as choix
      from jsonb_array_elements(coalesce(p_kills, '[]'::jsonb)) e
  ),
  p as (
    select k.poster_id, max(k.choix) filter (where k.choix = 'kill_np') as np,
           array_agg(k.compte_id) filter (where k.compte_id is not null) as comptes
      from k group by k.poster_id
  ),
  d as (
    select p.poster_id, pr.prenom, pr.nom, pr.slack_user_id, pr.upwork_contract_id as contrat, p.np, p.comptes,
           (select string_agg('@' || coalesce(c.handle_tiktok, '?'), ', ') from public.comptes c where c.id = any (coalesce(p.comptes, '{}'))) as tues,
           (select string_agg('@' || coalesce(c.handle_tiktok, '?'), ', ') from public.comptes c
             where c.poster_id = p.poster_id and c.is_active and c.type_compte = 'perso'
               and not (c.id = any (coalesce(p.comptes, '{}')))) as restants,
           exists (select 1 from public.passages pa join public.comptes c on c.id = pa.compte_id
                    where c.poster_id = p.poster_id and (pa.publie_at is not null or pa.publie_url is not null)) as a_poste,
           (select count(*) from public.passages pa join public.comptes c on c.id = pa.compte_id
             where c.poster_id = p.poster_id and pa.publie_url is not null
               and pa.date_publication_prevue between p_lundi and p_lundi + 6)::int as posts_semaine,
           exists (select 1 from public.profiles o where o.id <> p.poster_id and o.is_active
                    and o.upwork_contract_id = pr.upwork_contract_id) as partage,
           (select string_agg(format('%s (%s $)', m ->> 'nom', m ->> 'depot'), ', ')
              from public.upwork_jalons j,
                   jsonb_array_elements(case when jsonb_typeof(j.jalons) = 'array' then j.jalons else '[]'::jsonb end) m
             where j.contrat_id = pr.upwork_contract_id and m ->> 'etat' in ('Active', 'Submitted', 'Rejected')) as finances
      from p join public.profiles pr on pr.id = p.poster_id
  )
  select d.poster_id, nullif(btrim(concat_ws(' ', d.prenom, d.nom)), ''),
         case when d.np is not null then 'kill_np' else 'kill' end,
         case when d.restants is not null then format('%s deactivated; poster stays active (%s still active)', coalesce(d.tues, 'account'), d.restants)
              else format('%s deactivated; poster deactivated in the OS', coalesce(d.tues, 'no account')) end,
         case when d.restants is not null then 'no change (poster stays active)'
              when d.slack_user_id is not null then 'added to "To remove from Slack" (Logs & to do), right away'
              else 'no Slack account linked' end,
         case when d.restants is not null then 'no closure (another account stays active)'
              when d.contrat is null then 'no Upwork contract linked: nothing to close'
              when d.partage then 'contract shared with another active profile: not closed'
              when v_mode <> 'on' then format('Monday after payroll: contract %s would be closed through the API (Full stop is %s: simulated only)', d.contrat, v_mode)
              when not v_test_ok then format('Monday: contract %s NOT closed — the contract-closing test has not passed yet', d.contrat)
              else format('Monday after payroll: contract %s closed through the API, no message', d.contrat) end,
         case when d.restants is not null or d.contrat is null then '—'
              when d.finances is null then 'nothing funded'
              when d.np is not null then format('Kill & don''t pay: refund to ask in the payroll list (%s)', d.finances)
              when not d.a_poste then format('never posted: refund to ask in the payroll list (%s)', d.finances)
              when d.posts_semaine = 0 then format('0 post with link this week: nothing paid Monday; refund to ask in the payroll list (%s)', d.finances)
              else format('Kill & pay: this week paid Monday (%s post(s) with link) from %s; anything else funded: refund', d.posts_semaine, d.finances) end
    from d
   order by 2;
end;
$$;
revoke all on function public.samedi_simulation(date, jsonb) from public, anon;
grant execute on function public.samedi_simulation(date, jsonb) to authenticated;

notify pgrst, 'reload schema';
