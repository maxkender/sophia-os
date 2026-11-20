-- 0794 : Comment Masters dans toutes les langues, recrutement automatique (Max, 20/11). Additif ; ne touche qu'au
-- système Comment Master et à la paie de ses bonus.
-- 1. comment_master_suppleants : le suppléant d'une langue (un ouvert au plus). Il est dans le salon Slack et ses
--    commentaires sont payés comme ceux du titulaire.
-- 2. comment_master_candidats(langue) : les posteurs actifs de la langue, au moins 2 semaines d'ancienneté, au moins
--    85 % de posts faits sur 14 jours, aucun problème ouvert, Slack relié, pas déjà Comment Master ni déjà sollicité ;
--    classés par régularité puis vues médianes.
-- 3. comment_master_offres : une proposition (titulaire ou suppléant) à un posteur, montrée en pop-up à sa prochaine
--    connexion, dans sa langue (texte traduit par la fonction comment-masters). Accepter → installation par la
--    fonction (mandat, salon Slack, région active) ; « Non merci » → le candidat suivant.
-- 4. cm_demandes_toutes : un Done fait par le suppléant de la langue compte pour lui (et il est payé).

-- 1.
create table if not exists public.comment_master_suppleants (
  id         uuid primary key default gen_random_uuid(),
  langue     text not null references public.comment_master_regions (langue) on update cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  nom        text not null,
  debut      timestamptz not null default now(),
  fin        timestamptz,
  check (fin is null or fin >= debut)
);
create unique index if not exists comment_master_suppleants_ouvert on public.comment_master_suppleants (langue) where fin is null;
alter table public.comment_master_suppleants enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'comment_master_suppleants' and policyname = 'comment_master_suppleants_admin') then
    create policy comment_master_suppleants_admin on public.comment_master_suppleants for select to authenticated using (public.is_admin());
  end if;
end $$;

-- 3. (avant 2 : les candidats excluent les posteurs déjà sollicités)
create table if not exists public.comment_master_offres (
  id           uuid primary key default gen_random_uuid(),
  langue       text not null references public.comment_master_regions (langue) on update cascade,
  role         text not null check (role in ('titulaire', 'suppleant')),
  profile_id   uuid not null references public.profiles (id),
  nom          text not null,
  rang         integer,
  zone         text,
  tarif        numeric,
  langue_texte text,
  textes       jsonb,
  statut       text not null default 'a_preparer'
                 check (statut in ('a_preparer', 'envoye', 'accepte', 'installe', 'refuse', 'annule', 'erreur')),
  erreur       text,
  cree_at      timestamptz not null default now(),
  envoye_at    timestamptz,
  vu_at        timestamptz,
  repondu_at   timestamptz,
  installe_at  timestamptz
);
create unique index if not exists comment_master_offres_une_par_posteur on public.comment_master_offres (profile_id, langue, role);
create unique index if not exists comment_master_offres_ouverte on public.comment_master_offres (langue, role)
  where statut in ('a_preparer', 'envoye', 'accepte');
alter table public.comment_master_offres enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'comment_master_offres' and policyname = 'comment_master_offres_admin') then
    create policy comment_master_offres_admin on public.comment_master_offres for select to authenticated using (public.is_admin());
  end if;
end $$;

-- 2.
create or replace function public.comment_master_candidats(p_langue text)
returns table (profile_id uuid, nom text, canal_paie text, regularite integer, vues_mediane integer, posts integer, rang integer)
language sql
stable
security definer
set search_path = public
as $$
  with j as (select (now() at time zone 'Europe/Paris')::date as auj),
  cms as (
    select m.profile_id from public.comment_master_mandats m where m.fin is null and m.profile_id is not null
    union select s.profile_id from public.comment_master_suppleants s where s.fin is null and s.profile_id is not null
  ),
  c as (
    select p.id, coalesce(nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), p.email) as nom, p.canal_paie,
           (select min(pa.date_publication_prevue) from public.passages pa join public.comptes x on x.id = pa.compte_id
             where x.poster_id = p.id and pa.publie_url is not null) as premier,
           count(pa.*) filter (where pa.date_publication_prevue between j.auj - 14 and j.auj - 1) as prevus,
           count(pa.*) filter (where pa.date_publication_prevue between j.auj - 14 and j.auj - 1 and pa.publie_url is not null) as faits,
           percentile_cont(0.5) within group (order by pa.vues)
             filter (where pa.date_publication_prevue between j.auj - 16 and j.auj - 2 and pa.vues is not null) as med
      from public.comptes co cross join j
      join public.profiles p on p.id = co.poster_id and p.is_active and p.slack_user_id is not null
      join public.user_roles ur on ur.user_id = p.id and ur.role = 'poster'
      left join public.passages pa on pa.compte_id = co.id
     where co.langue = p_langue and co.is_active and coalesce(co.type_compte, 'perso') = 'perso'
       and p.id not in (select cms.profile_id from cms)
       and not exists (select 1 from public.comment_master_offres o where o.profile_id = p.id)
       and not exists (select 1 from public.problemes pr where pr.poster_id = p.id and pr.statut = 'ouvert')
     group by p.id, p.prenom, p.nom, p.email, p.canal_paie
  )
  select c.id, c.nom, c.canal_paie, round(100.0 * c.faits / c.prevus)::int, round(c.med)::int, c.prevus::int,
         (row_number() over (order by c.faits::numeric / c.prevus desc, c.med desc nulls last))::int
    from c cross join j
   where c.premier <= j.auj - 14 and c.prevus >= 7 and c.faits::numeric / c.prevus >= 0.85
   order by 7;
$$;
revoke all on function public.comment_master_candidats(text) from public, anon;
grant execute on function public.comment_master_candidats(text) to authenticated, service_role;

/** Les langues d'au moins 8 comptes actifs (posteurs actifs). */
create or replace function public.comment_master_langues_cibles()
returns table (langue text, comptes integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.langue, count(*)::int from public.comptes c join public.profiles p on p.id = c.poster_id and p.is_active
   where c.is_active and c.langue is not null group by c.langue having count(*) >= 8;
$$;
revoke all on function public.comment_master_langues_cibles() from public, anon;
grant execute on function public.comment_master_langues_cibles() to authenticated, service_role;

/** La prochaine offre d'une langue et d'un rôle (le meilleur candidat restant) ; rien si plus personne. */
create or replace function public.comment_master_offre_suivante(p_langue text, p_role text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c record;
  v_id uuid;
begin
  if exists (select 1 from public.comment_master_offres where langue = p_langue and role = p_role and statut in ('a_preparer', 'envoye', 'accepte')) then
    return null;
  end if;
  select * into v_c from public.comment_master_candidats(p_langue) limit 1;
  if v_c.profile_id is null then return null; end if;
  insert into public.comment_master_offres (langue, role, profile_id, nom, rang, zone, tarif, langue_texte)
  select p_langue, p_role, v_c.profile_id, v_c.nom, v_c.rang, t.zone, t.tarif, p_langue
    from public.bonus_cm_tarif(v_c.profile_id) t
  on conflict do nothing
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.comment_master_offre_suivante(text, text) from public, anon, authenticated;
grant execute on function public.comment_master_offre_suivante(text, text) to service_role;

/** Lancer (au clic de Max) : pour chaque langue cible, une offre titulaire s'il en manque un, puis une suppléant. */
create or replace function public.comment_master_recrutement_lancer()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
  n integer := 0;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then raise exception 'réservé à l''admin'; end if;
  for l in select x.langue from public.comment_master_langues_cibles() x order by x.comptes desc loop
    insert into public.comment_master_regions (langue, region, actif) values (l.langue, l.langue, false) on conflict (langue) do nothing;
    if not exists (select 1 from public.comment_master_regions r where r.langue = l.langue and r.actif and r.comment_master_id is not null) then
      if public.comment_master_offre_suivante(l.langue, 'titulaire') is not null then n := n + 1; end if;
    end if;
    if not exists (select 1 from public.comment_master_suppleants s where s.langue = l.langue and s.fin is null) then
      if public.comment_master_offre_suivante(l.langue, 'suppleant') is not null then n := n + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'offres', n);
end;
$$;
revoke all on function public.comment_master_recrutement_lancer() from public, anon;
grant execute on function public.comment_master_recrutement_lancer() to authenticated, service_role;

/** Pour le posteur connecté : son offre envoyée (un pop-up). */
create or replace function public.comment_master_offre_mienne()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', o.id, 'langue', o.langue, 'role', o.role, 'tarif', o.tarif, 'textes', o.textes, 'langue_texte', o.langue_texte)
    from public.comment_master_offres o
   where o.profile_id = auth.uid() and o.statut = 'envoye' and o.textes is not null
   order by o.envoye_at limit 1;
$$;
revoke all on function public.comment_master_offre_mienne() from public, anon;
grant execute on function public.comment_master_offre_mienne() to authenticated;

create or replace function public.comment_master_offre_vue(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.comment_master_offres set vu_at = coalesce(vu_at, now()) where id = p_id and profile_id = auth.uid();
$$;
revoke all on function public.comment_master_offre_vue(uuid) from public, anon;
grant execute on function public.comment_master_offre_vue(uuid) to authenticated;

/** « Accept » : installé par la fonction comment-masters. « No thanks » : le candidat suivant. */
create or replace function public.comment_master_offre_repondre(p_id uuid, p_accepte boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.comment_master_offres;
begin
  select * into o from public.comment_master_offres where id = p_id and profile_id = auth.uid() for update;
  if o.id is null or o.statut <> 'envoye' then return jsonb_build_object('ok', false); end if;
  update public.comment_master_offres set statut = case when p_accepte then 'accepte' else 'refuse' end, repondu_at = now()
   where id = p_id;
  if not p_accepte then perform public.comment_master_offre_suivante(o.langue, o.role); end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.comment_master_offre_repondre(uuid, boolean) from public, anon;
grant execute on function public.comment_master_offre_repondre(uuid, boolean) to authenticated;

/** Page Comment Masters : les offres (admin). */
create or replace function public.comment_master_offres_lire()
returns table (id uuid, langue text, role text, nom text, rang integer, zone text, tarif numeric, statut text, erreur text,
               cree_at timestamptz, envoye_at timestamptz, vu_at timestamptz, repondu_at timestamptz, installe_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.langue, o.role, o.nom, o.rang, o.zone, o.tarif, o.statut, o.erreur, o.cree_at, o.envoye_at, o.vu_at, o.repondu_at, o.installe_at
    from public.comment_master_offres o
   where public.is_admin()
   order by o.langue, o.role, o.cree_at;
$$;
revoke all on function public.comment_master_offres_lire() from public, anon;
grant execute on function public.comment_master_offres_lire() to authenticated;

-- 4. Le Done du suppléant compte pour lui (même tarif par commentaire que le titulaire).
do $$
declare
  d text := pg_get_functiondef('public.cm_demandes_toutes(date, date)'::regprocedure);
  avant_sel text := 'm.profile_id, m.nom, s.slack_user_id is not null,
         x.autre, d.autre_valide_at,
         d.fait_at is not null and (not x.autre or d.autre_valide_at is not null)';
  apres_sel text := 'coalesce(sup.profile_id, m.profile_id), coalesce(sup.nom, m.nom), s.slack_user_id is not null,
         x.autre and sup.profile_id is null, d.autre_valide_at,
         d.fait_at is not null and (sup.profile_id is not null or not x.autre or d.autre_valide_at is not null)';
  avant_join text := '    left join public.comment_master_slack s on s.profile_id = m.profile_id';
  apres_join text := '    left join public.comment_master_slack s on s.profile_id = m.profile_id
    left join lateral (
      select su.profile_id, su.nom from public.comment_master_suppleants su
        join public.comment_master_slack ss on ss.profile_id = su.profile_id
       where su.langue = d.langue and d.fait_at is not null
         and d.envoye_at >= su.debut and (su.fin is null or d.envoye_at < su.fin)
         and (coalesce(d.fait_slack_id, '''') = ss.slack_user_id
              or lower(coalesce(d.fait_par, '''')) in (lower(ss.slack_user_id), lower(coalesce(ss.slack_name, ''''))))
       limit 1
    ) sup on true';
begin
  if position('comment_master_suppleants' in d) > 0 then return; end if;
  if position(avant_sel in d) = 0 or position(avant_join in d) = 0 then raise exception '0794 : cm_demandes_toutes a changé'; end if;
  execute replace(replace(d, avant_sel, apres_sel), avant_join, apres_join);
end $$;

notify pgrst, 'reload schema';
