-- 0451 — Prompt 26 : la paie automatique (remplace le prompt 23).
--
-- 1. Les règles
--    - Plus de « moins de 6 posts = Kill » : paie_calculer_v3 ne lit plus
--      paie_kill6_des (le réglage reste, il ne sert plus). Tarif plein dès 1 post
--      avec lien, aucune retenue ; le nombre de posts reste une info du samedi.
--    - Pause (malade, absent) : semaine payée au tarif plein ET semaine suivante
--      financée (avant : « à voir »).
--    - 0 post, gardé le samedi : rien n'est payé ni financé ; la milestone déjà
--      financée sert la semaine suivante : l'OS la renomme (suivante « renommer »).
-- 2. Le Kill du samedi : « Kill & pay » (par défaut, comme avant) ou « Kill &
--    don't pay » (paie_kills_sans_paie, raison obligatoire) : rien n'est
--    approuvé, rien de financé, le contrat est fermé lundi (semaine à 0 $ :
--    Upwork envoie la demande de remboursement de la milestone financée).
-- 3. Les milestones soumises depuis plus de 7 jours (Upwork les paie seul à
--    14 jours) : jalons_soumis, Needs you « jalon_soumis: ».
-- 4. paie_simulations : la simulation d'une paie (rien n'est payé).
-- 5. samedi_fiche() : tout ce qu'il faut pour décider un Kill.

-- 1a. Plus de Kill sous les 6 posts.
do $p$
declare
  v_def text := pg_get_functiondef('public.paie_calculer_v3(date)'::regprocedure);
  v_avant text := $q$p_lundi >= (r->>'kill6_des')::date as kill6$q$;
begin
  if position(v_avant in v_def) = 0 then raise exception '0451 : kill6 introuvable dans paie_calculer_v3'; end if;
  execute replace(v_def, v_avant, 'false as kill6');
end;
$p$;

-- 2. Kill & don't pay.
create table if not exists public.paie_kills_sans_paie (
  poster_id uuid not null,
  semaine date not null,
  raison text not null check (btrim(raison) <> ''),
  montant numeric,
  decide_par uuid,
  decide_at timestamptz not null default now(),
  annule_at timestamptz,
  primary key (poster_id, semaine)
);
alter table public.paie_kills_sans_paie enable row level security;
drop policy if exists paie_kills_sans_paie_admin on public.paie_kills_sans_paie;
create policy paie_kills_sans_paie_admin on public.paie_kills_sans_paie
  for select to authenticated using (public.is_admin());
comment on table public.paie_kills_sans_paie is
  '0451 : « Kill & don''t pay » du samedi : rien n''est approuvé, le contrat est fermé lundi ; la raison va dans Disputes si le freelance conteste.';

create or replace function public.kill_sans_paie_noter(p_poster uuid, p_semaine date, p_raison text, p_montant numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'kill_sans_paie_noter : réservé à l''admin';
  end if;
  if coalesce(btrim(p_raison), '') = '' then raise exception 'raison obligatoire'; end if;
  if extract(isodow from p_semaine) <> 1 then raise exception 'semaine : un lundi attendu'; end if;
  insert into public.paie_kills_sans_paie (poster_id, semaine, raison, montant, decide_par)
  values (p_poster, p_semaine, btrim(p_raison), p_montant, auth.uid())
  on conflict (poster_id, semaine) do update
     set raison = excluded.raison, montant = excluded.montant, decide_par = excluded.decide_par,
         decide_at = now(), annule_at = null;
end;
$$;
revoke all on function public.kill_sans_paie_noter(uuid, date, text, numeric) from public, anon;
grant execute on function public.kill_sans_paie_noter(uuid, date, text, numeric) to authenticated;

-- La liste de paie : un Kill & don't pay ne paie rien.
do $p$
declare
  v_def text := pg_get_functiondef('public.paie_liste_v2(date,boolean)'::regprocedure);
  v_a1 text := $q$case when c.poster_id in (select a.poster_id from arretes a where a.jamais_poste) then 'annuler'$q$;
  v_n1 text := $q$case when c.poster_id in (select k.poster_id from public.paie_kills_sans_paie k
                                         where k.semaine = p_lundi and k.annule_at is null)
                     and (c.action = 'kill' or c.poster_id in (select a.poster_id from arretes a where not a.jamais_poste)) then 'kill_sans_paie'
                when c.poster_id in (select a.poster_id from arretes a where a.jamais_poste) then 'annuler'$q$;
  v_a2 text := $q$case when a.jamais_poste then 'annuler' else 'kill' end, '[]'::jsonb,$q$;
  v_n2 text := $q$case when a.jamais_poste then 'annuler'
                when exists (select 1 from public.paie_kills_sans_paie k
                              where k.poster_id = a.poster_id and k.semaine = p_lundi and k.annule_at is null) then 'kill_sans_paie'
                else 'kill' end, '[]'::jsonb,$q$;
begin
  if position(v_a1 in v_def) = 0 or position(v_a2 in v_def) = 0 then raise exception '0451 : paie_liste_v2 ne correspond pas'; end if;
  execute replace(replace(v_def, v_a1, v_n1), v_a2, v_n2);
end;
$p$;

-- La semaine suivante : rien après un Kill & don't pay ; une pause est financée ;
-- 0 post et gardé : on renomme la milestone déjà financée.
do $p$
declare
  v_def text := pg_get_functiondef('public.paie_suivante_calc(date,jsonb)'::regprocedure);
  r text;
begin
  r := v_def;
  if position($q$when e.action_paie = 'kill' then 'ne_pas_financer'$q$ in r) = 0
     or position($q$when e.action_paie = 'kill' then 'kill'$q$ in r) = 0
     or position($q$when e.n_suiv = 0 and e.kill then 'ne_pas_financer'$q$ in r) = 0
     or position($q$when e.n_suiv = 0 and e.kill then 'kill'$q$ in r) = 0
     or position($q$when e.n_suiv = 1 and (e.faits > 0 or e.prevus = 0) then 'financer'$q$ in r) = 0
     or position($q$when e.recree or e.n_suiv >= 1 and (e.faits > 0 or e.prevus = 0) then null$q$ in r) = 0 then
    raise exception '0451 : paie_suivante_calc ne correspond pas';
  end if;
  r := replace(r, $q$when e.action_paie = 'kill' then 'ne_pas_financer'$q$,
                  $q$when e.action_paie in ('kill', 'kill_sans_paie') then 'ne_pas_financer'$q$);
  r := replace(r, $q$when e.action_paie = 'kill' then 'kill'$q$,
                  $q$when e.action_paie in ('kill', 'kill_sans_paie') then 'kill'$q$);
  r := replace(r, $q$when e.n_suiv = 0 and e.kill then 'ne_pas_financer'$q$,
                  $q$when e.n_suiv = 0 and e.kill then 'ne_pas_financer'
             when e.action_paie = 'rien' and e.faits = 0 and e.prevus > 0 then 'renommer'$q$);
  r := replace(r, $q$when e.n_suiv = 0 and e.kill then 'kill'$q$,
                  $q$when e.n_suiv = 0 and e.kill then 'kill'
             when e.action_paie = 'rien' and e.faits = 0 and e.prevus > 0 then 'zero_post_garde'$q$);
  r := replace(r, $q$when e.n_suiv = 1 and (e.faits > 0 or e.prevus = 0) then 'financer'$q$,
                  $q$when e.n_suiv = 1 and (e.faits > 0 or e.prevus = 0 or e.action_paie in ('payer', 'modifier')) then 'financer'$q$);
  r := replace(r, $q$when e.recree or e.n_suiv >= 1 and (e.faits > 0 or e.prevus = 0) then null$q$,
                  $q$when e.recree or e.n_suiv >= 1 and (e.faits > 0 or e.prevus = 0 or e.action_paie in ('payer', 'modifier')) then null$q$);
  execute r;
end;
$p$;

-- La fin de contrat d'un Kill & don't pay : semaine à 0 $ (le contrat se ferme
-- même avec une milestone financée : Upwork demande le remboursement).
do $p$
declare
  v_def text := pg_get_functiondef('public.arrets_fins_a_faire()'::regprocedure);
  v_a1 text := $q$select a.id, a.poster_id, pr.upwork_contract_id, a.w,
         (select coalesce(s.montant_corrige, s.montant)$q$;
  v_n1 text := $q$select a.id, a.poster_id, pr.upwork_contract_id, a.w,
         case when exists (select 1 from public.paie_kills_sans_paie k
                            where k.poster_id = a.poster_id and k.semaine = a.w and k.annule_at is null) then 0::numeric
              else (select coalesce(s.montant_corrige, s.montant)$q$;
  v_a2 text := $q$order by s.calcule_at desc nulls last limit 1),$q$;
  v_n2 text := $q$order by s.calcule_at desc nulls last limit 1) end,$q$;
begin
  if position(v_a1 in v_def) = 0 or position(v_a2 in v_def) = 0 then raise exception '0451 : arrets_fins_a_faire ne correspond pas'; end if;
  execute replace(replace(v_def, v_a1, v_n1), v_a2, v_n2);
end;
$p$;

-- 3. Les milestones soumises : vues par l'OS à chaque lecture des contrats.
create table if not exists public.jalons_soumis (
  jalon_id text primary key,
  contrat_id text not null,
  nom text,
  montant numeric,
  vu_at timestamptz not null default now()
);
alter table public.jalons_soumis enable row level security;
drop policy if exists jalons_soumis_admin on public.jalons_soumis;
create policy jalons_soumis_admin on public.jalons_soumis for select to authenticated using (public.is_admin());

create or replace function public.jalons_soumis_noter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if jsonb_typeof(new.jalons) = 'array' then
    insert into public.jalons_soumis (jalon_id, contrat_id, nom, montant)
    select x->>'id', new.contrat_id, x->>'nom', nullif(x->>'depot', '')::numeric
      from jsonb_array_elements(new.jalons) x
     where x->>'etat' = 'Submitted' and coalesce(x->>'id', '') <> ''
    on conflict (jalon_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists upwork_jalons_soumis on public.upwork_jalons;
create trigger upwork_jalons_soumis after insert or update of jalons on public.upwork_jalons
  for each row execute function public.jalons_soumis_noter();

insert into public.jalons_soumis (jalon_id, contrat_id, nom, montant)
select x->>'id', j.contrat_id, x->>'nom', nullif(x->>'depot', '')::numeric
  from public.upwork_jalons j, jsonb_array_elements(case when jsonb_typeof(j.jalons) = 'array' then j.jalons else '[]'::jsonb end) x
 where x->>'etat' = 'Submitted' and coalesce(x->>'id', '') <> ''
on conflict (jalon_id) do nothing;

do $ny$
declare
  v_def text := pg_get_functiondef('public.needs_you()'::regprocedure);
  v_avant text := $q$    union all
    select 'samedi:' || cp.id$q$;
  v_apres text := $q$    union all
    select 'jalon_soumis:' || js.jalon_id, 'bloque', 'jalon_soumis', pr.id, null,
           coalesce(js.nom, 'milestone') || coalesce(' · ' || js.montant || ' $', '') || ' · contrat ' || js.contrat_id,
           'Soumise depuis le ' || to_char(js.vu_at at time zone 'Europe/Paris', 'DD/MM')
             || ' (vue par l''OS) : Upwork la paie tout seul au bout de 14 jours. Approuver ou demander une correction.',
           null, 'paie', js.vu_at,
           array['ouvrir', 'ignorer'], js.jalon_id, 'https://www.upwork.com/nx/wm/workroom/' || js.contrat_id || '/overview', null, 1
      from public.jalons_soumis js
      join public.upwork_jalons uj on uj.contrat_id = js.contrat_id
      left join public.profiles pr on pr.upwork_contract_id = js.contrat_id and pr.is_active
     where js.vu_at < now() - interval '7 days'
       and exists (select 1 from jsonb_array_elements(case when jsonb_typeof(uj.jalons) = 'array' then uj.jalons else '[]'::jsonb end) x
                    where x->>'id' = js.jalon_id and x->>'etat' = 'Submitted')
    union all
    select 'samedi:' || cp.id$q$;
begin
  if position(v_avant in v_def) = 0 then raise exception '0451 : bloc « samedi » introuvable dans needs_you()'; end if;
  execute replace(v_def, v_avant, v_apres);
end;
$ny$;

-- Une question de paie que l'OS ne règle pas : la fiche (lien du contrat, posts, montant attendu).
do $ny$
declare
  v_def text := pg_get_functiondef('public.needs_you()'::regprocedure);
  v_a1 text := $q$case when r.liste = 'paie' then 'Question de paie : l''OS a répondu d''attendre'$q$;
  v_n1 text := $q$case when r.liste = 'paie' then 'Question de paie : l''OS a répondu d''attendre'
                  || coalesce(' · ' || (select ps.faits || ' post(s) avec lien, ' || coalesce(ps.montant_corrige, ps.montant) || ' $ attendus (semaine du '
                                            || to_char(ps.semaine, 'DD/MM') || case when ps.paye_at is not null then ', payée' else '' end || ')'
                                          from public.paie_semaines ps where ps.poster_id = r.poster_id order by ps.semaine desc limit 1), '')$q$;
  v_a2 text := $q$r.id::text as ref, '/admin/auto/received' as lien$q$;
  v_n2 text := $q$r.id::text as ref,
           case when r.liste = 'paie' then coalesce((select 'https://www.upwork.com/nx/wm/workroom/' || pr.upwork_contract_id || '/overview'
                                                       from public.profiles pr where pr.id = r.poster_id and pr.upwork_contract_id is not null),
                                                     '/admin/auto/received')
                else '/admin/auto/received' end as lien$q$;
begin
  if position(v_a1 in v_def) = 0 or position(v_a2 in v_def) = 0 then raise exception '0451 : bloc « reponse » introuvable dans needs_you()'; end if;
  execute replace(replace(v_def, v_a1, v_n1), v_a2, v_n2);
end;
$ny$;

-- 4. La simulation d'une paie (rien n'est payé ni financé).
create table if not exists public.paie_simulations (
  id uuid primary key default gen_random_uuid(),
  semaine date not null,
  source text not null default 'jalons_lus',
  statut text not null default 'en_cours' check (statut in ('en_cours', 'fini', 'erreur')),
  lance_par uuid,
  lance_at timestamptz not null default now(),
  fini_at timestamptz,
  resultat jsonb,
  lignes jsonb,
  erreur text
);
alter table public.paie_simulations enable row level security;
drop policy if exists paie_simulations_admin on public.paie_simulations;
create policy paie_simulations_admin on public.paie_simulations for select to authenticated using (public.is_admin());

-- 5. La fiche d'un compte le samedi (Kill & pay / Kill & don't pay).
create or replace function public.samedi_fiche(p_poster uuid, p_lundi date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
  v_debut timestamptz := (p_lundi::timestamp at time zone 'Europe/Paris');
  v_fin timestamptz := ((p_lundi + 7)::timestamp at time zone 'Europe/Paris');
begin
  if not public.is_admin() then raise exception 'samedi_fiche : réservé à l''admin et au Head of Ops'; end if;
  select jsonb_build_object(
    'posts', coalesce((select jsonb_agg(jsonb_build_object(
                 'jour', pa.date_publication_prevue, 'handle', c.handle_tiktok, 'url', pa.publie_url, 'vues', pa.vues,
                 'statut', pa.resolution_statut) order by pa.date_publication_prevue, c.handle_tiktok)
               from public.passages pa join public.comptes c on c.id = pa.compte_id
              where c.poster_id = p_poster and pa.date_publication_prevue between p_lundi and p_lundi + 6
                and pa.statut::text <> 'brouillon' and not coalesce(pa.est_rappel, false)), '[]'::jsonb),
    'nudges', coalesce((select jsonb_agg(jsonb_build_object('type', n.type, 'at', n.envoye_at, 'canaux', n.canaux,
                 'canal', n.canal, 'texte', left(n.texte, 500), 'erreur', n.slack_erreur) order by n.envoye_at)
               from public.nudges n where n.poster_id = p_poster and n.envoye_at >= v_debut and n.envoye_at < v_fin), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(m order by m->>'at') from (
                 select jsonb_build_object('sens', 'recu', 'canal', r.canal, 'at', r.recu_at, 'texte', left(r.texte, 500),
                          'reponse', left(r.reponse_texte, 500)) m
                   from public.posteur_reponses r where r.poster_id = p_poster and r.recu_at >= v_debut and r.recu_at < v_fin
                 union all
                 select jsonb_build_object('sens', 'envoye', 'canal', coalesce(case when m.upwork_statut = 'envoye' then 'upwork' end, 'slack'),
                          'at', m.created_at, 'texte', left(m.texte, 500))
                   from public.posteur_messages m where m.poster_id = p_poster and m.created_at >= v_debut and m.created_at < v_fin) x), '[]'::jsonb),
    'historique', jsonb_build_object(
       'cohorte', pr.cohorte_lundi,
       'comptes', coalesce((select jsonb_agg(jsonb_build_object('handle', c.handle_tiktok, 'actif', c.is_active, 'cree', c.created_at)
                                 order by c.created_at) from public.comptes c where c.poster_id = p_poster and c.type_compte = 'perso'), '[]'::jsonb),
       'pauses', coalesce((select jsonb_agg(jsonb_build_object('debut', pp.debut, 'jusqu_au', pp.jusqu_au, 'raison', pp.raison)
                                 order by pp.debut) from public.posteur_pauses pp where pp.poster_id = p_poster), '[]'::jsonb),
       'kills_annules', (select count(*) from public.arrets ar where ar.poster_id = p_poster and ar.annule_at is not null)
                        + (select count(*) from public.ckd_arrets ka join public.comptes c on c.id = ka.compte_id
                            where c.poster_id = p_poster and ka.annule_at is not null)),
    'contrat', jsonb_build_object(
       'id', pr.upwork_contract_id,
       'url', coalesce(pr.upwork_contrat_url, case when pr.upwork_contract_id is not null
                         then 'https://www.upwork.com/nx/wm/workroom/' || pr.upwork_contract_id || '/overview' end),
       'freelance', (select uc.freelancer_nom from public.upwork_contrats uc where uc.contrat_id = pr.upwork_contract_id limit 1),
       'tarif', coalesce(public.paie_tarif_contrat(pr.id), pr.tarif_hebdo)),
    'semaine', (select jsonb_build_object('faits', c.faits, 'prevus', c.prevus, 'montant', c.montant, 'action', c.action, 'raison', c.raison)
                  from public.paie_calculer_v3(p_lundi) c where c.poster_id = p_poster)
  ) into v
  from public.profiles pr where pr.id = p_poster;
  return v;
end;
$$;
revoke all on function public.samedi_fiche(uuid, date) from public, anon;
grant execute on function public.samedi_fiche(uuid, date) to authenticated;

notify pgrst, 'reload schema';
