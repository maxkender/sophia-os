-- 0628 : le lot commun de duels (0627) ne prépare pas de duel dans la langue
-- source du contenu (02/11).
--
-- Un duel compare la traduction actuelle et celle du candidat ; quand la langue
-- du relecteur est la langue dans laquelle le contenu a été écrit, il n'y a rien
-- à traduire : le « deck actuel » est le texte d'origine et le candidat ne fait
-- que le réécrire. Le serveur (`lot_servir`) saute désormais ces paires ; ici la
-- garde du cron en fait autant, et l'état du lot donne par langue le nombre de
-- duels attendus (`attendus`), pour que la carte Tests affiche 11 / 11 et non
-- 11 / 15 quand quatre contenus du lot sont écrits dans la langue du relecteur.
--
-- Nettoyage : les duels de lot déjà préparés dans la langue source sont
-- supprimés (le premier tour du 02/11 en avait fait un, français → français ;
-- ses votes éventuels partent avec lui, en cascade).
--
-- Retour arrière : rejouer `ab_lot_a_faire()` et `ab_lot_etat()` de 0627.

set lock_timeout = '5s';

delete from public.ab_traduction_duels d
 using public.contenus c
 where d.lot_id is not null
   and c.id = d.contenu_id
   and lower(d.langue) = lower(coalesce(c.langue_source, ''));

create or replace function public.ab_lot_a_faire()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from ab_lots l
      join ab_lot_contenus lc on lc.lot_id = l.id
      join contenus c on c.id = lc.contenu_id
      join (select distinct lower(langue) as langue from relecteurs_natifs where statut in ('invite', 'actif')) g on true
     where l.statut = 'actif'
       and lower(coalesce(c.langue_source, '')) <> g.langue
       and not exists (select 1 from ab_traduction_duels d
                        where d.lot_id = l.id and lower(d.langue) = g.langue and d.contenu_id = lc.contenu_id and d.candidat = l.candidat)
  );
$$;

create or replace function public.ab_lot_etat(p_numero integer default 1)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $$
  select case when l.id is null then null else jsonb_build_object(
    'lot', jsonb_build_object('id', l.id, 'numero', l.numero, 'nom', l.nom, 'candidat', l.candidat, 'taille', l.taille,
                              'statut', l.statut, 'created_at', l.created_at),
    'contenus', coalesce((select jsonb_agg(jsonb_build_object(
                   'position', lc.position, 'contenu_id', lc.contenu_id, 'titre', c.titre, 'label', lc.label,
                   'langue_source', c.langue_source,
                   'nb_langues', lc.nb_langues, 'r_med', lc.r_med, 'publies', lc.publies,
                   'accroche', (select left(x ->> 'texte_overlay', 120) from contenu_langues s
                                 cross join lateral jsonb_array_elements(coalesce(nullif(s.slides_base, '[]'::jsonb), s.slides, '[]'::jsonb)) x
                                 where s.contenu_id = c.id and s.langue = c.langue_source
                                 order by (x ->> 'position')::int limit 1)
                 ) order by lc.position)
                 from ab_lot_contenus lc join contenus c on c.id = lc.contenu_id where lc.lot_id = l.id), '[]'::jsonb),
    'langues', coalesce((select jsonb_agg(jsonb_build_object(
                   'langue', g.langue, 'relecteurs', g.relecteurs,
                   'attendus', (select count(*) from ab_lot_contenus lc join contenus c on c.id = lc.contenu_id
                                 where lc.lot_id = l.id and lower(coalesce(c.langue_source, '')) <> g.langue),
                   'prets', (select count(*) from ab_traduction_duels d where d.lot_id = l.id and lower(d.langue) = g.langue and d.statut = 'pret'),
                   'echecs', (select count(*) from ab_traduction_duels d where d.lot_id = l.id and lower(d.langue) = g.langue and d.statut = 'echec'),
                   'votes', (select count(*) from ab_traduction_votes v join ab_traduction_duels d on d.id = v.duel_id where d.lot_id = l.id and lower(d.langue) = g.langue),
                   'dernier', (select max(d.created_at) from ab_traduction_duels d where d.lot_id = l.id and lower(d.langue) = g.langue)
                 ) order by g.langue)
                 from (select lower(r.langue) as langue, count(*) as relecteurs
                         from relecteurs_natifs r where r.statut in ('invite', 'actif') group by lower(r.langue)) g), '[]'::jsonb),
    'duels', (select count(*) from ab_traduction_duels d where d.lot_id = l.id)
  ) end
  from (select * from ab_lots where numero = p_numero) l
  right join (select 1) un on true;
$$;

notify pgrst, 'reload schema';
