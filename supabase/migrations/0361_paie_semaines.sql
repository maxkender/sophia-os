-- 0361 : la paie du lundi (dashboard HM et page admin « Paie »).
--
-- Chaque lundi à 6 h (Paris), une ligne par posteur pour la semaine qui vient
-- de finir (`paie_semaines`). La HM paie ses posteurs sur Upwork (milestone
-- « Week NN », « Week NN (2 acc) » pour 2 comptes) puis clique « Payé ».
--
-- Le calcul (`paie_calculer`, lecture seule), compte par compte :
--   prévus = posts planifiés de la semaine (hors brouillon, hors rappels),
--   faits = publiés, manqués = prévus − faits — mêmes définitions que les
--   compteurs hebdo (`hub_posts_semaine`, 0296) ;
--   1 post manqué toléré par compte et par semaine, puis −1 $ par post manqué ;
--   montant = tarif × comptes payés − retenues, jamais négatif.
-- « À voir », avec la raison :
--   0 post dans la semaine          → 0 $ ;
--   semaine de warm-up              → 0 $ (la milestone financée paie la 1re
--                                     semaine de posts) ;
--   un des comptes sans post        → on ne paie que les comptes qui ont posté ;
--   posteur arrêté                  → payer cette semaine, ne pas financer la
--                                     suivante ;
--   tarif inconnu (pays hors zone)  → 0 $ tant que l'admin ne l'a pas saisi ;
--   retenues ≥ tarif                → 0 $.
-- Hors paie : la cohorte RUUL (payée par Ruul, `hub_posteurs`).
--
-- Écritures sur l'existant : `profiles.tarif_hebdo` (colonne neuve) prérempli
-- d'après la zone du pays du compte du posteur (A 14 $, B 10 $, C 7 $), à la
-- demande de Max. Rien d'autre n'est modifié.
--
-- Additive : deux tables, une colonne, six fonctions, un cron.
-- Retour arrière : `select cron.unschedule('paie-lundi')`, supprimer les
-- fonctions, `paie_semaines`, `zones_paie` et la colonne `tarif_hebdo`.

-- ---------------------------------------------------------------------------
-- Zones de paie (jumeau : src/features/documents/posterGuide.ts)
-- ---------------------------------------------------------------------------
create table if not exists public.zones_paie (
  zone  text primary key check (zone in ('A', 'B', 'C')),
  tarif numeric not null check (tarif >= 0)
);

insert into public.zones_paie (zone, tarif)
values ('A', 14), ('B', 10), ('C', 7)
on conflict (zone) do nothing;

create table if not exists public.zones_paie_pays (
  pays text primary key check (pays ~ '^[A-Z]{2}$'),
  zone text not null references public.zones_paie (zone)
);

insert into public.zones_paie_pays (pays, zone)
select p, 'A' from unnest(array['FR','NL','DE','BE','AT','IE','GB','DK','NO','SE','FI','IS','LU','CH','US','CA','AU','NZ','JP','SG']) p
union all
select p, 'B' from unnest(array['ES','IT','PT','GR','PL','CZ','SK','HU','SI','HR','EE','LV','LT','IL','KR','AE','CL','UY']) p
union all
select p, 'C' from unnest(array['RO','BG','RS','UA','GE','AM','TR','MX','CO','BR','AR','ZA','MA','MY','TH','VN','PH','IN','ID']) p
on conflict (pays) do nothing;

alter table public.zones_paie enable row level security;
alter table public.zones_paie_pays enable row level security;

drop policy if exists zones_paie_lecture on public.zones_paie;
create policy zones_paie_lecture on public.zones_paie
  for select to authenticated using (public.is_admin() or public.is_hiring_manager());

drop policy if exists zones_paie_pays_lecture on public.zones_paie_pays;
create policy zones_paie_pays_lecture on public.zones_paie_pays
  for select to authenticated using (public.is_admin() or public.is_hiring_manager());

-- Le pays d'un posteur, pour la paie : celui de son plus ancien compte perso.
create or replace function public.paie_pays_posteur(p_poster uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select upper(c.pays)
    from public.comptes c
   where c.poster_id = p_poster and c.type_compte = 'perso' and c.pays is not null
   order by c.created_at
   limit 1;
$$;

-- Le tarif de zone d'un posteur (null : pays inconnu ou hors des 3 zones).
create or replace function public.paie_tarif_zone(p_poster uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select z.tarif
    from public.zones_paie_pays zp
    join public.zones_paie z on z.zone = zp.zone
   where zp.pays = public.paie_pays_posteur(p_poster);
$$;

-- ---------------------------------------------------------------------------
-- Tarif hebdo du posteur, prérempli par la zone
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists tarif_hebdo numeric
  check (tarif_hebdo is null or tarif_hebdo >= 0);

comment on column public.profiles.tarif_hebdo is
  'Paie : tarif par compte et par semaine, en $. Prérempli par la zone du pays (0361), modifiable par l''admin.';

update public.profiles pr
   set tarif_hebdo = public.paie_tarif_zone(pr.id)
 where pr.tarif_hebdo is null
   and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
   and public.paie_tarif_zone(pr.id) is not null;

-- ---------------------------------------------------------------------------
-- Les lignes de paie
-- ---------------------------------------------------------------------------
create table if not exists public.paie_semaines (
  id            uuid primary key default gen_random_uuid(),
  poster_id     uuid not null references public.profiles (id),
  -- Le lundi de la semaine payée.
  semaine       date not null check (extract(isodow from semaine) = 1),
  nb_comptes    integer not null default 0,
  -- Comptes payés (ceux qui ont posté) : 2 → milestone « Week NN (2 acc) ».
  comptes_payes integer not null default 0,
  prevus        integer not null default 0,
  faits         integer not null default 0,
  manques       integer not null default 0,
  tarif         numeric,
  retenue       numeric not null default 0,
  montant       numeric not null default 0 check (montant >= 0),
  statut        text not null check (statut in ('ok', 'a_voir')),
  raison        text,
  paye_at       timestamptz,
  paye_par      uuid references auth.users (id),
  calcule_at    timestamptz not null default now(),
  unique (poster_id, semaine)
);

create index if not exists paie_semaines_semaine on public.paie_semaines (semaine);

alter table public.paie_semaines enable row level security;

-- Admin (et Head of Ops) : tout. HM / DM : ses posteurs. Écriture : RPC seulement.
drop policy if exists paie_semaines_lecture on public.paie_semaines;
create policy paie_semaines_lecture on public.paie_semaines
  for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.profiles p
                where p.id = paie_semaines.poster_id and p.manager_id = (select auth.uid()))
  );

grant select on public.paie_semaines to authenticated;
grant all on public.paie_semaines to service_role;

-- ---------------------------------------------------------------------------
-- Le calcul (lecture seule)
-- ---------------------------------------------------------------------------
create or replace function public.paie_calculer(p_lundi date)
returns table (
  poster_id     uuid,
  nb_comptes    integer,
  comptes_payes integer,
  prevus        integer,
  faits         integer,
  manques       integer,
  tarif         numeric,
  retenue       numeric,
  montant       numeric,
  statut        text,
  raison        text
)
language sql
stable
security definer
set search_path = public
as $$
  with bornes as (
    select (p_lundi::timestamp at time zone 'Europe/Paris') as debut,
           ((p_lundi + 7)::timestamp at time zone 'Europe/Paris') as fin
  ),
  posteurs as (
    select pr.id, pr.is_active, pr.tarif_hebdo
      from public.profiles pr
     where exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
  ),
  comptes_semaine as (
    select c.id, c.poster_id,
           count(p.id)::int as prevus,
           (count(p.id) filter (where p.publie_at is not null))::int as faits,
           -- Semaine de warm-up : son warm-up finit à la fin de CETTE semaine,
           -- ou il n'est pas lancé alors que le compte existait déjà au début
           -- de la semaine (moins de 21 jours, comme `ckd_cohorte_comptes`).
           (c.is_active
             and ((c.warmup_ends_at > b.debut and c.warmup_ends_at <= b.fin + interval '1 day')
                  or (c.warmup_ends_at is null and c.created_at < b.debut
                      and c.created_at >= b.debut - interval '21 days'))) as en_warmup
      from public.comptes c
      join posteurs po on po.id = c.poster_id
      cross join bornes b
      left join public.passages p
        on p.compte_id = c.id
       and p.date_publication_prevue between p_lundi and p_lundi + 6
       and p.statut::text <> 'brouillon'
       and not coalesce(p.est_rappel, false)
     where c.type_compte = 'perso'
     group by c.id, c.poster_id, c.is_active, c.created_at, c.warmup_ends_at, b.fin, b.debut
  ),
  agreg as (
    select cs.poster_id,
           (count(*) filter (where cs.prevus > 0))::int as nb_comptes,
           (count(*) filter (where cs.prevus > 0 and cs.faits > 0))::int as comptes_payes,
           coalesce(sum(cs.prevus), 0)::int as prevus,
           coalesce(sum(cs.faits), 0)::int as faits,
           coalesce(sum(cs.prevus - cs.faits), 0)::int as manques,
           -- 1 manqué toléré par compte, puis 1 $ par manqué ; seulement sur
           -- les comptes payés.
           coalesce(sum(greatest(cs.prevus - cs.faits - 1, 0))
                      filter (where cs.prevus > 0 and cs.faits > 0), 0)::numeric as retenue,
           bool_or(cs.en_warmup and cs.prevus = 0) as warmup
      from comptes_semaine cs
     group by cs.poster_id
    having (count(*) filter (where cs.prevus > 0)) > 0 or bool_or(cs.en_warmup)
  ),
  calc as (
    select a.*,
           coalesce(po.tarif_hebdo, public.paie_tarif_zone(a.poster_id)) as tarif,
           (not po.is_active
             or exists (select 1 from public.ckd_arrets ar
                          join public.comptes c on c.id = ar.compte_id
                          cross join bornes b
                         where c.poster_id = a.poster_id
                           and ar.raison = 'ne_pas_renouveler'
                           and ar.annule_at is null
                           and coalesce(ar.fait_at, ar.prevu_at) >= b.debut)) as arrete
      from agreg a
      join posteurs po on po.id = a.poster_id
  ),
  raisons as (
    select c.*,
           array_remove(array[
             case when c.nb_comptes = 0 then
               'Semaine de warm-up : rien à payer (la milestone financée paie la 1re semaine de posts)' end,
             case when c.nb_comptes > 0 and c.faits = 0 then '0 post dans la semaine : ne rien payer' end,
             case when c.faits > 0 and c.tarif is null then 'Tarif à renseigner (pays hors zone de paie)' end,
             case when c.faits > 0 and c.comptes_payes < c.nb_comptes then
               format('%s compte(s) sans post : ne payer que %s compte(s)',
                      c.nb_comptes - c.comptes_payes, c.comptes_payes) end,
             case when c.comptes_payes > 0 and c.tarif is not null
                       and c.tarif * c.comptes_payes - c.retenue <= 0 then
               'Retenues ≥ tarif : rien à payer' end,
             case when c.arrete and c.faits > 0 then
               'Posteur arrêté : payer cette semaine, ne pas financer la suivante' end,
             case when c.arrete and c.faits = 0 then 'Posteur arrêté' end
           ], null) as liste
      from calc c
  )
  select r.poster_id, r.nb_comptes, r.comptes_payes, r.prevus, r.faits, r.manques,
         r.tarif,
         case when r.tarif is null or r.comptes_payes = 0 then 0 else r.retenue end,
         case when r.tarif is null or r.comptes_payes = 0 then 0
              else greatest(r.tarif * r.comptes_payes - r.retenue, 0) end,
         case when cardinality(r.liste) > 0 then 'a_voir' else 'ok' end,
         nullif(array_to_string(r.liste, ' · '), '')
    from raisons r;
$$;

-- L'admin (pas le Head of Ops), le cron et le service seulement.
create or replace function public.paie_droit_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role(), '') not in ('anon', 'authenticated') or public.is_admin_strict();
$$;

-- ---------------------------------------------------------------------------
-- Génération (idempotente, ne touche jamais une ligne payée)
-- ---------------------------------------------------------------------------
create or replace function public.paie_generer(p_lundi date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not public.paie_droit_admin() then
    raise exception 'paie_generer : réservé à l''admin';
  end if;
  if extract(isodow from p_lundi) <> 1 then
    raise exception 'paie_generer : % n''est pas un lundi', p_lundi;
  end if;

  insert into public.paie_semaines as ps
    (poster_id, semaine, nb_comptes, comptes_payes, prevus, faits, manques,
     tarif, retenue, montant, statut, raison, calcule_at)
  select c.poster_id, p_lundi, c.nb_comptes, c.comptes_payes, c.prevus, c.faits, c.manques,
         c.tarif, c.retenue, c.montant, c.statut, c.raison, now()
    from public.paie_calculer(p_lundi) c
  on conflict (poster_id, semaine) do update
     set nb_comptes = excluded.nb_comptes,
         comptes_payes = excluded.comptes_payes,
         prevus = excluded.prevus,
         faits = excluded.faits,
         manques = excluded.manques,
         tarif = excluded.tarif,
         retenue = excluded.retenue,
         montant = excluded.montant,
         statut = excluded.statut,
         raison = excluded.raison,
         calcule_at = excluded.calcule_at
   where ps.paye_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Le cron : le lundi, à 6 h de Paris, la semaine qui vient de finir.
create or replace function public.paie_generer_lundi()
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
  return public.paie_generer(paris::date - 7);
end;
$$;

-- ---------------------------------------------------------------------------
-- Actions de la HM et de l'admin
-- ---------------------------------------------------------------------------
-- Admin, ou HM du posteur.
create or replace function public.paie_droit_posteur(p_poster uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
      or exists (select 1 from public.profiles p where p.id = p_poster and p.manager_id = auth.uid());
$$;

-- « Payé » (ou retour en arrière d'un clic de trop).
create or replace function public.paie_marquer_payee(p_id uuid, p_paye boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poster uuid;
begin
  select poster_id into v_poster from public.paie_semaines where id = p_id;
  if v_poster is null then
    raise exception 'paie : ligne introuvable';
  end if;
  if not public.paie_droit_posteur(v_poster) then
    raise exception 'paie : réservé à l''admin et à la HM du posteur';
  end if;
  update public.paie_semaines
     set paye_at = case when p_paye then now() end,
         paye_par = case when p_paye then auth.uid() end
   where id = p_id;
end;
$$;

-- Le lien du contrat Upwork, collé par la HM (ou l'admin).
create or replace function public.paie_enregistrer_contrat(p_poster uuid, p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.paie_droit_posteur(p_poster) then
    raise exception 'paie : réservé à l''admin et à la HM du posteur';
  end if;
  if p_url is null or btrim(p_url) !~* '^https://([a-z0-9-]+\.)*upwork\.com/' then
    raise exception 'Lien Upwork attendu (https://www.upwork.com/…)';
  end if;
  update public.profiles set upwork_contrat_url = btrim(p_url) where id = p_poster;
end;
$$;

-- Le tarif hebdo d'un posteur : l'admin seulement (pas le Head of Ops).
create or replace function public.paie_modifier_tarif(p_poster uuid, p_tarif numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_strict() then
    raise exception 'paie : tarif modifiable par l''admin seulement';
  end if;
  if p_tarif is not null and p_tarif < 0 then
    raise exception 'paie : tarif négatif';
  end if;
  update public.profiles set tarif_hebdo = p_tarif where id = p_poster;
end;
$$;

revoke execute on function public.paie_calculer(date) from public, anon;
revoke execute on function public.paie_generer(date) from public, anon;
revoke execute on function public.paie_generer_lundi() from public, anon, authenticated;
grant execute on function public.paie_calculer(date) to service_role;
grant execute on function public.paie_generer(date) to authenticated, service_role;
grant execute on function public.paie_generer_lundi() to service_role;
grant execute on function public.paie_marquer_payee(uuid, boolean) to authenticated;
grant execute on function public.paie_enregistrer_contrat(uuid, text) to authenticated;
grant execute on function public.paie_modifier_tarif(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Le cron du lundi : 4 h et 5 h UTC, la fonction ne garde que 6 h à Paris
-- (été comme hiver). Idempotent : deux passages ne paient rien deux fois.
-- ---------------------------------------------------------------------------
do $paie$
begin
  if exists (select 1 from cron.job where jobname = 'paie-lundi') then
    perform cron.unschedule('paie-lundi');
  end if;
  perform cron.schedule('paie-lundi', '0 4,5 * * 1', 'select public.paie_generer_lundi()');
end
$paie$;

notify pgrst, 'reload schema';
