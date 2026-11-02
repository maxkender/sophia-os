-- 0611 : BLEO, correctif du r moyen affiché dans l'OS (vues de 0608).
--
-- `least(r, 20)` rend 20 quand r est vide (Postgres ignore les NULL dans
-- least) : dans `bleo_familles_ui` et `bleo_contenus_ui`, chaque passage
-- publié sans r (pas encore mûr, ou compte sans médiane) comptait comme r = 20
-- dans la moyenne. Exemple relevé par Adrien le 29/10 : un contenu « non
-- gagnant » de r maximum 1,74 affichait un r moyen de 2,69.
--
-- Seul l'affichage était faux : la fermeture des familles (0608), la forme et
-- les tirages filtrent déjà `p.r is not null`. Les vues sont redéfinies avec
-- les mêmes colonnes ; seule la moyenne ne lit plus que les r mesurés.

set lock_timeout = '5s';

create or replace view public.bleo_familles_ui
  with (security_invoker = true)
as
  with plafond as (
    select (valeur->'mesure'->>'r_plafond')::numeric as r_max from public.reglages where cle = 'bleo'
  ),
  pas as (
    select c.famille_id, count(*) as n_passages, max(p.vues) as vues_max, sum(p.vues) as vues_total,
           percentile_cont(0.5) within group (order by p.r) as r_median, max(p.publie_at) as dernier_passage,
           avg(least(p.r, (select r_max from plafond))) filter (where p.r is not null) as r_moyen
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
         round(pas.r_median::numeric, 2) as r_median, pas.dernier_passage,
         round(pas.r_moyen, 2) as r_moyen
    from public.bleo_familles f
    left join public.labels l on l.id = f.label_id
    left join public.contenus rc on rc.id = f.racine_contenu_id
    left join con on con.famille_id = f.id
    left join pas on pas.famille_id = f.id;

create or replace view public.bleo_contenus_ui
  with (security_invoker = true)
as
  select c.id, c.titre, c.famille_id, c.generation, c.parent_bleo_id, c.type_bleo, c.classe_defaut,
         c.etat_bleo, c.verdict, c.statut::text as statut, c.created_at, c.juge_le, c.pod,
         c.source_url, c.langue_source,
         s.n_passages, s.vues_max, s.vues_moyenne, round(s.r_median::numeric, 2) as r_median, s.dernier_passage,
         round(v.valeur_max, 3) as valeur_max, v.n_langues,
         round(s.r_moyen, 2) as r_moyen
    from public.contenus c
    left join lateral (
      select count(*) as n_passages, max(p.vues) as vues_max, round(avg(p.vues)) as vues_moyenne,
             percentile_cont(0.5) within group (order by p.r) as r_median, max(p.publie_at) as dernier_passage,
             avg(least(p.r, (select (valeur->'mesure'->>'r_plafond')::numeric from public.reglages where cle = 'bleo')))
               filter (where p.r is not null) as r_moyen
        from public.passages p
       where p.contenu_id = c.id and p.statut = 'publie' and not coalesce(p.est_rappel, false)
    ) s on true
    left join lateral (
      select max(bv.valeur) as valeur_max, count(*) as n_langues
        from public.bleo_valeurs bv
       where bv.contenu_id = c.id and bv.valeur > 0
    ) v on true
   where c.famille_id is not null;
