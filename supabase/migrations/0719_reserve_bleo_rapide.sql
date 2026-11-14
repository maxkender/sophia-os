-- 0719 : la réserve BLEO (0718) en 0,5 s au lieu de plus de 60 s.
--
-- 0718 lisait le seuil par `bleo_reserve_reglage()` dans le filtre : la
-- fonction n'était pas inlinée, elle tournait sur chacune des 144 000 lignes
-- (6 s pour `bleo_reserve_label` seule, plus de 60 s pour
-- `label_application_reserve`, que lisent le choix de label, le Pilotage, le
-- sanity et le tableau des podz). Les réglages sont maintenant lus une fois
-- (CTE matérialisée) et chaque étape est calculée une seule fois.
-- Mêmes colonnes, même mesure : seule la vitesse change.

create or replace view public.bleo_reserve_label as
with cfg as materialized (
  select coalesce((r.valeur->'reserve'->>'valeur_forte')::numeric, 3) as forte,
         coalesce((r.valeur->'reserve'->>'fatigue_post')::numeric, 0.6) as fatigue,
         coalesce((r.valeur->'reserve'->>'jours_demande')::int, 7) as jours
    from (select (select valeur from public.reglages where cle = 'bleo') as valeur) r
),
langues_actives as materialized (
  select distinct cl.label_id, lower(co.langue) as langue
    from public.compte_labels cl
    join public.comptes co on co.id = cl.compte_id
   where co.is_active
),
forts as materialized (
  select xl.label_id,
         count(distinct v.contenu_id) as contenus_forts,
         sum(floor(ln(v.valeur / cfg.forte) / ln(1 / cfg.fatigue)) + 1) as posts_forts
    from public.bleo_valeurs v
    cross join cfg
    join public.contenus c on c.id = v.contenu_id and c.statut = 'valide' and c.import_statut = 'done'
    join public.contenu_labels xl on xl.contenu_id = v.contenu_id
    join langues_actives la on la.label_id = xl.label_id and la.langue = v.langue
   where v.valeur >= cfg.forte
   group by xl.label_id
),
recolte as materialized (
  select xl.label_id, count(*)::numeric / max(cfg.jours) as demande_jour
    from public.passages pa
    cross join cfg
    join public.contenu_labels xl on xl.contenu_id = pa.contenu_id
   where pa.file_bleo = 'valeur'
     and pa.date_publication_prevue between current_date - cfg.jours and current_date - 1
   group by xl.label_id
)
select l.id as label_id,
       coalesce(f.contenus_forts, 0)::bigint as contenus_forts,
       coalesce(f.posts_forts, 0)::numeric as posts_forts,
       r.demande_jour
  from public.labels l
  left join forts f on f.label_id = l.id
  left join recolte r on r.label_id = l.id;

insert into supabase_migrations.schema_migrations (version, name, statements)
values (to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS'), 'reserve_bleo_rapide', array['voir 0719']);
