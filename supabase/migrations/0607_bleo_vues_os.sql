-- 0607 : BLEO, les vues de lecture de la section BLEO de l'OS (/admin/bleo).
--
-- AJOUT SEULEMENT, en lecture : trois vues pour les pages admin. Rien de ce
-- qui tourne ne les lit.
--
--   bleo_familles_ui   une ligne par famille d'accroche : label, verdict,
--                      fermeture, contenus, passages publiés, meilleures vues.
--   bleo_contenus_ui   une ligne par contenu rattaché : génération, type,
--                      état, verdict, passages, r médian, meilleure valeur.
--   bleo_plan_ui       le plan d'un tirage (bleo_ombre_passages) avec le
--                      compte, l'accroche, et ce que minuit a réellement donné
--                      au même compte le même jour.
--
-- Les tables lues sont réservées aux admins (RLS) : les vues sont en
-- `security_invoker`, elles ne montrent rien de plus.

set lock_timeout = '5s';

create or replace view public.bleo_familles_ui
  with (security_invoker = true)
as
  with pas as (
    select c.famille_id, count(*) as n_passages, max(p.vues) as vues_max, sum(p.vues) as vues_total,
           percentile_cont(0.5) within group (order by p.r) as r_median, max(p.publie_at) as dernier_passage
      from public.passages p
      join public.contenus c on c.id = p.contenu_id
     where p.statut = 'publie' and not coalesce(p.est_rappel, false) and c.famille_id is not null
     group by c.famille_id
  ),
  con as (
    select famille_id, count(*) filter (where statut <> 'rejete') as n_contenus, max(generation) as gen_max
      from public.contenus
     where famille_id is not null
     group by famille_id
  )
  select f.id, f.label_id, l.slug as label, l.nom as label_nom, l.voie,
         coalesce(f.accroche_norm, rc.titre) as accroche, f.racine_contenu_id, rc.titre as racine_titre,
         f.verdict, f.verdict_le, f.close, f.close_le, f.created_at,
         coalesce(con.n_contenus, 0) as n_contenus, coalesce(con.gen_max, 0) as gen_max,
         coalesce(pas.n_passages, 0) as n_passages, pas.vues_max, pas.vues_total,
         round(pas.r_median::numeric, 2) as r_median, pas.dernier_passage
    from public.bleo_familles f
    left join public.labels l on l.id = f.label_id
    left join public.contenus rc on rc.id = f.racine_contenu_id
    left join con on con.famille_id = f.id
    left join pas on pas.famille_id = f.id;
comment on view public.bleo_familles_ui is
  'BLEO, section de l''OS : une ligne par famille d''accroche, avec ses contenus et ses passages publiés (hors rappels).';

create or replace view public.bleo_contenus_ui
  with (security_invoker = true)
as
  select c.id, c.titre, c.famille_id, c.generation, c.parent_bleo_id, c.type_bleo, c.classe_defaut,
         c.etat_bleo, c.verdict, c.statut::text as statut, c.created_at, c.juge_le, c.pod,
         c.source_url, c.langue_source,
         s.n_passages, s.vues_max, s.vues_moyenne, round(s.r_median::numeric, 2) as r_median, s.dernier_passage,
         round(v.valeur_max, 3) as valeur_max, v.n_langues
    from public.contenus c
    left join lateral (
      select count(*) as n_passages, max(p.vues) as vues_max, round(avg(p.vues)) as vues_moyenne,
             percentile_cont(0.5) within group (order by p.r) as r_median, max(p.publie_at) as dernier_passage
        from public.passages p
       where p.contenu_id = c.id and p.statut = 'publie' and not coalesce(p.est_rappel, false)
    ) s on true
    left join lateral (
      select max(bv.valeur) as valeur_max, count(*) as n_langues
        from public.bleo_valeurs bv
       where bv.contenu_id = c.id and bv.valeur > 0
    ) v on true
   where c.famille_id is not null;
comment on view public.bleo_contenus_ui is
  'BLEO, section de l''OS : une ligne par contenu rattaché à une famille, avec ses passages publiés et sa meilleure valeur du moment.';

create or replace view public.bleo_plan_ui
  with (security_invoker = true)
as
  select o.id, o.run_id, r.jour_vise, o.compte_id, co.handle_tiktok, o.creneau,
         o.contenu_id, c.titre, c.famille_id, coalesce(f.accroche_norm, c.titre) as accroche,
         o.langue, a.slug as application, o.label_id, l.slug as label,
         o.file_bleo, o.categorie, round(o.valeur_tirage, 3) as valeur_tirage, o.relache,
         c.etat_bleo, c.verdict,
         reel.titres as reel_titres,
         coalesce(o.contenu_id = any (reel.contenus), false) as identique_au_reel
    from public.bleo_ombre_passages o
    join public.bleo_runs r on r.id = o.run_id
    left join public.comptes co on co.id = o.compte_id
    left join public.contenus c on c.id = o.contenu_id
    left join public.bleo_familles f on f.id = c.famille_id
    left join public.applications a on a.id = o.application_id
    left join public.labels l on l.id = o.label_id
    left join lateral (
      select array_agg(p.contenu_id) as contenus, string_agg(coalesce(pc.titre, '?'), ' · ' order by p.created_at) as titres
        from public.passages p
        left join public.contenus pc on pc.id = p.contenu_id
       where p.compte_id = o.compte_id and p.date_publication_prevue = r.jour_vise
         and not coalesce(p.est_rappel, false)
    ) reel on true;
comment on view public.bleo_plan_ui is
  'BLEO, section de l''OS : le plan d''un tirage, compte par compte, à côté de ce que minuit a réellement assigné ce jour-là.';

grant select on public.bleo_familles_ui to authenticated, service_role;
grant select on public.bleo_contenus_ui to authenticated, service_role;
grant select on public.bleo_plan_ui to authenticated, service_role;
