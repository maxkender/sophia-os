-- 0441 — Prompt 25 v4, partie 5 : la page « Onboarding posters » et Posters.
--
-- - onboarding_posteurs() : une ligne par recrue (le 1er compte, comme les
--   relances : etapes_recrues_v2), avec sa HM, son pays, sa cohorte, son
--   contrat Upwork, son e-mail de connexion, Slack ou pas, chaque étape et sa
--   date (0 Slack, 1 connexion, 2 compte TikTok vu, 3 Start warmup, 4 warm-up
--   fait), tous les messages envoyés (date, canal, texte, statut, réponse), la
--   prochaine relance prévue, et si c'est un posteur de test (0440).
-- - posteurs_ayant_poste() : les posteurs qui ont publié au moins un post avec
--   lien (Posters ne montre que ceux-là ; les autres sont sur Onboarding).
--
-- Additive : 2 fonctions en lecture seule.

create or replace function public.onboarding_posteurs()
returns table (
  poster_id      uuid,
  nom            text,
  hm_id          uuid,
  hm_nom         text,
  pays           text,
  cohorte_lundi  date,
  contrat_id     text,
  contrat_url    text,
  email          text,
  slack          boolean,
  handle         text,
  bienvenue_at   timestamptz,
  connexion_at   timestamptz,
  tiktok_at      timestamptz,
  warmup_at      timestamptz,
  pret           boolean,
  pret_at        timestamptz,
  abonnements    integer,
  repondu_at     timestamptz,
  messages       jsonb,
  prochaine      jsonb,
  test           boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (public.is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'onboarding_posteurs : réservé à l''admin et au Head of Ops' using errcode = '42501';
  end if;
  return query
  select e.poster_id,
         nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''),
         pr.manager_id,
         nullif(btrim(concat_ws(' ', hm.prenom, hm.nom)), ''),
         e.pays, e.cohorte_lundi, pr.upwork_contract_id, pr.upwork_contrat_url, pr.email,
         pr.slack_user_id is not null, e.handle,
         e.bienvenue_at, e.premiere_connexion_at, e.tiktok_vu_at, e.warmup_started_at, coalesce(e.pret, false),
         (select min(w.releve_at) from public.ckd_warmup_releves w
           where w.compte_id = e.compte_id and w.existe and coalesce(w.abonnements, 0) >= 5
             and (e.warmup_started_at is null or w.releve_at >= e.warmup_started_at)),
         e.abonnements, e.repondu_at,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', n.id, 'type', n.type, 'at', n.envoye_at, 'canal', n.canal, 'canaux', n.canaux, 'texte', n.texte,
                     'statut', case when n.slack_erreur is not null then 'erreur' else 'envoye' end,
                     'erreur', coalesce(n.slack_erreur, n.erreur_canal),
                     'reponse', (select jsonb_build_object('at', r.recu_at, 'canal', r.canal, 'texte', left(r.texte, 300))
                                   from public.posteur_reponses r
                                  where r.poster_id = n.poster_id and r.recu_at >= n.envoye_at
                                  order by r.recu_at limit 1))
                     order by n.envoye_at desc)
                     from public.nudges n
                    where n.poster_id = e.poster_id and n.envoye_at > now() - interval '45 days'), '[]'::jsonb),
         (select jsonb_build_object('type', v.type, 'periode', v.periode, 'canal', v.canal, 'texte', v.texte, 'raison', v.raison,
                                    'valide', v.valide_at is not null)
            from public.relances_prevues v
           where v.poster_id = e.poster_id and v.statut = 'prevu'
           order by v.periode, v.premier_at limit 1),
         exists (select 1 from public.contrats_test t where t.poster_id = e.poster_id and t.retire_at is null)
    from public.etapes_recrues_v2() e
    join public.profiles pr on pr.id = e.poster_id
    left join public.profiles hm on hm.id = pr.manager_id
   where not coalesce(e.deuxieme, false);
end;
$$;
revoke all on function public.onboarding_posteurs() from public, anon;
grant execute on function public.onboarding_posteurs() to authenticated, service_role;

create or replace function public.posteurs_ayant_poste()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct c.poster_id
    from public.passages pa
    join public.comptes c on c.id = pa.compte_id
   where pa.publie_url is not null
     and public.is_admin();
$$;
revoke all on function public.posteurs_ayant_poste() from public, anon;
grant execute on function public.posteurs_ayant_poste() to authenticated;

notify pgrst, 'reload schema';
