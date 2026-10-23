-- 18 · Qu'est-ce qui fait percer un post (≥ 10 k vues à J+2) ? Deux exports à
-- analyser avec analyse/outils/percee.py :
--   python3 -I analyse/outils/percee.py posts.json relectures.json
-- 18a : un passage mûr par ligne (6 semaines), avec l'heure TikTok, le rang dans la
-- journée du compte, le statut du contenu (meilleur passage connu 2 j avant), les
-- vues du TikTok source, l'âge du contenu, le compte (création, warm-up, abonnés
-- au dernier relevé, recrutement) et la relecture automatique du post.
-- Lecture seule. Export via l'API (read_only) : ~10 000 lignes, 13 Mo.
with tous as (
  select pa.id, pa.contenu_id, pa.compte_id, pa.post_id, pa.publie_at, coalesce(pa.tiktok_publie_at, pa.publie_at) pub_at,
    pa.date_publication_prevue, pa.vues, pa.likes, pa.partages, pa.commentaires, coalesce(pa.est_rappel,false) rappel, pa.langue,
    coalesce(a.slug,'sophia') app, pa.slides, pa.hashtags, pa.musique_titre, pa.stats_maj_at,
    max(pa.vues) over (partition by pa.contenu_id order by pa.publie_at range between unbounded preceding and interval '2 days' preceding) prior_max,
    count(*) over (partition by pa.contenu_id order by pa.publie_at rows between unbounded preceding and 1 preceding) prior_n,
    count(*) over (partition by pa.compte_id, (pa.publie_at at time zone 'Europe/Paris')::date) n_jour_compte,
    row_number() over (partition by pa.compte_id, (pa.publie_at at time zone 'Europe/Paris')::date order by coalesce(pa.tiktok_publie_at, pa.publie_at)) rang_jour,
    lag(coalesce(pa.tiktok_publie_at, pa.publie_at)) over (partition by pa.compte_id order by coalesce(pa.tiktok_publie_at, pa.publie_at)) prec_at,
    pa.tiktok_publie_at is not null a_tt
  from passages pa left join applications a on a.id = pa.application_id
  where pa.statut='publie' and pa.publie_at is not null
), lab as (
  select cl.contenu_id, min(l.nom) label from contenu_labels cl join labels l on l.id = cl.label_id group by 1
), rev as (
  select post_id, count(*) n_rev, sum(jsonb_array_length(coalesce(remarques,'[]'::jsonb))) n_rem from reviews where post_id is not null group by 1
), ra as (
  select passage_id, statut ra_statut, defauts, vues ra_vues from relectures_auto
)
select t.id, t.contenu_id, t.compte_id, t.publie_at, t.pub_at, t.a_tt, t.date_publication_prevue::text prevue,
  t.vues, t.likes, t.partages, t.commentaires, t.rappel, t.langue, t.app,
  t.prior_max, t.prior_n, t.n_jour_compte, t.rang_jour, round(extract(epoch from (t.pub_at - t.prec_at))/60) min_depuis_prec,
  round(extract(epoch from (t.stats_maj_at - t.pub_at))/3600) age_releve_h,
  jsonb_array_length(case when jsonb_typeof(t.slides)='array' then t.slides else '[]'::jsonb end) nb_slides,
  (select s->>'texte_overlay' from jsonb_array_elements(case when jsonb_typeof(t.slides)='array' then t.slides else '[]'::jsonb end) s order by (s->>'position')::int limit 1) hook,
  (select sum(length(s->>'texte_overlay')) from jsonb_array_elements(case when jsonb_typeof(t.slides)='array' then t.slides else '[]'::jsonb end) s) len_texte,
  (select min((s->>'position')::int) from jsonb_array_elements(case when jsonb_typeof(t.slides)='array' then t.slides else '[]'::jsonb end) s where (s->>'position_sophia')::boolean) pos_app,
  coalesce(array_length(regexp_split_to_array(nullif(trim(t.hashtags),''), '\s+'),1),0) nb_hashtags,
  t.musique_titre is not null a_musique,
  coalesce(lab.label,'?') label, c.tier, (c.pod is not null or c.creation_mode='manuel') original, c.parent_id is not null variation,
  c.created_at::date::text contenu_cree, c.vues_source, c.pertinence_score, c.langue_source,
  co.handle_tiktok compte, co.pays, co.langue langue_compte, co.created_at compte_cree, co.demarre_le::text demarre_le,
  co.warmup_started_at, co.warmup_ends_at, co.posts_par_jour, co.classement::text classement, co.poster_id,
  cp.abonnes, cp.releve_at::date::text abonnes_releve,
  rc.warmup_at rc_warmup_at, rc.premier_post_at rc_premier_post_at, rc.contrat_signe_at,
  rev.n_rev, rev.n_rem, ra.ra_statut, ra.defauts ra_defauts, ra.ra_vues
from tous t
join contenus c on c.id = t.contenu_id
join comptes co on co.id = t.compte_id
left join lab on lab.contenu_id = t.contenu_id
left join compte_profils cp on cp.compte_id = t.compte_id
left join recrutement_createurs rc on rc.profile_id = co.poster_id
left join rev on rev.post_id = t.post_id
left join ra on ra.passage_id = t.id
where t.vues is not null and t.publie_at >= '2026-09-07 22:00+00' and t.publie_at < '2026-10-20 22:00+00'

-- 18b : relectures automatiques (relectures_auto, statut fait / ignore) : défauts,
-- texte lu sur les 3 slides comparées (original et publié) et texte attendu du
-- passage, pour mesurer la fidélité du texte publié au brief.
select ra.passage_id, ra.jour::text jour, ra.statut, ra.defauts, ra.vues ra_vues, ra.legende, ra.musique_publiee_id,
  jsonb_array_length(coalesce(ra.slides_publiees,'[]'::jsonb)) nb_slides_pub,
  (select jsonb_agg(jsonb_build_object('position', c->'position',
      'orig', (select string_agg(b->>'texte', E'\n') from jsonb_array_elements(c->'original'->'blocs') b),
      'pub', (select string_agg(b->>'texte', E'\n') from jsonb_array_elements(c->'publie'->'blocs') b),
      'constats', (select jsonb_agg(k->>'code') from jsonb_array_elements(c->'constats') k)))
   from jsonb_array_elements(coalesce(ra.comparaisons,'[]'::jsonb)) c) comp,
  (select jsonb_agg(jsonb_build_object('position', s->'position', 'texte', s->>'texte_overlay') order by (s->>'position')::int)
   from jsonb_array_elements(case when jsonb_typeof(pa.slides)='array' then pa.slides else '[]'::jsonb end) s) attendu,
  pa.hashtags, pa.musique_titre
from relectures_auto ra join passages pa on pa.id = ra.passage_id
where ra.statut in ('fait','ignore')
