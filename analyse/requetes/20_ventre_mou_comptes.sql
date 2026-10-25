-- 20 · Comptes du ventre mou : réguliers, au niveau de leur langue, jamais
-- percé. Sert à choisir des comptes à basculer sur un label 100 % podz en test
-- sans recruter (analyse du 25/10, SUIVI P42). Un compte faible ferait échouer
-- le test (sortie à 30 posts ≥ ×0,75 de la médiane de la langue) : on garde
-- r langue entre 0,7 et 1,2, 2 posts morts au plus, 90 % de posts tenus.
--
-- Fenêtre : posts mûrs de J-33 à J-3, hors rappels. Puis vérifier l'historique
-- complet des candidats (max et nombre de ≥ 10 k depuis le début) : un compte
-- plat depuis un mois peut avoir fait un viral avant.
with cpt as (
  select c.id, c.handle_tiktok h, lower(c.langue) langue, c.classement, c.created_at::date cree,
         public.application_principale(c.parts_applications) app,
         (select string_agg(l.nom, '+' order by l.nom) from compte_labels cl join labels l on l.id = cl.label_id where cl.compte_id = c.id) labels
    from comptes c
   where c.is_active and c.type_compte = 'perso'
     and not coalesce(c.ugc_ai_video, false) and not coalesce(c.videos_uniquement, false)
     and coalesce(c.non_renouveler, false) = false
     and not exists (select 1 from hub_posteurs h where h.profile_id = c.poster_id)
), mur as (
  select p.compte_id, p.vues, coalesce(a.slug, 'sophia') app, lower(p.langue) langue
    from passages p left join applications a on a.id = p.application_id
   where p.statut = 'publie' and not coalesce(p.est_rappel, false) and p.vues is not null
     and p.publie_at between now() - interval '33 days' and now() - interval '3 days'
), med_langue as (
  select app, langue, percentile_cont(0.5) within group (order by vues) med from mur group by 1, 2
), stat as (
  select m.compte_id, count(*) n, percentile_cont(0.5) within group (order by m.vues) med, max(m.vues) mx,
         count(*) filter (where m.vues >= 10000) n10k, count(*) filter (where m.vues < 100) n_morts,
         percentile_cont(0.5) within group (order by m.vues / nullif(ml.med, 0)) r_langue
    from mur m join med_langue ml on ml.app = m.app and ml.langue = m.langue
   group by 1
), regul as (
  select p.compte_id, count(*) prevus, count(*) filter (where p.publie_url is not null) publies
    from passages p
   where not coalesce(p.est_rappel, false) and p.statut <> 'brouillon'
     and p.date_publication_prevue between (now() at time zone 'Europe/Paris')::date - 14 and (now() at time zone 'Europe/Paris')::date - 1
   group by 1
)
select c.app, c.langue, c.h, c.labels, c.classement, c.cree, s.n, round(s.med) med, round(s.r_langue::numeric, 2) r_langue,
       s.mx, s.n10k, s.n_morts, r.publies || '/' || r.prevus regul_14j
  from cpt c join stat s on s.compte_id = c.id left join regul r on r.compte_id = c.id
 where s.n >= 20 and s.n10k <= 1 and s.n_morts <= 2
   and s.r_langue between 0.7 and 1.2
   and r.prevus > 0 and r.publies::numeric / r.prevus >= 0.85
   and coalesce(c.labels, '') not in ('white_bg', 'Fathomly', 'mentalmaxxing', 'that_girl_study')
 order by c.app, c.langue, s.mx;
