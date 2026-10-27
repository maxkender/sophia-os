-- 0370 : « Cette semaine » en calendrier, sur le dashboard HM (point C, 27/10).
--
-- Une ligne par compte de la cohorte qui fait sa première semaine de posts
-- (`ckd_cohorte_comptes`, RUUL déjà exclu), ses posts du lundi au dimanche,
-- et son diagnostic de la semaine en 3 lignes, calculé par la même fonction
-- que Check, Kill or Double (`ckd_diagnostic`, 0362).
--
--   hm_mediane_pays(p_fin) : la médiane des vues par pays, sur les posts
--     mesurés des 28 jours qui finissent `p_fin` (comptes perso). Un pays de
--     moins de 5 comptes prend la médiane de toute la flotte (ligne pays null).
--   hm_calendrier(p_lundi, p_hm) : le calendrier. Une HM ne voit que ses
--     posteurs (p_hm ignoré) ; l'admin et le Head of Ops (is_admin) voient
--     tout, ou une HM avec p_hm.
--
-- Additive : deux fonctions en lecture seule. Aucune table, aucune donnée
-- touchée. Retour arrière :
--   drop function public.hm_calendrier(date, uuid);
--   drop function public.hm_mediane_pays(date);

create or replace function public.hm_mediane_pays(p_fin date)
returns table (pays text, mediane numeric, n_comptes integer)
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select c.id as compte_id, c.pays, x.vues
      from public.passages x
      join public.comptes c on c.id = x.compte_id
     where c.type_compte = 'perso'
       and not coalesce(x.est_rappel, false)
       and x.statut <> 'brouillon'
       and x.date_publication_prevue between p_fin - 27 and p_fin
       -- Mesuré : vues relevées 10 h ou plus après la publication (âge
       -- minimum par défaut de Check, Kill or Double).
       and x.publie_url is not null and x.vues is not null and x.stats_maj_at is not null
       and x.stats_maj_at - coalesce(x.tiktok_publie_at, x.publie_at) >= interval '10 hours'
  ),
  flotte as (
    select round(percentile_cont(0.5) within group (order by m.vues))::numeric as med,
           count(distinct m.compte_id)::int as n
      from m
  ),
  par_pays as (
    select m.pays, round(percentile_cont(0.5) within group (order by m.vues))::numeric as med,
           count(distinct m.compte_id)::int as n
      from m
     where m.pays is not null
     group by m.pays
  )
  select p.pays, case when p.n >= 5 then p.med else f.med end, p.n
    from par_pays p cross join flotte f
  union all
  select null, f.med, f.n from flotte f;
$$;

revoke execute on function public.hm_mediane_pays(date) from public, anon;
grant execute on function public.hm_mediane_pays(date) to authenticated, service_role;

create or replace function public.hm_calendrier(p_lundi date, p_hm uuid default null)
returns table (
  compte_id    uuid,
  poster_id    uuid,
  hm_id        uuid,
  handle       text,
  pays         text,
  langue       text,
  is_active    boolean,
  warmup_lance boolean,
  seuil_mort   numeric,
  mediane_pays numeric,
  -- [{jour, rang, url, vues, publie_at, mesure}] du lundi au dimanche.
  posts        jsonb,
  -- Le diagnostic de la semaine (forme de `ckd_diagnostic`), jusqu'à hier.
  diagnostic   jsonb
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
begin
  -- Admin et Head of Ops (is_admin) : tout, ou la HM demandée. HM / DM : ses posteurs.
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    if not public.is_hiring_manager() then
      raise exception 'hm_calendrier : réservé à l''admin et aux HMs';
    end if;
    v_hm := auth.uid();
  end if;
  if extract(isodow from p_lundi) <> 1 then
    raise exception 'hm_calendrier : % n''est pas un lundi', p_lundi;
  end if;

  return query
  with
  med as (select * from public.hm_mediane_pays(least(v_auj - 1, p_lundi + 6))),
  cpt as (
    select m.compte_id, c.poster_id, pr.manager_id as hm_id, c.handle_tiktok, c.pays, c.langue,
           c.is_active, c.warmup_started_at is not null as warmup_lance,
           coalesce((select (r.valeur #>> '{}')::numeric
                       from public.ckd_reglage('seuil_mort', c.pays, l.label_id) r), 50) as seuil_mort,
           coalesce(mp.mediane, mf.mediane) as mediane_pays,
           exists (select 1 from public.ckd_shadowban s
                    where s.compte_id = c.id and s.type = 'shadowban' and s.recreation_at is null) as signale
      from public.ckd_cohorte_comptes(p_lundi) m
      join public.comptes c on c.id = m.compte_id
      join public.profiles pr on pr.id = c.poster_id
      cross join lateral (
        select (select cl.label_id from public.compte_labels cl
                  where cl.compte_id = c.id order by cl.label_id limit 1) as label_id
      ) l
      left join med mp on mp.pays = c.pays
      left join med mf on mf.pays is null
     where v_hm is null or pr.manager_id = v_hm
  ),
  -- Les posts de la semaine, et ceux de la semaine d'avant pour le test du
  -- shadowban (les 4 derniers posts mesurés à 48 h ou plus).
  px as (
    select x.compte_id, x.date_publication_prevue as jour, x.publie_url as url, x.vues,
           coalesce(x.tiktok_publie_at, x.publie_at) as publie_at,
           row_number() over (partition by x.compte_id, x.date_publication_prevue
                              order by coalesce(x.tiktok_publie_at, x.publie_at, x.created_at), x.created_at) as rang,
           (x.publie_url is not null and x.vues is not null and x.stats_maj_at is not null
             and x.stats_maj_at - coalesce(x.tiktok_publie_at, x.publie_at) >= interval '10 hours') as mesure,
           extract(epoch from (now() - coalesce(x.tiktok_publie_at, x.publie_at))) / 3600 as age_h
      from public.passages x
      join cpt c on c.compte_id = x.compte_id
     where not coalesce(x.est_rappel, false)
       and x.statut <> 'brouillon'
       and x.date_publication_prevue between p_lundi - 7 and p_lundi + 6
  ),
  -- La période du diagnostic : la semaine, jusqu'à hier (aujourd'hui est en cours).
  per as (
    select c.compte_id,
           count(p.*) filter (where p.jour < v_auj)::int as attendus,
           count(p.*) filter (where p.jour < v_auj and p.url is not null)::int as publies,
           count(p.*) filter (where p.jour < v_auj and p.mesure and p.vues < c.seuil_mort)::int as morts,
           percentile_cont(0.5) within group (order by p.vues) filter (where p.jour < v_auj and p.mesure) as mediane,
           coalesce(jsonb_agg(jsonb_build_object('jour', p.jour))
                      filter (where p.jour < v_auj and p.url is null), '[]'::jsonb) as liens_manquants
      from cpt c
      left join px p on p.compte_id = c.compte_id and p.jour >= p_lundi
     group by c.compte_id
  )
  select c.compte_id, c.poster_id, c.hm_id, c.handle_tiktok, c.pays, c.langue, c.is_active,
         c.warmup_lance, c.seuil_mort, c.mediane_pays,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'jour', p.jour, 'rang', p.rang, 'url', p.url, 'vues', p.vues,
                    'publie_at', p.publie_at, 'mesure', p.mesure)
                  order by p.jour, p.rang)
             from px p where p.compte_id = c.compte_id and p.jour >= p_lundi), '[]'::jsonb),
         public.ckd_diagnostic(jsonb_build_object(
           'periode', jsonb_build_object(
             'attendus', r.attendus, 'publies', r.publies, 'morts', r.morts,
             'mediane', round(r.mediane::numeric), 'liens_manquants', r.liens_manquants,
             'posts', coalesce((
               select jsonb_agg(jsonb_build_object('jour', p.jour, 'vues', p.vues, 'mesure', p.mesure, 'age_h', p.age_h))
                 from px p where p.compte_id = c.compte_id and p.jour < v_auj), '[]'::jsonb)),
           'mediane_ref', jsonb_build_object('valeur', c.mediane_pays),
           'seuil_mort', c.seuil_mort,
           -- Signalé par la page Shadowban : shadowban, sans attendre les 4 posts.
           'shadowban', case when c.signale then true end))
    from cpt c
    join per r on r.compte_id = c.compte_id;
end;
$$;

revoke execute on function public.hm_calendrier(date, uuid) from public, anon;
grant execute on function public.hm_calendrier(date, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
