-- 0391 — Prompt 17, partie A : une seule relance par étape (et les colonnes de
-- cohorte de la partie B, dont les relances ont besoin).
--
-- Le principe : l'OS vérifie chaque recrue toutes les heures (fonction
-- `recrues-check`, cron à la minute 10). Chaque étape a une date limite ;
-- dépassée et pas faite, l'OS envoie UN message, jamais un 2e. Toujours pas
-- faite à la fin du délai : la recrue passe en rouge, Max ou le Head of Ops
-- décide (Reporter, Arrêter : partie B).
--   1. acces    : 1re connexion à l'OS ET relié à Slack (Upwork, 24 h / 48 h
--                 après l'offre acceptée) ;
--   2. tiktok   : le pseudo existe sur TikTok (Slack sinon Upwork, 48 h après la
--                 1re connexion, rouge 24 h après le message) ;
--   3. warmup   : Start warmup + 5 follows + 2 reposts (Slack sinon Upwork,
--                 samedi 12 h, rouge dimanche minuit) ;
--   4. mercredi : tous les posteurs actifs avec des posts prévus lundi et mardi,
--                 au moins 1 publié lundi ou mardi (Upwork, mercredi 12 h ;
--                 aucun post vendredi 20 h : inactif, proposé en Kill samedi).
--
-- Ce que la migration ajoute :
--   - profiles : offre_acceptee_le, cohorte_lundi (calculée à la création),
--     premiere_connexion_at, upwork_contract_id (rempli par le prompt 14 point 2) ;
--   - nudges : `periode` (le lundi de la cohorte, ou de la semaine pour
--     mercredi), un index unique (poster_id, type, periode) pour les nouvelles
--     lignes, et le canal « upwork » ;
--   - recrues_rouges (les rouges et la décision), relances_prevues (ce qui
--     partirait en simulation, ou ne peut pas partir : « contrat non relié ») ;
--   - les réglages : relances_auto = simulation, les délais, les 4 textes,
--     slack_lien_invitation (vide, à remplir) ;
--   - la règle « inactif » (0385) : message du mercredi envoyé ET aucun post
--     publié de lundi à vendredi 20 h (heure du pays). Même signature.
--   - cohorte_lundi des posteurs actifs existants (hors RUUL) : leur cohorte
--     actuelle (lundi du 1er post prévu de leur 1er compte, sinon de la fin du
--     warm-up), sinon calculée depuis leur date de création. Accord de Max
--     le 28/10. Une colonne nouvelle : aucune donnée existante modifiée.
--
-- Retour arrière : drop des tables recrues_rouges, relances_prevues, des
-- fonctions relances_* et cohorte_lundi_de ; réappliquer inactifs_calculer de
-- 0385 ; cron.unschedule('recrues-check').

-- ---------------------------------------------------------------------------
-- Réglages
-- ---------------------------------------------------------------------------
insert into public.reglages (cle, valeur) values
  ('relances_auto', to_jsonb('simulation'::text)),
  ('relances_delais', jsonb_build_object(
     'acces_message_h', 24, 'acces_rouge_h', 48,
     'tiktok_message_h', 48, 'tiktok_rouge_h', 24,
     'warmup_message_heure', 12,
     'mercredi_message_heure', 12, 'mercredi_rouge_heure', 20,
     'fenetre_debut', 10, 'fenetre_fin', 20)),
  ('relance_texte_acces', to_jsonb('Hi {prenom}, to start posting on Monday {date}, please do this today: {manque}. Your login is in the welcome message above.'::text)),
  ('relance_texte_tiktok', to_jsonb('Hi {prenom}, your TikTok account @{handle} isn''t created yet. Please create it today: the steps are on your dashboard ({url}). Your first posts are on Monday {date}.'::text)),
  ('relance_texte_warmup', to_jsonb('Hi {prenom}, your warm-up isn''t finished: {manque}. Please finish it before Sunday midnight, or you won''t start on Monday {date}.'::text)),
  ('relance_texte_mercredi', to_jsonb('Hi {prenom}, we haven''t seen any post from you since Monday. Please post today and let us know if something is wrong. If there are still no posts by Friday, we''ll have to end the contract on Saturday.'::text)),
  ('slack_lien_invitation', to_jsonb(''::text)),
  ('cohorte_jour_limite', to_jsonb(4))
on conflict (cle) do nothing;

-- ---------------------------------------------------------------------------
-- Colonnes
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists offre_acceptee_le     timestamptz,
  add column if not exists cohorte_lundi         date,
  add column if not exists premiere_connexion_at timestamptz,
  add column if not exists upwork_contract_id    text;

comment on column public.profiles.offre_acceptee_le is
  'Prompt 17 (0391) : début du contrat Upwork (offre acceptée), lu par le prompt 14 point 2 ; sinon la création dans l''OS.';
comment on column public.profiles.cohorte_lundi is
  'Prompt 17 (0391) : le lundi où la recrue commence à poster. Calculée à la création, changée seulement par « Reporter ».';
comment on column public.profiles.premiere_connexion_at is
  'Prompt 17 (0391) : 1re connexion à l''OS vue par recrues-check (auth.users.last_sign_in_at).';

alter table public.nudges add column if not exists periode date;

do $$
declare
  c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.nudges'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%canal%'
  loop
    execute format('alter table public.nudges drop constraint %I', c);
  end loop;
  alter table public.nudges add constraint nudges_canal_check check (canal in ('slack', 'os', 'upwork'));
end
$$;

-- Une seule relance par étape et par période, même si le cron tourne deux fois.
create unique index if not exists nudges_etape_unique on public.nudges (poster_id, type, periode)
  where periode is not null;

-- ---------------------------------------------------------------------------
-- Cohorte : le premier lundi strictement après (acceptation + 3 jours) ; avec
-- un jour limite J (jeudi = 4), + (7 − J) jours.
-- ---------------------------------------------------------------------------
create or replace function public.cohorte_lundi_de(p_jour date)
returns date
language sql
stable
set search_path = public
as $$
  with x as (
    select p_jour + (7 - coalesce((select (valeur #>> '{}')::int from public.reglages where cle = 'cohorte_jour_limite'), 4)) as d
  )
  select (d + (8 - extract(isodow from d)::int))::date from x;
$$;

grant execute on function public.cohorte_lundi_de(date) to authenticated, service_role;

create or replace function public.profiles_cohorte_lundi()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.cohorte_lundi is null then
    new.cohorte_lundi := public.cohorte_lundi_de(
      (coalesce(new.offre_acceptee_le, new.created_at, now()) at time zone 'Europe/Paris')::date);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_cohorte_lundi on public.profiles;
create trigger profiles_cohorte_lundi before insert on public.profiles
  for each row execute function public.profiles_cohorte_lundi();

-- Les posteurs actifs existants (hors RUUL) : leur cohorte actuelle.
with po as (
  select pr.id, pr.created_at from public.profiles pr
   where pr.is_active and pr.cohorte_lundi is null
     and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
     and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
),
c as (
  select co.poster_id,
         min(coalesce(pj.premier_jour, (co.warmup_ends_at at time zone 'Europe/Paris')::date)) as d
    from public.comptes co
    left join public.comptes_premier_jour pj on pj.compte_id = co.id
   where co.type_compte = 'perso' and co.poster_id in (select id from po)
   group by co.poster_id
)
update public.profiles pr
   set cohorte_lundi = coalesce(c.d - (extract(isodow from c.d)::int - 1),
                                public.cohorte_lundi_de((po.created_at at time zone 'Europe/Paris')::date))
  from po left join c on c.poster_id = po.id
 where pr.id = po.id;

-- ---------------------------------------------------------------------------
-- Rouges et relances prévues
-- ---------------------------------------------------------------------------
create table if not exists public.recrues_rouges (
  id            uuid primary key default gen_random_uuid(),
  poster_id     uuid not null references public.profiles (id) on delete cascade,
  etape         text not null check (etape in ('acces', 'tiktok', 'warmup', 'mercredi')),
  periode       date not null,
  rouge_at      timestamptz not null default now(),
  decision      text check (decision in ('reporter', 'arreter')),
  decision_at   timestamptz,
  decision_par  uuid references auth.users (id) on delete set null,
  unique (poster_id, etape, periode)
);

alter table public.recrues_rouges enable row level security;

create table if not exists public.relances_prevues (
  poster_id  uuid not null references public.profiles (id) on delete cascade,
  type       text not null,
  periode    date not null,
  statut     text not null check (statut in ('prevu', 'bloque')),
  canal      text,
  texte      text,
  raison     text,
  maj_at     timestamptz not null default now(),
  primary key (poster_id, type, periode)
);

alter table public.relances_prevues enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recrues_rouges'
                  and policyname = 'recrues_rouges_lecture') then
    create policy recrues_rouges_lecture on public.recrues_rouges for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'relances_prevues'
                  and policyname = 'relances_prevues_lecture') then
    create policy relances_prevues_lecture on public.relances_prevues for select to authenticated using (public.is_admin());
  end if;
end
$$;

comment on table public.recrues_rouges is
  'Prompt 17 (0391) : une étape pas faite à la fin de son délai. Personne ne relance ; Max ou le Head of Ops décide (Reporter, Arrêter).';
comment on table public.relances_prevues is
  'Prompt 17 (0391) : ce que recrues-check enverrait (simulation), ou ne peut pas envoyer (contrat non relié).';

-- ---------------------------------------------------------------------------
-- Ce que recrues-check lit (service_role seulement)
-- ---------------------------------------------------------------------------

-- La 1re connexion, vue une fois : auth.users.last_sign_in_at.
create or replace function public.relances_noter_connexions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'relances_noter_connexions : réservé à recrues-check';
  end if;
  update public.profiles pr
     set premiere_connexion_at = u.last_sign_in_at
    from auth.users u
   where u.id = pr.id and pr.premiere_connexion_at is null and u.last_sign_in_at is not null;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Les recrues dont la cohorte n'a pas encore démarré (et la veille, pour le
-- rouge de dimanche minuit des pays en retard sur Paris).
create or replace function public.relances_recrues()
returns table (
  poster_id             uuid,
  prenom                text,
  hm_prenom             text,
  pays                  text,
  fuseau                text,
  offre_at              timestamptz,
  cohorte_lundi         date,
  premiere_connexion_at timestamptz,
  slack_user_id         text,
  contrat_id            text,
  compte_id             uuid,
  handle                text,
  warmup_started_at     timestamptz,
  warmup_reposts_at     timestamptz,
  tiktok_existe         boolean,
  abonnements           integer,
  nudges                jsonb,
  rouges                jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_auj date := (now() at time zone 'Europe/Paris')::date;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with po as (
    select pr.* from public.profiles pr
     where pr.is_active and pr.cohorte_lundi >= v_auj - 1
       and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
  ),
  cpt as (
    select distinct on (c.poster_id) c.poster_id, c.id, c.handle_tiktok, c.pays, c.warmup_started_at, c.warmup_reposts_at
      from public.comptes c
     where c.poster_id in (select id from po) and c.type_compte = 'perso' and c.is_active
     order by c.poster_id, c.created_at
  )
  select po.id, po.prenom, hm.prenom, cpt.pays,
         case when cpt.pays is null then 'Europe/Paris' else public.fuseau_pays(cpt.pays) end,
         coalesce(po.offre_acceptee_le, po.created_at), po.cohorte_lundi,
         coalesce(po.premiere_connexion_at, u.last_sign_in_at),
         po.slack_user_id, po.upwork_contract_id,
         cpt.id, cpt.handle_tiktok, cpt.warmup_started_at, cpt.warmup_reposts_at,
         r.existe, r.abonnements,
         coalesce((select jsonb_agg(jsonb_build_object('type', n.type, 'periode', n.periode, 'envoye_at', n.envoye_at,
                                                       'canal', n.canal, 'resolu_at', n.resolu_at))
                     from public.nudges n where n.poster_id = po.id and n.periode is not null), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('etape', x.etape, 'periode', x.periode, 'decision', x.decision))
                     from public.recrues_rouges x where x.poster_id = po.id), '[]'::jsonb)
    from po
    left join public.profiles hm on hm.id = po.manager_id
    left join auth.users u on u.id = po.id
    left join cpt on cpt.poster_id = po.id
    left join lateral (
      select w.existe, w.abonnements from public.ckd_warmup_releves w
       where w.compte_id = cpt.id and w.existe is not null
       order by w.releve_at desc limit 1
    ) r on true;
end;
$$;

-- Étape 4 : les posteurs actifs qui avaient des posts prévus lundi et mardi.
create or replace function public.relances_mercredi(p_lundi date)
returns table (
  poster_id         uuid,
  prenom            text,
  pays              text,
  fuseau            text,
  slack_user_id     text,
  contrat_id        text,
  prevus_lun_mar    integer,
  publies_lun_mar   integer,
  publies_semaine   integer,
  nudge_envoye_at   timestamptz,
  rouge             boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_debut timestamptz := (p_lundi::timestamp at time zone 'Europe/Paris') - interval '12 hours';
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with po as (
    select pr.* from public.profiles pr
     where pr.is_active
       and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
  ),
  s as (
    select c.poster_id,
           min(c.pays) as pays,
           (count(p.id) filter (where p.date_publication_prevue between p_lundi and p_lundi + 1))::int as prevus,
           (count(p.id) filter (where p.date_publication_prevue between p_lundi and p_lundi + 1
                                  and p.publie_at is not null))::int as publies_lm
      from public.comptes c
      join public.passages p on p.compte_id = c.id
     where c.poster_id in (select id from po) and c.type_compte = 'perso' and c.is_active
       and p.date_publication_prevue between p_lundi and p_lundi + 6
       and p.statut::text <> 'brouillon' and not coalesce(p.est_rappel, false)
     group by c.poster_id
  )
  select po.id, po.prenom, s.pays,
         case when s.pays is null then 'Europe/Paris' else public.fuseau_pays(s.pays) end,
         po.slack_user_id, po.upwork_contract_id, s.prevus, s.publies_lm,
         (select count(*)::int from public.passages p join public.comptes c on c.id = p.compte_id
           where c.poster_id = po.id and p.publie_at >= v_debut),
         (select n.envoye_at from public.nudges n where n.poster_id = po.id and n.type = 'mercredi' and n.periode = p_lundi),
         exists (select 1 from public.recrues_rouges x where x.poster_id = po.id and x.etape = 'mercredi' and x.periode = p_lundi)
    from po join s on s.poster_id = po.id
   where s.prevus > 0;
end;
$$;

revoke execute on function public.relances_noter_connexions() from public, anon, authenticated;
grant execute on function public.relances_noter_connexions() to service_role;
revoke execute on function public.relances_recrues() from public, anon;
grant execute on function public.relances_recrues() to authenticated, service_role;
revoke execute on function public.relances_mercredi(date) from public, anon;
grant execute on function public.relances_mercredi(date) to authenticated, service_role;

-- Le journal (page Relances) : les relances avec leur étape et leur période.
create or replace function public.relances_liste(p_depuis date)
returns table (
  id          uuid,
  poster_id   uuid,
  poster_nom  text,
  hm_prenom   text,
  handle      text,
  type        text,
  periode     date,
  canal       text,
  texte       text,
  envoye_at   timestamptz,
  reponse_at  timestamptz,
  resolu_at   timestamptz,
  slack_erreur text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select n.id, n.poster_id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), hm.prenom,
         c.handle_tiktok, n.type, n.periode, n.canal, n.texte, n.envoye_at, n.reponse_at, n.resolu_at, n.slack_erreur
    from public.nudges n
    join public.profiles pr on pr.id = n.poster_id
    left join public.profiles hm on hm.id = pr.manager_id
    left join public.comptes c on c.id = n.compte_id
   where n.envoye_at >= p_depuis
   order by n.envoye_at desc;
end;
$$;

revoke execute on function public.relances_liste(date) from public, anon;
grant execute on function public.relances_liste(date) to authenticated;

-- L'accueil HM, en lecture seule : ce que l'OS a fait pour ses posteurs
-- (relances des 14 derniers jours, inactifs ouverts). Une HM : les siens.
create or replace function public.relances_hm()
returns table (
  poster_id  uuid,
  poster_nom text,
  quoi       text,
  type       text,
  canal      text,
  le         timestamptz,
  resolu_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hm uuid;
begin
  if not public.is_admin() then
    if not public.is_hiring_manager() then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    v_hm := auth.uid();
  end if;
  return query
  select n.poster_id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), 'relance'::text, n.type, n.canal,
         n.envoye_at, n.resolu_at
    from public.nudges n
    join public.profiles pr on pr.id = n.poster_id
   where n.envoye_at > now() - interval '14 days'
     and (v_hm is null or pr.manager_id = v_hm)
  union all
  select i.poster_id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), 'inactif'::text, null::text, null::text,
         i.depuis, null::timestamptz
    from public.posteurs_inactifs i
    join public.profiles pr on pr.id = i.poster_id
   where i.sorti_at is null
     and (v_hm is null or pr.manager_id = v_hm)
  order by 6 desc;
end;
$$;

revoke execute on function public.relances_hm() from public, anon;
grant execute on function public.relances_hm() to authenticated;

-- ---------------------------------------------------------------------------
-- La règle « inactif » (0385), même signature : message du mercredi envoyé
-- cette semaine ET aucun post publié de lundi à vendredi 20 h (heure du pays).
-- `nudges_sans_reponse` vaut 1 (le message du mercredi).
-- ---------------------------------------------------------------------------
create or replace function public.inactifs_calculer()
returns table (poster_id uuid, jours_sans_post integer, nudges_sans_reponse integer, dernier_post_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_auj date := (now() at time zone 'Europe/Paris')::date;
  v_lundi date := v_auj - (extract(isodow from v_auj)::int - 1);
begin
  return query
  with m as (
    select n.poster_id from public.nudges n
     where n.type = 'mercredi' and n.periode = v_lundi
  ),
  s as (
    select m.poster_id,
           (select min(c.pays) from public.comptes c where c.poster_id = m.poster_id and c.type_compte = 'perso') as pays,
           (select max(p.publie_at) from public.passages p join public.comptes c on c.id = p.compte_id
             where c.poster_id = m.poster_id) as dernier
      from m
      join public.profiles pr on pr.id = m.poster_id
     where pr.is_active
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = m.poster_id)
  )
  select s.poster_id,
         case when s.dernier is null then 7
              else greatest(v_auj - (s.dernier at time zone 'Europe/Paris')::date, 0) end,
         1, s.dernier
    from s
   where now() >= (((v_lundi + 4)::timestamp + interval '20 hours')
                    at time zone (case when s.pays is null then 'Europe/Paris' else public.fuseau_pays(s.pays) end))
     and (s.dernier is null or s.dernier < ((v_lundi::timestamp) at time zone 'Europe/Paris') - interval '12 hours');
end;
$$;

revoke execute on function public.inactifs_calculer() from public, anon, authenticated;
grant execute on function public.inactifs_calculer() to service_role;

-- ---------------------------------------------------------------------------
-- Cron : recrues-check à la minute 10 de chaque heure
-- ---------------------------------------------------------------------------
do $cron$
declare
  template text;
  cmd text;
begin
  if exists (select 1 from cron.job where jobname = 'recrues-check') then
    perform cron.unschedule('recrues-check');
  end if;
  select c.command into template
    from cron.job c
   where position('x-cron-secret' in c.command) > 0
     and position('functions/v1/' in c.command) > 0
   order by case when c.jobname = 'upwork-verifier' then 0 when c.jobname = 'slack-relier' then 1 else 2 end
   limit 1;
  if template is null then
    raise notice 'recrues-check : aucun cron modèle avec secret, à planifier à la main';
    return;
  end if;
  cmd := regexp_replace(template, 'functions/v1/[a-z0-9-]+', 'functions/v1/recrues-check', 'i');
  if position('body' in cmd) > 0 then
    cmd := regexp_replace(cmd, 'body\s*:=\s*''[^'']*''::jsonb', 'body := ''{"action":"verifier"}''::jsonb', 'i');
  end if;
  if position('"verifier"' in cmd) = 0 or position('recrues-check' in cmd) = 0 then
    raise notice 'recrues-check : réécriture de la commande échouée';
    return;
  end if;
  perform cron.schedule('recrues-check', '10 * * * *', cmd);
end
$cron$;

notify pgrst, 'reload schema';
