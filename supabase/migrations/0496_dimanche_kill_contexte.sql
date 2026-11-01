-- 0496 — Weekly decisions → Sunday : Kill, tout le contexte, lectures TikTok fiables.
--
-- 1. dimanche_kills : le Kill d'une recrue qui n'a jamais posté, décidé au
--    Validate de l'onglet dimanche, avec sa raison (stop / retrait / rien_fait /
--    autre + détail) et la milestone financée en jeu.
-- 2. dimanche_kill(poster, lundi, code, detail) (admin) : la raison, puis
--    l'arrêt existant (samedi_arreter_recrue : posteur et comptes désactivés,
--    aucun message, ligne « arrets » → « To remove from Slack » s'il y est ;
--    fermeture du contrat par la file des arrêts, selon arret_auto). Jamais
--    posté : la paie de la semaine le montre « annuler » (remboursement).
-- 3. warmup_verifs_main : « Checked OK by hand » (retire le risque).
-- 4. warmup_check_contexte(lundi) : pour chaque recrue de la cohorte : offre,
--    welcome (OS ou HM), étapes, relances, derniers messages (reçu et envoyé),
--    milestone, retrait (STOP ou message de retrait), lectures avec leur méthode
--    (page / Apify / les deux) et le statut selon la règle des 2 méthodes :
--    introuvable ou illisible par une seule méthode = « à vérifier », jamais « at risk ».
--
-- Additive : 2 tables, 4 fonctions. Aucune ligne supprimée.

create table if not exists public.dimanche_kills (
  poster_id uuid not null references public.profiles(id),
  lundi date not null,
  code text not null check (code in ('stop', 'retrait', 'rien_fait', 'autre')),
  detail text,
  montant numeric,
  decide_par uuid,
  decide_at timestamptz not null default now(),
  primary key (poster_id, lundi)
);
alter table public.dimanche_kills enable row level security;

create table if not exists public.warmup_verifs_main (
  poster_id uuid not null references public.profiles(id),
  lundi date not null,
  note text,
  par uuid,
  at timestamptz not null default now(),
  annule_at timestamptz,
  primary key (poster_id, lundi)
);
alter table public.warmup_verifs_main enable row level security;

-- La méthode d'une lecture (ckd_warmup_releves) : page TikTok, Apify, ou les deux (relevé de 18:00).
create or replace function public.releve_methode(p_erreur text)
returns text
language sql
immutable
as $$
  select case when p_erreur like 'méthode 2%' then 'apify'
              when p_erreur like 'page : %Apify%' then 'page+apify'
              else 'page' end;
$$;

create or replace function public.dimanche_kill(p_poster uuid, p_lundi date, p_code text, p_detail text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_montant numeric;
begin
  if not public.is_admin_strict() then
    raise exception 'dimanche_kill : réservé à l''admin' using errcode = '42501';
  end if;
  if p_code not in ('stop', 'retrait', 'rien_fait', 'autre') then
    raise exception 'raison obligatoire';
  end if;
  if p_code = 'autre' and coalesce(btrim(p_detail), '') = '' then
    raise exception 'raison « autre » : le détail est obligatoire';
  end if;
  if exists (select 1 from public.passages p join public.comptes c on c.id = p.compte_id
              where c.poster_id = p_poster and (p.publie_at is not null or p.publie_url is not null)) then
    raise exception 'cette recrue a déjà posté : son Kill se décide le samedi';
  end if;
  select nullif(regexp_replace(coalesce(m ->> 'depot', ''), '[^0-9.]', '', 'g'), '')::numeric into v_montant
    from public.profiles pr
    join public.upwork_jalons j on j.contrat_id = pr.upwork_contract_id,
         jsonb_array_elements(case when jsonb_typeof(j.jalons) = 'array' then j.jalons else '[]'::jsonb end) m
   where pr.id = p_poster and m ->> 'etat' in ('Active', 'Submitted')
   order by (m ->> 'sequence')::int nulls last
   limit 1;
  insert into public.dimanche_kills (poster_id, lundi, code, detail, montant, decide_par)
  values (p_poster, p_lundi, p_code, nullif(btrim(p_detail), ''), v_montant, auth.uid())
  on conflict (poster_id, lundi) do update
    set code = excluded.code, detail = excluded.detail, montant = excluded.montant, decide_par = excluded.decide_par, decide_at = now();
  perform public.samedi_arreter_recrue(p_poster);
  perform public.recrue_evenement_noter(p_poster, null, 'kill_dimanche', now(),
    'Sunday check: Kill (' || p_code || coalesce(' : ' || nullif(btrim(p_detail), ''), '') || ')', 'kill_dimanche:' || p_lundi::text);
end;
$$;
revoke all on function public.dimanche_kill(uuid, date, text, text) from public, anon;
grant execute on function public.dimanche_kill(uuid, date, text, text) to authenticated;

create or replace function public.warmup_ok_main(p_poster uuid, p_lundi date, p_note text default null, p_annuler boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'head_of_ops')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_annuler then
    update public.warmup_verifs_main set annule_at = now() where poster_id = p_poster and lundi = p_lundi;
    return;
  end if;
  insert into public.warmup_verifs_main (poster_id, lundi, note, par)
  values (p_poster, p_lundi, nullif(btrim(p_note), ''), auth.uid())
  on conflict (poster_id, lundi) do update set note = excluded.note, par = excluded.par, at = now(), annule_at = null;
end;
$$;
revoke all on function public.warmup_ok_main(uuid, date, text, boolean) from public, anon;
grant execute on function public.warmup_ok_main(uuid, date, text, boolean) to authenticated;

create or replace function public.warmup_check_contexte(p_lundi date)
returns table (poster_id uuid, statut text, ctx jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role'
          or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'head_of_ops')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with po as (
    select pr.* from public.profiles pr
     where pr.cohorte_lundi = p_lundi
       -- Tuée dimanche : toujours montrée (désactivée), avec son Kill.
       and (pr.is_active or exists (select 1 from public.dimanche_kills k where k.poster_id = pr.id and k.lundi = p_lundi))
       and exists (select 1 from public.user_roles ur where ur.user_id = pr.id and ur.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
  ),
  cpt as (
    select distinct on (c.poster_id) c.poster_id, c.id, c.handle_tiktok, c.warmup_started_at
      from public.comptes c
     where c.poster_id in (select id from po) and coalesce(c.type_compte, 'perso') = 'perso'
     order by c.poster_id, c.is_active desc, (c.warmup_started_at is not null) desc, c.created_at
  ),
  lec as (
    select cpt.poster_id,
           coalesce(jsonb_agg(jsonb_build_object('at', r.releve_at, 'methode', public.releve_methode(r.erreur), 'existe', r.existe,
                                                 'abonnements', r.abonnements, 'videos', r.videos, 'brut', r.erreur, 'handle', r.handle)
                              order by r.releve_at desc) filter (where r.releve_at is not null), '[]'::jsonb) as lectures
      from cpt
      left join lateral (select * from public.ckd_warmup_releves z where z.compte_id = cpt.id order by z.releve_at desc limit 6) r on true
     group by cpt.poster_id
  ),
  etat as (
    select cpt.poster_id,
           -- La dernière lecture lisible (le compte existe) : follows et posts.
           (select z.abonnements from public.ckd_warmup_releves z where z.compte_id = cpt.id and z.existe order by z.releve_at desc limit 1) as abonnements,
           (select z.videos from public.ckd_warmup_releves z where z.compte_id = cpt.id and z.existe order by z.releve_at desc limit 1) as videos,
           (select z.releve_at from public.ckd_warmup_releves z where z.compte_id = cpt.id and z.existe order by z.releve_at desc limit 1) as lisible_at,
           -- Introuvable confirmé : page ET Apify (même relevé), plus récent que la dernière lecture lisible.
           (select max(z.releve_at) from public.ckd_warmup_releves z
             where z.compte_id = cpt.id and z.existe is false and public.releve_methode(z.erreur) = 'page+apify') as introuvable_2m_at,
           (select max(z.releve_at) from public.ckd_warmup_releves z where z.compte_id = cpt.id and z.existe is false) as introuvable_at
      from cpt
  ),
  msg as (
    select po.id as poster_id,
           (select m from public.upwork_salons s, jsonb_array_elements(case when jsonb_typeof(s.messages) = 'array' then s.messages else '[]'::jsonb end) m
             where s.contrat_id = po.upwork_contract_id and m ->> 'de' <> 'nous' order by m ->> 'at' desc limit 1) as recu_upwork,
           (select m from public.upwork_salons s, jsonb_array_elements(case when jsonb_typeof(s.messages) = 'array' then s.messages else '[]'::jsonb end) m
             where s.contrat_id = po.upwork_contract_id and m ->> 'de' = 'nous' order by m ->> 'at' desc limit 1) as envoye_upwork,
           (select jsonb_build_object('at', sm.at, 'texte', left(sm.texte, 300)) from public.slack_messages sm
             where po.slack_user_id is not null and sm.slack_user = po.slack_user_id order by sm.at desc limit 1) as recu_slack
      from po
  )
  select po.id,
         case when exists (select 1 from public.warmup_verifs_main v where v.poster_id = po.id and v.lundi = p_lundi and v.annule_at is null) then 'ok_main'
              when cpt.id is null or cpt.warmup_started_at is null then 'report'
              when e.introuvable_2m_at is not null and (e.lisible_at is null or e.introuvable_2m_at > e.lisible_at) then 'risque'
              when e.lisible_at is not null and (coalesce(e.abonnements, 0) < 5 or coalesce(e.videos, 0) > 0) then 'risque'
              when e.lisible_at is not null then 'ok'
              else 'a_verifier' end,
         jsonb_build_object(
           'offre_acceptee_le', po.offre_acceptee_le,
           'contrat_id', po.upwork_contract_id,
           'actif', po.is_active,
           'welcome', (select jsonb_build_object('at', a.message_at, 'statut', a.statut,
                                                 'par', case when a.message_at is not null then 'os'
                                                             when a.statut = 'doublon' then 'hm' end)
                         from public.accueils a where a.poster_id = po.id or a.contrat_id = po.upwork_contract_id
                        order by a.message_at desc nulls last limit 1),
           'connecte_at', coalesce(po.premiere_connexion_at, (select u.last_sign_in_at from auth.users u where u.id = po.id)),
           'slack', po.slack_user_id is not null,
           'handle', cpt.handle_tiktok,
           'start_warmup', cpt.warmup_started_at,
           'abonnements', e.abonnements,
           'videos', e.videos,
           'lisible_at', e.lisible_at,
           'introuvable_at', e.introuvable_at,
           'introuvable_2m_at', e.introuvable_2m_at,
           'relances', (select jsonb_build_object('n', count(*), 'derniere_at', max(n.envoye_at),
                                                  'canal', (select array_to_string(n2.canaux, '+') from public.nudges n2
                                                             where n2.poster_id = po.id and n2.type = 'relance' and n2.envoye_at is not null
                                                             order by n2.envoye_at desc limit 1))
                          from public.nudges n where n.poster_id = po.id and n.type = 'relance' and n.envoye_at is not null),
           'recu', case when m.recu_slack is not null and (m.recu_upwork is null or (m.recu_slack ->> 'at') > (m.recu_upwork ->> 'at'))
                        then m.recu_slack || jsonb_build_object('canal', 'slack')
                        when m.recu_upwork is not null
                        then jsonb_build_object('at', m.recu_upwork ->> 'at', 'texte', left(m.recu_upwork ->> 'texte', 300), 'canal', 'upwork') end,
           'envoye', case when m.envoye_upwork is not null
                          then jsonb_build_object('at', m.envoye_upwork ->> 'at', 'texte', left(m.envoye_upwork ->> 'texte', 160), 'canal', 'upwork') end,
           'jalon', (select jsonb_build_object('nom', x ->> 'nom', 'depot', x ->> 'depot', 'etat', x ->> 'etat')
                       from public.upwork_jalons j,
                            jsonb_array_elements(case when jsonb_typeof(j.jalons) = 'array' then j.jalons else '[]'::jsonb end) x
                      where j.contrat_id = po.upwork_contract_id
                      order by (x ->> 'etat' in ('Active', 'Submitted')) desc, (x ->> 'sequence')::int nulls last limit 1),
           'retrait', coalesce(
             (select jsonb_build_object('source', d.source, 'texte', left(d.raison, 300), 'at', d.demande_at)
                from public.demandes_arret d where d.poster_id = po.id and d.decision is null order by d.demande_at desc limit 1),
             case when coalesce(m.recu_upwork ->> 'texte', '') ~* '(^\s*stop\s*$|withdraw|do not wish to (proceed|continue)|don''t wish to (proceed|continue)|not be able to work|won''t be able to work|no longer (interested|available)|cancel (the|my) contract|quit)'
                  then jsonb_build_object('source', 'upwork', 'texte', left(m.recu_upwork ->> 'texte', 300), 'at', m.recu_upwork ->> 'at') end),
           'verif_main', (select jsonb_build_object('at', v.at, 'note', v.note) from public.warmup_verifs_main v
                           where v.poster_id = po.id and v.lundi = p_lundi and v.annule_at is null),
           'kill', (select jsonb_build_object('code', k.code, 'detail', k.detail, 'at', k.decide_at, 'montant', k.montant)
                      from public.dimanche_kills k where k.poster_id = po.id and k.lundi = p_lundi),
           'lectures', coalesce(l.lectures, '[]'::jsonb)
         )
    from po
    left join cpt on cpt.poster_id = po.id
    left join etat e on e.poster_id = po.id
    left join lec l on l.poster_id = po.id
    left join msg m on m.poster_id = po.id;
end;
$$;
revoke all on function public.warmup_check_contexte(date) from public, anon;
grant execute on function public.warmup_check_contexte(date) to authenticated, service_role;

notify pgrst, 'reload schema';
