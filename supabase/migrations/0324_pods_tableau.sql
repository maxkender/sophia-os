-- 0324 : le tableau de bord des podz, une seule définition pour deux lecteurs.
--
-- `select public.pods_tableau(14);` rend en JSON :
--   - `jours` : pour chacun des `p_jours` derniers jours (date de Paris de
--     `publie_at`), les posts publiés, ceux des podz, et leur part en % ;
--   - `pods` : par podz, sur 30 jours, les passages publiés, mûrs (3 jours,
--     hors rappels), les vues médianes, le % à 10 k ou plus, le meilleur post,
--     le r médian (méthode de analyse/AGENT.md), la file à valider, les
--     contenus actifs, coupés (D) et en tête (S, S+), et l'autonomie par
--     application : passages à publier (en vol + restants du cycle) au rythme
--     des 7 derniers jours, à côté de la réserve du label (0254, 0270) ;
--   - `percees` : les passages des podz à 30 k vues ou plus sur 14 jours.
--
-- Lu par Pilotage → Pods (rpc) et par le chef des podz (connecteur MCP).
-- En SQL, comme `label_reserve` : PostgREST tronquerait un calcul fait dans le
-- front (max-rows), et une seule définition sert les deux.
--
-- Rangs PAR APPLICATION : `contenus.tier` n'est que le rang Sophia (les
-- remakes du pod 6, UnSwipe seul, y sont à D par construction). Sophia se lit
-- dans `contenu_tier_etat`, les autres dans `contenu_application_tier_etat`.
--
-- Garde : un utilisateur connecté doit être admin. Le rôle de service et le
-- connecteur MCP (postgres) n'ont pas d'`auth.uid()` : ils passent. (Un test
-- sur `current_user` ne vaut rien ici : SECURITY DEFINER le fixe au
-- propriétaire.)
--
-- À appliquer APRÈS 0323 (colonnes de validation automatique).
-- Retour arrière : `drop function public.pods_tableau(integer);`

create or replace function public.pods_tableau(p_jours integer default 14)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_jours integer := greatest(1, least(coalesce(p_jours, 14), 60));
  v_aujourdhui date := (now() at time zone 'Europe/Paris')::date;
  v_tableau jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'pods_tableau : réservé aux admins' using errcode = '42501';
  end if;

  with
  jours as (
    select generate_series(v_aujourdhui - (v_jours - 1), v_aujourdhui, interval '1 day')::date as jour
  ),
  pub as (
    select (p.publie_at at time zone 'Europe/Paris')::date as jour, c.pod
    from passages p
    join contenus c on c.id = p.contenu_id
    where p.statut = 'publie'
      and p.publie_at >= ((v_aujourdhui - (v_jours - 1))::timestamp at time zone 'Europe/Paris')
  ),
  part as (
    select j.jour, count(pub.jour) as publies, count(pub.pod) as publies_pods,
      round(100.0 * count(pub.pod) / nullif(count(pub.jour), 0), 1) as part
    from jours j
    left join pub on pub.jour = j.jour
    group by j.jour
  ),
  mat as (
    select compte_id, vues
    from passages
    where statut = 'publie' and vues is not null and not coalesce(est_rappel, false)
      and publie_at between now() - interval '45 days' and now() - interval '3 days'
  ),
  med as (
    select compte_id, percentile_cont(0.5) within group (order by vues) as m
    from mat
    group by compte_id
    having count(*) >= 5
  ),
  x as (
    select p.contenu_id, p.vues, c.pod, p.publie_at, coalesce(p.est_rappel, false) as rappel,
      (p.publie_at < now() - interval '3 days' and p.vues is not null and not coalesce(p.est_rappel, false)) as mur,
      p.vues / nullif(med.m, 0) as r
    from passages p
    join contenus c on c.id = p.contenu_id and c.pod is not null
    left join med on med.compte_id = p.compte_id
    where p.statut = 'publie' and p.publie_at > now() - interval '30 days'
  ),
  stats as (
    select x.pod,
      count(*) as publies_30j,
      count(*) filter (where x.mur) as mures,
      (percentile_cont(0.5) within group (order by x.vues) filter (where x.mur))::int as vues_mediane,
      round(100.0 * count(*) filter (where x.mur and x.vues >= 10000) / nullif(count(*) filter (where x.mur), 0), 1) as pct_10k,
      max(x.vues) as max_vues,
      round((percentile_cont(0.5) within group (order by x.r) filter (where x.mur))::numeric, 2) as r_mediane,
      count(*) filter (where not x.rappel and x.publie_at > now() - interval '7 days') as publies_7j
    from x
    group by x.pod
  ),
  liens as (
    -- Un label sans ligne sert Sophia.
    select po.slug as pod, po.label_id, coalesce(la.application_id, application_id_sophia()) as application_id
    from pods po
    left join label_applications la on la.label_id = po.label_id
  ),
  etat as (
    select li.pod, li.label_id, li.application_id, c.id as contenu_id, e.tier, e.en_vol, e.restants
    from liens li
    join contenus c on c.pod = li.pod and c.statut = 'valide' and c.import_statut = 'done'
    join contenu_tier_etat e on e.contenu_id = c.id
    left join contenu_pertinences cp on cp.contenu_id = c.id and cp.application_id = li.application_id
    where li.application_id = application_id_sophia() and coalesce(cp.eligible, true)
    union all
    select li.pod, li.label_id, li.application_id, c.id, ea.tier, ea.en_vol, ea.restants
    from liens li
    join contenus c on c.pod = li.pod and c.statut = 'valide' and c.import_statut = 'done'
    join contenu_application_tier_etat ea on ea.contenu_id = c.id and ea.application_id = li.application_id
    where li.application_id <> application_id_sophia() and ea.eligible
  ),
  rangs as (
    select pod,
      count(distinct contenu_id) as contenus_actifs,
      count(distinct contenu_id) filter (where tier = 'D') as coupes,
      count(distinct contenu_id) filter (where tier in ('S', 'S+')) as en_tete
    from etat
    group by pod
  ),
  stock as (
    select pod, label_id, application_id, sum(en_vol) as en_vol, sum(restants) as restants
    from etat
    group by pod, label_id, application_id
  ),
  rythme as (
    select c.pod, p.application_id, count(*) / 7.0 as par_jour
    from passages p
    join contenus c on c.id = p.contenu_id and c.pod is not null
    where p.statut = 'publie' and not coalesce(p.est_rappel, false) and p.publie_at > now() - interval '7 days'
    group by c.pod, p.application_id
  ),
  autonomie as (
    select s.pod, a.slug as application,
      (s.en_vol + s.restants)::int as a_publier,
      round(coalesce(r.par_jour, 0), 1) as par_jour,
      round((s.en_vol + s.restants) / nullif(r.par_jour, 0), 1) as jours,
      round(lr.reserve_jours, 1) as reserve_label_jours
    from stock s
    join applications a on a.id = s.application_id
    left join rythme r on r.pod = s.pod and r.application_id = s.application_id
    left join label_application_reserve lr on lr.label_id = s.label_id and lr.application_id = s.application_id
  ),
  file as (
    select pod,
      count(*) filter (where statut = 'a_valider') as a_valider,
      count(*) filter (where statut = 'a_valider' and auto_erreur is not null) as auto_erreurs,
      count(*) filter (where statut = 'validee' and type <> 'langues' and decide_le > now() - interval '7 days') as validees_7j,
      count(*) filter (where statut = 'validee' and decide_auto and decide_le > now() - interval '7 days') as auto_7j
    from pod_livraisons
    group by pod
  ),
  percees as (
    select p.contenu_id, c.pod,
      left(coalesce(nullif(btrim(
        case when jsonb_typeof(p.slides) = 'array' then
          (select s->>'texte_overlay' from jsonb_array_elements(p.slides) s where (s->>'position')::int = 1 limit 1)
        end), ''), c.titre), 120) as accroche,
      p.vues, co.handle_tiktok as compte, p.langue, a.slug as application,
      coalesce(p.est_rappel, false) as rappel,
      (p.publie_at at time zone 'Europe/Paris')::date as jour,
      case when a.slug = 'sophia' then c.tier else ea.tier end as tier,
      p.publie_url as url
    from passages p
    join contenus c on c.id = p.contenu_id and c.pod is not null
    join comptes co on co.id = p.compte_id
    join applications a on a.id = p.application_id
    left join contenu_application_tier_etat ea on ea.contenu_id = p.contenu_id and ea.application_id = p.application_id
    where p.statut = 'publie' and p.vues >= 30000 and p.publie_at > now() - interval '14 days'
  )
  select jsonb_build_object(
    'genere_le', now(),
    'jours', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'jour', jour, 'publies', publies, 'publies_pods', publies_pods, 'part', part
      ) order by jour), '[]'::jsonb)
      from part
    ),
    'pods', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'slug', po.slug,
        'nom', po.nom,
        'label', l.nom,
        'actif', po.actif,
        'auto_validation', po.auto_validation,
        'auto_validation_heures', po.auto_validation_heures,
        'publies_30j', coalesce(s.publies_30j, 0),
        'publies_7j', coalesce(s.publies_7j, 0),
        'mures', coalesce(s.mures, 0),
        'vues_mediane', s.vues_mediane,
        'pct_10k', s.pct_10k,
        'max_vues', s.max_vues,
        'r_mediane', s.r_mediane,
        'contenus', (select count(*) from contenus c where c.pod = po.slug and c.statut = 'valide'),
        'contenus_actifs', coalesce(rg.contenus_actifs, 0),
        'coupes', coalesce(rg.coupes, 0),
        'en_tete', coalesce(rg.en_tete, 0),
        'a_valider', coalesce(f.a_valider, 0),
        'auto_erreurs', coalesce(f.auto_erreurs, 0),
        'validees_7j', coalesce(f.validees_7j, 0),
        'auto_7j', coalesce(f.auto_7j, 0),
        'autonomie', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'application', au.application,
            'a_publier', au.a_publier,
            'par_jour', au.par_jour,
            'jours', au.jours,
            'reserve_label_jours', au.reserve_label_jours
          ) order by au.application), '[]'::jsonb)
          from autonomie au
          where au.pod = po.slug
        )
      ) order by po.created_at), '[]'::jsonb)
      from pods po
      left join labels l on l.id = po.label_id
      left join stats s on s.pod = po.slug
      left join rangs rg on rg.pod = po.slug
      left join file f on f.pod = po.slug
    ),
    'percees', (
      select coalesce(jsonb_agg(to_jsonb(pe) order by pe.vues desc), '[]'::jsonb)
      from percees pe
    )
  )
  into v_tableau;

  return v_tableau;
end
$$;

revoke all on function public.pods_tableau(integer) from public, anon;
grant execute on function public.pods_tableau(integer) to authenticated, service_role;
