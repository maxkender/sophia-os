-- 0629 : un lot peut préparer ses duels sans les envoyer (05/11).
--
-- Jusqu'ici tout duel d'un lot partait aux relecteurs à la création (0627).
-- Pour le lot 2 (candidat `fiches`, la réécriture native à travers les quatre
-- fiches), Adrien veut préparer d'abord et envoyer lui-même : `envoi_auto`
-- à faux, et `lot_servir` laisse `relecteurs_le` vide ; l'admin envoie depuis
-- Relecture native (onglet Duels, « Envoyer les N duels non envoyés »).
-- `ab_lot_etat()` expose `envoi_auto` dans `lot`.
--
-- Retour arrière : alter table public.ab_lots drop column envoi_auto ;
-- rejouer ab_lot_etat() de 0628.

set lock_timeout = '5s';

alter table public.ab_lots
  add column if not exists envoi_auto boolean not null default true;

comment on column public.ab_lots.envoi_auto is
  'Duels relecteurs (0629) : vrai, les duels du lot partent aux relecteurs à la création ; faux, ils attendent l''envoi par l''admin.';

create or replace function public.ab_lot_etat(p_numero integer default 1)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $$
  select case when l.id is null then null else jsonb_build_object(
    'lot', jsonb_build_object('id', l.id, 'numero', l.numero, 'nom', l.nom, 'candidat', l.candidat, 'taille', l.taille,
                              'statut', l.statut, 'envoi_auto', l.envoi_auto, 'created_at', l.created_at),
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
                   'envoyes', (select count(*) from ab_traduction_duels d where d.lot_id = l.id and lower(d.langue) = g.langue and d.statut = 'pret' and d.relecteurs_le is not null),
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
