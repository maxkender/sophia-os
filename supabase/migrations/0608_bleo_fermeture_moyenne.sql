-- 0608 : BLEO, une famille se ferme sur le r MOYEN de sa dernière génération
-- (décision d'Adrien le 29/10, D36), plus sur le r médian.
--
-- Ce qui compte, ce sont les vues : un post à 200 000 vues doit peser plus
-- qu'un post à 20 000. La médiane fermait une famille même quand un de ses
-- derniers posts avait explosé (168 des 243 familles closes au 29/10 auraient
-- une moyenne d'au moins 1). La moyenne prend chaque r plafonné à 20
-- (`mesure.r_plafond`), comme la forme : un seul post viral ne garde pas une
-- famille ouverte indéfiniment.
--
--   * Close : r moyen (plafonné) des passages mûrs de la dernière génération
--     sous `boite.fermeture_r_moyen` (1), sur au moins
--     `boite.fermeture_min_passages` (4) passages.
--   * Réouverte : la même mesure repasse à 1 ou plus. La règle est recalculée
--     chaque nuit dans les deux sens ; une génération qui a moins de 4 passages
--     mûrs garde l'état de la famille.
--
-- AJOUT SEULEMENT, côté BLEO : la fonction de fermeture, deux vues de lecture
-- de l'OS (colonne `r_moyen` en fin de vue) et une clé de réglage. Rien de ce
-- qui tourne hors BLEO ne lit `close`.

set lock_timeout = '5s';

update public.reglages
   set valeur = jsonb_set(valeur #- '{boite,fermeture_r_median}', '{boite,fermeture_r_moyen}', '1')
 where cle = 'bleo';

create or replace function public.bleo_fermer_familles()
returns integer
language plpgsql
set search_path to 'public'
as $$
declare
  reg jsonb;
  n integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'bleo : réservé aux admins' using errcode = '42501';
  end if;
  select valeur into reg from reglages where cle = 'bleo';
  with gen as (
    select c.famille_id, max(c.generation) as gmax
      from contenus c join bleo_familles f on f.id = c.famille_id
     where c.statut = 'valide' and f.verdict = 'gagnante'
     group by c.famille_id
  ),
  mes as (
    select g.famille_id, count(*) as nb,
           avg(least(p.r, (reg->'mesure'->>'r_plafond')::numeric)) as moy
      from gen g
      join contenus c on c.famille_id = g.famille_id and c.generation = g.gmax and c.statut = 'valide'
      join passages p on p.contenu_id = c.id
     where p.statut = 'publie' and not coalesce(p.est_rappel, false) and p.r is not null
       and p.publie_at <= now() - make_interval(hours => (reg->'mesure'->>'maturite_heures')::int)
     group by g.famille_id
  ),
  etat as (
    select famille_id, moy < (reg->'boite'->>'fermeture_r_moyen')::numeric as fermer
      from mes
     where mes.nb >= (reg->'boite'->>'fermeture_min_passages')::int
  ),
  maj as (
    update bleo_familles f
       set close = e.fermer,
           close_le = case when e.fermer then now() end
      from etat e
     where e.famille_id = f.id and f.close is distinct from e.fermer
    returning f.close
  )
  -- Rend le nombre de familles fermées cette nuit (les réouvertures ne comptent pas).
  select count(*) filter (where close) into n from maj;
  return n;
end;
$$;
comment on function public.bleo_fermer_familles() is
  'BLEO (A9, D36) : ferme une famille gagnante quand le r moyen (plafonné) de sa dernière génération passe sous 1 sur au moins 4 passages mûrs, et la rouvre quand il repasse à 1. Rend le nombre de familles fermées.';

-- Les vues de l'OS montrent le r moyen (plafonné), la mesure qui ferme.
create or replace view public.bleo_familles_ui
  with (security_invoker = true)
as
  with plafond as (
    select (valeur->'mesure'->>'r_plafond')::numeric as r_max from public.reglages where cle = 'bleo'
  ),
  pas as (
    select c.famille_id, count(*) as n_passages, max(p.vues) as vues_max, sum(p.vues) as vues_total,
           percentile_cont(0.5) within group (order by p.r) as r_median, max(p.publie_at) as dernier_passage,
           avg(least(p.r, (select r_max from plafond))) as r_moyen
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
             avg(least(p.r, (select (valeur->'mesure'->>'r_plafond')::numeric from public.reglages where cle = 'bleo'))) as r_moyen
        from public.passages p
       where p.contenu_id = c.id and p.statut = 'publie' and not coalesce(p.est_rappel, false)
    ) s on true
    left join lateral (
      select max(bv.valeur) as valeur_max, count(*) as n_langues
        from public.bleo_valeurs bv
       where bv.contenu_id = c.id and bv.valeur > 0
    ) v on true
   where c.famille_id is not null;

-- La règle s'applique tout de suite : réouvertures (et fermetures) avant la nuit.
select public.bleo_fermer_familles();
