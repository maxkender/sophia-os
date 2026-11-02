-- 0374 : les bonus, payés toutes les 4 semaines (prompt 11, 27/10).
--
-- Réglages (`reglages.bonus`, créés par 0373, modifiables dans l'OS) :
-- parrainage_montant, parrainage_semaines_min (2), parrainage_posts_min_semaine
-- (12), comment_master_par_commentaire, premier_lundi (30/11/2026). Un lundi
-- bonus revient toutes les 4 semaines ; il paie les 28 jours qui finissent la
-- veille.
--
-- Le lundi bonus à 6 h (`bonus_generer_lundi`) :
--   - Parrainage : 1 bonus au parrain par parrainage accepté dont la recrue
--     (recrue_id) a fait au moins `semaines_min` semaines complètes (lundi →
--     dimanche) à `posts_min_semaine` posts publiés ou plus, et est toujours
--     active. Une seule fois par parrainage (unique sur referral_id).
--   - Comment Master : ses Done de la période qui comptent (0373 : faits
--     pendant son mandat, par lui ou validés) × `comment_master_par_commentaire`,
--     avec le nombre de vérifiés sur TikTok à côté.
-- Un type dont le montant n'est pas réglé (0) n'est pas généré ; « Recalculer »
-- le refait une fois le montant rempli, sans jamais toucher une ligne payée.
-- « À voir » : le posteur n'a pas de lien de contrat Upwork (calculé à la
-- lecture, la ligne repasse « À payer » dès que le lien est rempli).
--
-- Droits : admin et Head of Ops (is_admin) lisent tout, génèrent et cochent
-- « Payé » ; une HM lit les bonus de ses posteurs (« Bonus à venir »), sans
-- rien payer.
--
-- Additive : une table, des fonctions, une tâche planifiée. Aucune donnée
-- existante modifiée. Retour arrière :
--   select cron.unschedule('bonus-lundi');
--   drop function public.bonus_a_venir(), public.bonus_lister(date),
--     public.bonus_marquer_paye(uuid, boolean), public.bonus_generer_lundi(),
--     public.bonus_generer(date), public.bonus_calculer(date),
--     public.bonus_semaines_completes(uuid, date, integer),
--     public.bonus_prochain_lundi(date), public.bonus_reglages(),
--     public.bonus_date_courte(date);
--   drop table public.bonus;

create table if not exists public.bonus (
  id            uuid primary key default gen_random_uuid(),
  poster_id     uuid not null references public.profiles (id) on delete cascade,
  type          text not null check (type in ('parrainage', 'comment_master')),
  -- Parrainage : payé une seule fois par parrainage.
  referral_id   uuid unique references public.creator_referrals (id) on delete set null,
  recrue_id     uuid,
  lundi_bonus   date not null,
  periode_debut date not null,
  periode_fin   date not null,
  detail        text not null,
  -- Comment Master : commentaires Done ; parrainage : semaines complètes.
  quantite      integer not null default 0,
  verifies      integer,
  montant       numeric not null,
  statut        text not null default 'a_payer' check (statut in ('a_payer', 'paye')),
  paye_at       timestamptz,
  paye_par      uuid,
  calcule_at    timestamptz not null default now()
);

create unique index if not exists bonus_comment_master_lundi
  on public.bonus (poster_id, lundi_bonus) where type = 'comment_master';
create index if not exists bonus_lundi on public.bonus (lundi_bonus);

alter table public.bonus enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bonus'
                  and policyname = 'bonus lecture admin') then
    create policy "bonus lecture admin" on public.bonus
      for select to authenticated using ((select public.is_admin()));
  end if;
end $$;
revoke all on public.bonus from public, anon, authenticated;
grant select on public.bonus to authenticated;
grant all on public.bonus to service_role;

-- ---------------------------------------------------------------------------
-- Réglages et dates
-- ---------------------------------------------------------------------------
create or replace function public.bonus_reglages()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'parrainage_montant', coalesce((v->>'parrainage_montant')::numeric, 0),
    'parrainage_semaines_min', coalesce((v->>'parrainage_semaines_min')::int, 2),
    'parrainage_posts_min_semaine', coalesce((v->>'parrainage_posts_min_semaine')::int, 12),
    'comment_master_par_commentaire', coalesce((v->>'comment_master_par_commentaire')::numeric, 0),
    'premier_lundi', coalesce(v->>'premier_lundi', '2026-11-30'))
  from (select coalesce((select valeur from public.reglages where cle = 'bonus'), '{}'::jsonb) as v) r;
$$;

-- Le premier lundi bonus à partir de `p_jour` (compris).
create or replace function public.bonus_prochain_lundi(p_jour date)
returns date
language sql
stable
set search_path = public
as $$
  select p + 28 * greatest(0, ceil((p_jour - p)::numeric / 28)::int)
    from (select (public.bonus_reglages()->>'premier_lundi')::date as p) x;
$$;

-- « 2 nov. » : pour le détail d'une ligne.
create or replace function public.bonus_date_courte(p_jour date)
returns text
language sql
immutable
as $$
  select extract(day from p_jour)::int || ' ' ||
         (array['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'])
           [extract(month from p_jour)::int];
$$;

-- Les semaines complètes (lundi → dimanche, finies au plus tard `p_fin`) où
-- le posteur a publié au moins `p_min` posts, tous ses comptes confondus.
create or replace function public.bonus_semaines_completes(p_poster uuid, p_fin date, p_min integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from (
      select date_trunc('week', x.date_publication_prevue)::date as lundi, count(*) as publies
        from public.passages x
        join public.comptes c on c.id = x.compte_id
       where c.poster_id = p_poster
         and not coalesce(x.est_rappel, false)
         and x.publie_url is not null
       group by 1
    ) s
   where s.lundi + 6 <= p_fin
     and s.publies >= p_min;
$$;

-- ---------------------------------------------------------------------------
-- Le calcul (sans rien écrire) : les bonus du lundi `p_lundi`
-- ---------------------------------------------------------------------------
create or replace function public.bonus_calculer(p_lundi date)
returns table (
  poster_id     uuid,
  type          text,
  referral_id   uuid,
  recrue_id     uuid,
  periode_debut date,
  periode_fin   date,
  detail        text,
  quantite      integer,
  verifies      integer,
  montant       numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  r jsonb := public.bonus_reglages();
  v_debut date := p_lundi - 28;
  v_fin date := p_lundi - 1;
begin
  return query
  -- Parrainage : une seule fois par parrainage, au parrain.
  select f.referrer_id, 'parrainage'::text, f.id, f.recrue_id, v_debut, v_fin,
         format('parrainage de %s, %s semaines faites',
                coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), btrim(concat_ws(' ', f.prenom, f.nom))),
                s.n),
         s.n, null::int, (r->>'parrainage_montant')::numeric
    from public.creator_referrals f
    join public.profiles pr on pr.id = f.recrue_id
    cross join lateral (
      select public.bonus_semaines_completes(f.recrue_id, v_fin, (r->>'parrainage_posts_min_semaine')::int) as n
    ) s
   where f.statut = 'accepte'
     and f.recrue_id is not null
     and coalesce(pr.is_active, true)
     and s.n >= (r->>'parrainage_semaines_min')::int
     and (r->>'parrainage_montant')::numeric > 0
     and not exists (select 1 from public.bonus b where b.referral_id = f.id)
  union all
  -- Comment Master : ses Done de la période qui comptent (attribués au mandat, 0373).
  select d.cm_profile_id, 'comment_master'::text, null::uuid, null::uuid, v_debut, v_fin,
         format('%s commentaires du %s au %s', count(*),
                case when extract(month from v_debut) = extract(month from v_fin)
                     then extract(day from v_debut)::int::text else public.bonus_date_courte(v_debut) end,
                public.bonus_date_courte(v_fin)),
         count(*)::int, count(*) filter (where d.verifie)::int,
         round(count(*) * (r->>'comment_master_par_commentaire')::numeric, 2)
    from public.cm_demandes_toutes(v_debut, v_fin) d
   where d.compte
     and d.cm_profile_id is not null
     and (r->>'comment_master_par_commentaire')::numeric > 0
   group by d.cm_profile_id;
end;
$$;

revoke execute on function public.bonus_calculer(date) from public, anon, authenticated;
grant execute on function public.bonus_calculer(date) to service_role;

-- ---------------------------------------------------------------------------
-- Génération (idempotente, ne touche jamais une ligne payée)
-- ---------------------------------------------------------------------------
create or replace function public.bonus_generer(p_lundi date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'bonus_generer : réservé à l''admin et au Head of Ops';
  end if;
  if p_lundi <> public.bonus_prochain_lundi(p_lundi) then
    raise exception 'bonus_generer : % n''est pas un lundi bonus', p_lundi;
  end if;

  with c as (select * from public.bonus_calculer(p_lundi)),
  parr as (
    insert into public.bonus (poster_id, type, referral_id, recrue_id, lundi_bonus, periode_debut, periode_fin,
                              detail, quantite, verifies, montant)
    select c.poster_id, c.type, c.referral_id, c.recrue_id, p_lundi, c.periode_debut, c.periode_fin,
           c.detail, c.quantite, c.verifies, c.montant
      from c where c.type = 'parrainage'
    on conflict (referral_id) do nothing
    returning 1
  ),
  cm as (
    insert into public.bonus as b (poster_id, type, lundi_bonus, periode_debut, periode_fin,
                                   detail, quantite, verifies, montant)
    select c.poster_id, c.type, p_lundi, c.periode_debut, c.periode_fin, c.detail, c.quantite, c.verifies, c.montant
      from c where c.type = 'comment_master'
    on conflict (poster_id, lundi_bonus) where type = 'comment_master' do update
       set detail = excluded.detail, quantite = excluded.quantite, verifies = excluded.verifies,
           montant = excluded.montant, calcule_at = now()
     where b.statut <> 'paye'
    returning 1
  )
  select (select count(*) from parr) + (select count(*) from cm) into n;
  return n;
end;
$$;

revoke execute on function public.bonus_generer(date) from public, anon;
grant execute on function public.bonus_generer(date) to authenticated, service_role;

-- Le cron du lundi : 6 h à Paris, seulement un lundi bonus.
create or replace function public.bonus_generer_lundi()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  paris timestamp := timezone('Europe/Paris', now());
begin
  if extract(isodow from paris) <> 1 or extract(hour from paris) <> 6 then
    return 0;
  end if;
  if paris::date <> public.bonus_prochain_lundi(paris::date) then
    return 0;
  end if;
  return public.bonus_generer(paris::date);
end;
$$;

revoke execute on function public.bonus_generer_lundi() from public, anon, authenticated;
grant execute on function public.bonus_generer_lundi() to service_role;

-- ---------------------------------------------------------------------------
-- Lecture et paiement
-- ---------------------------------------------------------------------------
create or replace function public.bonus_lister(p_lundi date)
returns table (
  id            uuid,
  poster_id     uuid,
  hm_id         uuid,
  type          text,
  referral_id   uuid,
  recrue_id     uuid,
  lundi_bonus   date,
  periode_debut date,
  periode_fin   date,
  detail        text,
  quantite      integer,
  verifies      integer,
  montant       numeric,
  statut        text,
  contrat_url   text,
  paye_at       timestamptz,
  paye_par      uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'bonus_lister : réservé à l''admin et au Head of Ops';
  end if;
  return query
  select b.id, b.poster_id, pr.manager_id, b.type, b.referral_id, b.recrue_id, b.lundi_bonus,
         b.periode_debut, b.periode_fin, b.detail, b.quantite, b.verifies, b.montant,
         case when b.statut = 'paye' then 'paye'
              when nullif(btrim(coalesce(pr.upwork_contrat_url, '')), '') is null then 'a_voir'
              else 'a_payer' end,
         pr.upwork_contrat_url, b.paye_at, b.paye_par
    from public.bonus b
    join public.profiles pr on pr.id = b.poster_id
   where b.lundi_bonus = p_lundi
   order by b.type, b.montant desc;
end;
$$;

revoke execute on function public.bonus_lister(date) from public, anon;
grant execute on function public.bonus_lister(date) to authenticated, service_role;

create or replace function public.bonus_marquer_paye(p_id uuid, p_paye boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'bonus_marquer_paye : réservé à l''admin et au Head of Ops';
  end if;
  update public.bonus
     set statut = case when p_paye then 'paye' else 'a_payer' end,
         paye_at = case when p_paye then now() end,
         paye_par = case when p_paye then auth.uid() end
   where id = p_id;
end;
$$;

revoke execute on function public.bonus_marquer_paye(uuid, boolean) from public, anon;
grant execute on function public.bonus_marquer_paye(uuid, boolean) to authenticated, service_role;

-- « Bonus à venir » : les bonus pas encore payés et l'aperçu du prochain lundi
-- bonus (période en cours, chiffres d'aujourd'hui). Une HM ne voit que ses
-- posteurs ; admin et Head of Ops : tout.
create or replace function public.bonus_a_venir()
returns table (
  poster_id   uuid,
  hm_id       uuid,
  type        text,
  detail      text,
  quantite    integer,
  montant     numeric,
  lundi_bonus date,
  -- genere : ligne déjà créée, à payer ; apercu : estimation de la période en cours.
  etat        text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_hm uuid;
  v_auj date := (now() at time zone 'Europe/Paris')::date;
  v_lundi date;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    if not public.is_hiring_manager() then
      raise exception 'bonus_a_venir : réservé à l''admin et aux HMs';
    end if;
    v_hm := auth.uid();
  end if;
  -- Le lundi bonus d'aujourd'hui est payé : l'aperçu porte sur le suivant.
  v_lundi := public.bonus_prochain_lundi(v_auj + 1);

  return query
  select b.poster_id, pr.manager_id, b.type, b.detail, b.quantite, b.montant, b.lundi_bonus, 'genere'::text
    from public.bonus b
    join public.profiles pr on pr.id = b.poster_id
   where b.statut <> 'paye'
     and (v_hm is null or pr.manager_id = v_hm)
  union all
  select c.poster_id, pr.manager_id, c.type, c.detail, c.quantite, c.montant, v_lundi, 'apercu'::text
    from public.bonus_calculer(v_lundi) c
    join public.profiles pr on pr.id = c.poster_id
   where (v_hm is null or pr.manager_id = v_hm);
end;
$$;

revoke execute on function public.bonus_a_venir() from public, anon;
grant execute on function public.bonus_a_venir() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tâche planifiée : le lundi, 6 h à Paris (la fonction vérifie l'heure et le lundi bonus)
-- ---------------------------------------------------------------------------
do $bonus$
begin
  if exists (select 1 from cron.job where jobname = 'bonus-lundi') then
    perform cron.unschedule('bonus-lundi');
  end if;
  perform cron.schedule('bonus-lundi', '0 4,5 * * 1', 'select public.bonus_generer_lundi()');
end
$bonus$;

notify pgrst, 'reload schema';
