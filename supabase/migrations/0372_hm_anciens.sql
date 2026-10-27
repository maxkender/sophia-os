-- 0372 : « Anciens posteurs » sur le dashboard HM (point E, 27/10).
--
-- Les comptes qui ont fini leur première semaine de posts (premier post avant
-- le lundi de cette semaine), actifs, avec au moins un post prévu sur les 15
-- derniers jours. Pour chacun : ses posts des 15 derniers jours (aujourd'hui
-- compris : 14 jours d'historique et la semaine d'avant pour la baisse) et son diagnostic des 7 derniers jours jusqu'à hier, calculé par
-- `ckd_diagnostic` (0362) avec la médiane du pays de `hm_mediane_pays` (0370).
-- Les groupes de problèmes se font dans l'interface.
--
-- Même cloisonnement que `hm_calendrier` : une HM ne voit que ses posteurs ;
-- admin et Head of Ops : tout, ou la HM demandée. RUUL exclu.
--
-- Additive : une fonction en lecture seule. Aucune table, aucune donnée
-- touchée. Retour arrière : drop function public.hm_anciens(uuid);

create or replace function public.hm_anciens(p_hm uuid default null)
returns table (
  compte_id    uuid,
  poster_id    uuid,
  hm_id        uuid,
  handle       text,
  pays         text,
  premier_jour date,
  warmup_lance boolean,
  seuil_mort   numeric,
  mediane_pays numeric,
  -- [{jour, rang, url, vues, publie_at, mesure}] des 15 derniers jours.
  posts        jsonb,
  -- Le diagnostic des 7 derniers jours, jusqu'à hier.
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
  v_lundi date := (now() at time zone 'Europe/Paris')::date
                  - (extract(isodow from (now() at time zone 'Europe/Paris')::date)::int - 1);
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    if not public.is_hiring_manager() then
      raise exception 'hm_anciens : réservé à l''admin et aux HMs';
    end if;
    v_hm := auth.uid();
  end if;

  return query
  with
  med as (select * from public.hm_mediane_pays(v_auj - 1)),
  cpt as (
    select c.id as compte_id, c.poster_id, pr.manager_id as hm_id, c.handle_tiktok, c.pays,
           pj.premier_jour, c.warmup_started_at is not null as warmup_lance,
           coalesce((select (r.valeur #>> '{}')::numeric
                       from public.ckd_reglage('seuil_mort', c.pays, l.label_id) r), 50) as seuil_mort,
           coalesce(mp.mediane, mf.mediane) as mediane_pays,
           exists (select 1 from public.ckd_shadowban s
                    where s.compte_id = c.id and s.type = 'shadowban' and s.recreation_at is null) as signale
      from public.comptes c
      join public.profiles pr on pr.id = c.poster_id
      join public.comptes_premier_jour pj on pj.compte_id = c.id
      cross join lateral (
        select (select cl.label_id from public.compte_labels cl
                  where cl.compte_id = c.id order by cl.label_id limit 1) as label_id
      ) l
      left join med mp on mp.pays = c.pays
      left join med mf on mf.pays is null
     where c.is_active
       and coalesce(pr.is_active, true)
       and c.type_compte = 'perso'
       and not coalesce(c.ugc_ai_video, false)
       and not coalesce(c.videos_uniquement, false)
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)
       and pj.premier_jour < v_lundi
       and (v_hm is null or pr.manager_id = v_hm)
  ),
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
       and x.date_publication_prevue between v_auj - 14 and v_auj
  ),
  -- La période du diagnostic : les 7 derniers jours, jusqu'à hier.
  per as (
    select p.compte_id,
           count(*) filter (where p.jour >= v_auj - 7 and p.jour < v_auj)::int as attendus,
           count(*) filter (where p.jour >= v_auj - 7 and p.jour < v_auj and p.url is not null)::int as publies,
           count(*) filter (where p.jour >= v_auj - 7 and p.jour < v_auj and p.mesure
                              and p.vues < c.seuil_mort)::int as morts,
           percentile_cont(0.5) within group (order by p.vues)
             filter (where p.jour >= v_auj - 7 and p.jour < v_auj and p.mesure) as mediane,
           coalesce(jsonb_agg(jsonb_build_object('jour', p.jour))
                      filter (where p.jour >= v_auj - 7 and p.jour < v_auj and p.url is null), '[]'::jsonb)
             as liens_manquants
      from px p join cpt c on c.compte_id = p.compte_id
     group by p.compte_id
  )
  select c.compte_id, c.poster_id, c.hm_id, c.handle_tiktok, c.pays, c.premier_jour, c.warmup_lance,
         c.seuil_mort, c.mediane_pays,
         (select jsonb_agg(jsonb_build_object(
                   'jour', p.jour, 'rang', p.rang, 'url', p.url, 'vues', p.vues,
                   'publie_at', p.publie_at, 'mesure', p.mesure)
                 order by p.jour, p.rang)
            from px p where p.compte_id = c.compte_id),
         public.ckd_diagnostic(jsonb_build_object(
           'periode', jsonb_build_object(
             'attendus', r.attendus, 'publies', r.publies, 'morts', r.morts,
             'mediane', round(r.mediane::numeric), 'liens_manquants', r.liens_manquants,
             -- Les 4 derniers posts mesurés à 48 h ou plus : sur les 15 jours.
             'posts', coalesce((
               select jsonb_agg(jsonb_build_object('jour', p.jour, 'vues', p.vues, 'mesure', p.mesure, 'age_h', p.age_h))
                 from px p where p.compte_id = c.compte_id and p.jour < v_auj), '[]'::jsonb)),
           'mediane_ref', jsonb_build_object('valeur', c.mediane_pays),
           'seuil_mort', c.seuil_mort,
           'shadowban', case when c.signale then true end))
    from cpt c
    join per r on r.compte_id = c.compte_id;
end;
$$;

revoke execute on function public.hm_anciens(uuid) from public, anon;
grant execute on function public.hm_anciens(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
