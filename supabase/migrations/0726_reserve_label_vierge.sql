-- 0726 : la réserve d'un label qui n'a encore aucun verdict compte ses
-- contenus à juger (décision d'Adrien du 15/11).
--
-- 0718 compte la réserve en posts « forts et frais » (valeur BLEO ≥ 3). Un
-- label neuf n'a encore rien de prouvé : psychologiefaits, 183 contenus validés
-- (dont 115 dont la source a fait 100 000 vues ou plus), affichait 0 jour, et
-- le choix de label le jugeait « à sec » : il ne recevait aucun nouveau compte.
-- Désormais, tant qu'aucun contenu du label n'a de verdict (gagnant ou non),
-- sa réserve compte un post par contenu validé à juger. Dès le premier
-- verdict, la mesure BLEO reprend.
-- Mêmes colonnes ; seule la vue `bleo_reserve_label` change.

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
-- 0726 : les labels sans aucun verdict, et leurs contenus validés à juger.
vierges as materialized (
  select xl.label_id, count(*) as a_juger
    from public.contenu_labels xl
    join public.contenus c on c.id = xl.contenu_id and c.statut = 'valide' and c.import_statut = 'done'
   group by xl.label_id
  having count(*) filter (where c.verdict in ('gagnant', 'non_gagnant')) = 0
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
       (case when vg.label_id is not null then vg.a_juger else coalesce(f.contenus_forts, 0) end)::bigint as contenus_forts,
       (case when vg.label_id is not null then vg.a_juger else coalesce(f.posts_forts, 0) end)::numeric as posts_forts,
       r.demande_jour
  from public.labels l
  left join forts f on f.label_id = l.id
  left join vierges vg on vg.label_id = l.id
  left join recolte r on r.label_id = l.id;

insert into supabase_migrations.schema_migrations (version, name, statements)
values (to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS'), 'reserve_label_vierge', array['voir 0726']);

select nom, comptes, passages_restants, demande_jour, reserve_jours
  from public.label_application_reserve
 where application_id = '00000000-0000-4000-8000-000000000001' and comptes > 0
 order by reserve_jours nulls last;
