-- 0375 : l'export du dashboard HM (CSV et « Copier pour Claude », 27/10).
--
-- `hm_export_donnees(p_debut, p_fin, p_hm)` : une ligne par compte des
-- posteurs de la HM (comptes actifs, la cohorte de lundi prochain comprise),
-- avec ses posts de la période élargie (14 jours en arrière, la semaine à
-- venir), ses relevés de warm-up, son diagnostic des 7 derniers jours (même
-- calcul que `hm_anciens`, 0372) et la décision Check, Kill or Double de la
-- semaine. Les colonnes et les mots sont faits dans l'appli, avec les mêmes
-- fonctions que le dashboard.
--
-- Sécurité : même cloisonnement que le dashboard (une HM : ses posteurs ;
-- admin et Head of Ops : tout, ou la HM demandée). RUUL exclu. Aucun email,
-- login ni email perso n'est rendu. Chaque export est journalisé
-- (`exports_hm`, via `hm_export_journaliser`).
--
-- Additive : une table, deux fonctions. Aucune donnée existante modifiée.
-- Retour arrière :
--   drop function public.hm_export_donnees(date, date, uuid),
--     public.hm_export_journaliser(uuid, text, text, text, text[], integer, text);
--   drop table public.exports_hm;

create table if not exists public.exports_hm (
  id         uuid primary key default gen_random_uuid(),
  par        uuid not null,
  hm_id      uuid,
  bloc       text not null,
  periode    text not null,
  niveau     text not null,
  colonnes   text[] not null default '{}',
  lignes     integer not null default 0,
  format     text not null check (format in ('csv', 'claude')),
  created_at timestamptz not null default now()
);

alter table public.exports_hm enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'exports_hm'
                  and policyname = 'exports_hm lecture admin') then
    create policy "exports_hm lecture admin" on public.exports_hm
      for select to authenticated using ((select public.is_admin()));
  end if;
end $$;
revoke all on public.exports_hm from public, anon, authenticated;
grant select on public.exports_hm to authenticated;
grant all on public.exports_hm to service_role;

create or replace function public.hm_export_journaliser(
  p_hm uuid, p_bloc text, p_periode text, p_niveau text, p_colonnes text[], p_lignes integer, p_format text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'hm_export_journaliser : connexion requise';
  end if;
  if not public.is_admin() and not public.is_hiring_manager() then
    raise exception 'hm_export_journaliser : réservé à l''admin et aux HMs';
  end if;
  insert into public.exports_hm (par, hm_id, bloc, periode, niveau, colonnes, lignes, format)
  values (auth.uid(), case when public.is_admin() then p_hm else auth.uid() end,
          p_bloc, p_periode, p_niveau, coalesce(p_colonnes, '{}'), coalesce(p_lignes, 0), p_format);
end;
$$;

revoke execute on function public.hm_export_journaliser(uuid, text, text, text, text[], integer, text) from public, anon;
grant execute on function public.hm_export_journaliser(uuid, text, text, text, text[], integer, text) to authenticated;

create or replace function public.hm_export_donnees(p_debut date, p_fin date, p_hm uuid default null)
returns table (
  compte_id         uuid,
  poster_id         uuid,
  hm_id             uuid,
  hm_prenom         text,
  hm_zone           text,
  poster_nom        text,
  pays              text,
  langue            text,
  handle            text,
  comptes_actifs    integer,
  upwork_contrat_url text,
  is_active         boolean,
  premier_jour      date,
  cree_le           timestamptz,
  warmup_started_at timestamptz,
  warmup_ends_at    timestamptz,
  reposts_le        timestamptz,
  tiktok_existe     boolean,
  tiktok_cree_le    timestamptz,
  follows           integer,
  likes             integer,
  seuil_mort        numeric,
  mediane_pays      numeric,
  -- [{jour, rang, url, vues, likes, publie_at, stats_maj_at, mesure}]
  posts             jsonb,
  diagnostic        jsonb,
  -- La décision Check, Kill or Double de la semaine : {regle, action, decision, fait_at}.
  decision          jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_hm uuid := p_hm;
  v_auj date := (now() at time zone 'Europe/Paris')::date;
  v_lundi date := (now() at time zone 'Europe/Paris')::date
                  - (extract(isodow from (now() at time zone 'Europe/Paris')::date)::int - 1);
  v_de date;
  v_a date;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    if not public.is_hiring_manager() then
      raise exception 'hm_export_donnees : réservé à l''admin et aux HMs';
    end if;
    v_hm := auth.uid();
  end if;
  if p_fin < p_debut or p_fin - p_debut > 62 then
    raise exception 'hm_export_donnees : période invalide (% → %)', p_debut, p_fin;
  end if;
  v_de := least(p_debut, v_auj - 14);
  v_a := greatest(p_fin, v_auj + 6);

  return query
  with
  med as (select * from public.hm_mediane_pays(v_auj - 1)),
  cpt as (
    select c.id as compte_id, c.poster_id, pr.manager_id as hm_id,
           hm.prenom as hm_prenom, hm.zone_recrutement as hm_zone,
           nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), '') as poster_nom,
           c.pays, c.langue, c.handle_tiktok, pr.upwork_contrat_url, c.is_active,
           pj.premier_jour, c.created_at, c.warmup_started_at, c.warmup_ends_at, c.warmup_reposts_at,
           (select count(*)::int from public.comptes c2
             where c2.poster_id = c.poster_id and c2.is_active and c2.type_compte = 'perso') as comptes_actifs,
           coalesce((select (r.valeur #>> '{}')::numeric
                       from public.ckd_reglage('seuil_mort', c.pays, l.label_id) r), 50) as seuil_mort,
           coalesce(mp.mediane, mf.mediane) as mediane_pays,
           exists (select 1 from public.ckd_shadowban s
                    where s.compte_id = c.id and s.type = 'shadowban' and s.recreation_at is null) as signale
      from public.comptes c
      join public.profiles pr on pr.id = c.poster_id
      left join public.profiles hm on hm.id = pr.manager_id
      left join public.comptes_premier_jour pj on pj.compte_id = c.id
      cross join lateral (
        select (select cl.label_id from public.compte_labels cl
                  where cl.compte_id = c.id order by cl.label_id limit 1) as label_id
      ) l
      left join med mp on mp.pays = c.pays
      left join med mf on mf.pays is null
     where c.type_compte = 'perso'
       and not coalesce(c.ugc_ai_video, false)
       and not coalesce(c.videos_uniquement, false)
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)
       and coalesce(pr.is_active, true)
       and (c.is_active or c.id in (select m.compte_id from public.hm_comptes_semaine(v_lundi + 7) m))
       and (v_hm is null or pr.manager_id = v_hm)
  ),
  px as (
    select x.compte_id, x.date_publication_prevue as jour, x.publie_url as url, x.vues, x.likes,
           coalesce(x.tiktok_publie_at, x.publie_at) as publie_at, x.stats_maj_at,
           row_number() over (partition by x.compte_id, x.date_publication_prevue
                              order by coalesce(x.tiktok_publie_at, x.publie_at, x.created_at), x.created_at) as rang,
           (x.publie_url is not null and x.vues is not null and x.stats_maj_at is not null
             and x.stats_maj_at - coalesce(x.tiktok_publie_at, x.publie_at) >= interval '10 hours') as mesure,
           extract(epoch from (now() - coalesce(x.tiktok_publie_at, x.publie_at))) / 3600 as age_h
      from public.passages x
      join cpt c on c.compte_id = x.compte_id
     where not coalesce(x.est_rappel, false)
       and x.statut <> 'brouillon'
       and x.date_publication_prevue between v_de and v_a
  ),
  per as (
    select c.compte_id,
           count(p.*) filter (where p.jour >= v_auj - 7 and p.jour < v_auj)::int as attendus,
           count(p.*) filter (where p.jour >= v_auj - 7 and p.jour < v_auj and p.url is not null)::int as publies,
           count(p.*) filter (where p.jour >= v_auj - 7 and p.jour < v_auj and p.mesure
                                and p.vues < c.seuil_mort)::int as morts,
           percentile_cont(0.5) within group (order by p.vues)
             filter (where p.jour >= v_auj - 7 and p.jour < v_auj and p.mesure) as mediane,
           coalesce(jsonb_agg(jsonb_build_object('jour', p.jour))
                      filter (where p.jour >= v_auj - 7 and p.jour < v_auj and p.url is null), '[]'::jsonb)
             as liens_manquants
      from cpt c left join px p on p.compte_id = c.compte_id
     group by c.compte_id
  ),
  rel as (
    select r.compte_id,
           bool_or(r.existe) filter (where r.existe is not null) as existe,
           min(r.cree_tiktok_at) as cree_tiktok_at,
           max(r.abonnements) filter (where r.existe) as follows,
           max(r.likes) filter (where r.existe) as likes
      from public.ckd_warmup_releves r
      join cpt c on c.compte_id = r.compte_id
     group by r.compte_id
  )
  select c.compte_id, c.poster_id, c.hm_id, c.hm_prenom, c.hm_zone, c.poster_nom, c.pays, c.langue,
         c.handle_tiktok, c.comptes_actifs, c.upwork_contrat_url, c.is_active, c.premier_jour, c.created_at,
         c.warmup_started_at, c.warmup_ends_at, c.warmup_reposts_at,
         rel.existe, rel.cree_tiktok_at, rel.follows, rel.likes, c.seuil_mort, c.mediane_pays,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'jour', p.jour, 'rang', p.rang, 'url', p.url, 'vues', p.vues, 'likes', p.likes,
                     'publie_at', p.publie_at, 'stats_maj_at', p.stats_maj_at, 'mesure', p.mesure)
                   order by p.jour, p.rang)
                     from px p where p.compte_id = c.compte_id), '[]'::jsonb),
         public.ckd_diagnostic(jsonb_build_object(
           'periode', jsonb_build_object(
             'attendus', r.attendus, 'publies', r.publies, 'morts', r.morts,
             'mediane', round(r.mediane::numeric), 'liens_manquants', r.liens_manquants,
             'posts', coalesce((
               select jsonb_agg(jsonb_build_object('jour', p.jour, 'vues', p.vues, 'mesure', p.mesure, 'age_h', p.age_h))
                 from px p where p.compte_id = c.compte_id and p.jour < v_auj), '[]'::jsonb)),
           'mediane_ref', jsonb_build_object('valeur', c.mediane_pays),
           'seuil_mort', c.seuil_mort,
           'shadowban', case when c.signale then true end)),
         (select jsonb_build_object('regle', pp.regle, 'action', pp.action, 'decision', pp.decision,
                                    'fait_at', pp.fait_at, 'jour', pp.jour)
            from public.ckd_propositions pp
           where pp.compte_id = c.compte_id
             and pp.jour between v_lundi and v_lundi + 6
           order by pp.jour desc, pp.created_at desc
           limit 1)
    from cpt c
    join per r on r.compte_id = c.compte_id
    left join rel on rel.compte_id = c.compte_id;
end;
$$;

revoke execute on function public.hm_export_donnees(date, date, uuid) from public, anon;
grant execute on function public.hm_export_donnees(date, date, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
