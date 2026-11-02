-- 0601 : BLEO, remplir l'existant (docs/bleo.md, « Remplir l'existant » ; lot L1).
--
-- AJOUT SEULEMENT : n'écrit que les colonnes et tables neuves de 0600. Rien de
-- ce qui tourne ne les lit.
--
--   1. `labels.voie = 2` pour les 4 labels 100 % podz.
--   2. Les liens parent → variante relevés dans les `notes` des podz, relus à la
--      main (scripts/bleo-parents-notes.mjs --sql, relecture du 29/10) : sur
--      `pod_livraisons.parent_contenu_id` (les livraisons encore à valider
--      prendront leur famille à la validation, A2), puis sur
--      `contenus.parent_bleo_id` quand la variante est validée.
--   3. Les familles : une par (label, accroche) parmi les contenus sans parent,
--      la racine = le plus ancien ; un contenu sans accroche = sa propre famille.
--      Une variante prend la famille de son parent (les notes priment sur
--      l'accroche : D11 du journal de chantier), génération = parent + 1, au plus 2.
--   4. `type_bleo` : `remake` pour les livrés, `historique` pour le reste ; les
--      originaux passés par le circuit des livrés (mentalapp, page blanche :
--      `tier_rapport.origine = 'pod_original'`) restent `historique` (D14).
--      `classe_defaut` : `livre`, `podz` ou `import`.
--   5. `etat_bleo = 'a_juger'`, `verdict = 'en_attente'` : la première passe de
--      `bleo-nuit` calcule r, verdicts et états (A1, A3, A4) sur les vrais passages.
--
-- Chaque étape ne prend que les contenus valides encore sans famille (`a`, un
-- seul label par contenu au 29/10) : rejouable sans effet sur ce qui est fait.

set lock_timeout = '5s';

update public.labels set voie = 2
 where nom in ('white_bg', 'mentalmaxxing', 'that_girl_study', 'Fathomly') and voie <> 2;

with paires (pod, enfant, parent) as (
  values
  ('originaux_alpha_male', 'am-o023', 'am-o003'),
  ('originaux_alpha_yellow', 'ay-o007', 'ay-o003'),
  ('originaux_alpha_yellow', 'ay-o008', 'ay-o003'),
  ('originaux_alpha_yellow', 'ay-o009', 'ay-o003'),
  ('originaux_alpha_yellow', 'ay-o010', 'ay-o005'),
  ('originaux_alpha_yellow', 'ay-o011', 'ay-o005'),
  ('originaux_alpha_yellow', 'ay-o012', 'ay-o005'),
  ('originaux_alpha_yellow', 'ay-o013', 'ay-o006'),
  ('originaux_alpha_yellow', 'ay-o014', 'ay-o006'),
  ('originaux_alpha_yellow', 'ay-o015', 'ay-o006'),
  ('originaux_alpha_yellow', 'ay-o016', 'ay-o004'),
  ('originaux_alpha_yellow', 'ay-o017', 'ay-o004'),
  ('originaux_alpha_yellow', 'ay-o018', 'ay-o004'),
  ('originaux_alpha_yellow', 'ay-o019', 'ay-o001'),
  ('originaux_alpha_yellow', 'ay-o023', 'ay-o003'),
  ('originaux_alpha_yellow', 'ay-o028', 'ay-o003'),
  ('originaux_alpha_yellow', 'ay-o035', 'ay-o011'),
  ('originaux_alpha_yellow', 'ay-o036', 'ay-o011'),
  ('originaux_alpha_yellow', 'ay-o037', 'ay-o011'),
  ('originaux_alpha_yellow', 'ay-o045', 'ay-o008'),
  ('originaux_alpha_yellow', 'ay-o046', 'ay-o008'),
  ('originaux_alpha_yellow', 'ay-o047', 'ay-o008'),
  ('originaux_beau_smart_girl', 'bsg-o024', 'bsg-o004'),
  ('originaux_beau_smart_girl', 'bsg-o026', 'bsg-o002'),
  ('originaux_beau_smart_girl', 'bsg-o027', 'bsg-o004'),
  ('originaux_beau_smart_girl', 'bsg-o028', 'bsg-o002'),
  ('originaux_beau_smart_girl', 'bsg-o029', 'bsg-o005'),
  ('originaux_beau_smart_girl', 'bsg-o031', 'bsg-o005'),
  ('originaux_clean_study', 'cs-o004', 'cs-o002'),
  ('remakes_mentalapp', 'mm-o022', 'mm-o015'),
  ('originaux_weird_alpha', 'wa-o031', 'wa-o006'),
  ('originaux_weird_alpha', 'wa-o032', 'wa-o006'),
  ('originaux_weird_alpha', 'wa-o033', 'wa-o006'),
  ('originaux_weird_alpha', 'wa-o034', 'wa-o018'),
  ('originaux_weird_alpha', 'wa-o035', 'wa-o018'),
  ('originaux_weird_alpha', 'wa-o036', 'wa-o018'),
  ('originaux_weird_alpha', 'wa-o037', 'wa-o007'),
  ('originaux_weird_alpha', 'wa-o038', 'wa-o007'),
  ('originaux_weird_alpha', 'wa-o039', 'wa-o007'),
  ('originaux_weird_alpha', 'wa-o040', 'wa-o012'),
  ('originaux_weird_alpha', 'wa-o041', 'wa-o012'),
  ('originaux_weird_alpha', 'wa-o042', 'wa-o012'),
  ('originaux_weird_alpha', 'wa-o051', 'wa-o011'),
  ('originaux_weird_alpha', 'wa-o052', 'wa-o011'),
  ('originaux_weird_alpha', 'wa-o053', 'wa-o011'),
  ('originaux_weird_alpha', 'wa-o062', 'wa-o031'),
  ('originaux_weird_alpha', 'wa-o063', 'wa-o031'),
  ('originaux_weird_alpha', 'wa-o064', 'wa-o031'),
  ('originaux_weird_alpha', 'wa-o065', 'wa-o016'),
  ('originaux_weird_alpha', 'wa-o066', 'wa-o016'),
  ('originaux_weird_alpha', 'wa-o067', 'wa-o016'),
  ('originaux_rh', 'rh-o007', 'rh-o004'),
  ('originaux_rh', 'rh-o008', 'rh-o004'),
  ('originaux_rh', 'rh-o009', 'rh-o004'),
  ('originaux_rh', 'rh-o036', 'rh-o011'),
  ('originaux_rh', 'rh-o037', 'rh-o011'),
  ('originaux_rh', 'rh-o038', 'rh-o011'),
  ('originaux_rh', 'rh-o039', 'rh-o009'),
  ('originaux_rh', 'rh-o040', 'rh-o009'),
  ('originaux_rh', 'rh-o041', 'rh-o009'),
  ('originaux_smart_girl', 'sg-o022', 'sg-o005'),
  ('originaux_smart_girl', 'sg-o023', 'sg-o005'),
  ('originaux_smart_girl', 'sg-o024', 'sg-o005'),
  ('originaux_smart_girl', 'sg-o026', 'sg-o001'),
  ('originaux_smart_girl', 'sg-o031', 'sg-o005')
)
update public.pod_livraisons e
   set parent_contenu_id = p.contenu_id
  from paires x
  join public.pod_livraisons p on p.pod = x.pod and p.source_id = x.parent and p.contenu_id is not null
 where e.pod = x.pod and e.source_id = x.enfant and e.parent_contenu_id is null;

update public.contenus c
   set parent_bleo_id = e.parent_contenu_id
  from public.pod_livraisons e
 where e.contenu_id = c.id and e.parent_contenu_id is not null
   and c.statut = 'valide' and c.parent_bleo_id is null;

-- Racines : contenus sans parent, une famille par (label, accroche), la plus ancienne.
with a as (
  select c.id, cl.label_id, c.accroche_norm, c.created_at, c.parent_bleo_id
    from public.contenus c
    join lateral (select l.label_id from public.contenu_labels l where l.contenu_id = c.id
                   order by l.label_id limit 1) cl on true
   where c.statut = 'valide' and c.famille_id is null
)
insert into public.bleo_familles (label_id, accroche_norm, racine_contenu_id, created_at)
select distinct on (label_id, accroche_norm) label_id, accroche_norm, id, created_at
  from a
 where parent_bleo_id is null and accroche_norm is not null
 order by label_id, accroche_norm, created_at, id
on conflict (label_id, accroche_norm) where accroche_norm is not null do nothing;

with a as (
  select c.id, cl.label_id, c.accroche_norm, c.created_at, c.parent_bleo_id
    from public.contenus c
    join lateral (select l.label_id from public.contenu_labels l where l.contenu_id = c.id
                   order by l.label_id limit 1) cl on true
   where c.statut = 'valide' and c.famille_id is null
)
update public.contenus c
   set famille_id = f.id, generation = 0
  from a
  join public.bleo_familles f on f.label_id = a.label_id and f.accroche_norm = a.accroche_norm
 where c.id = a.id and a.parent_bleo_id is null;

-- Sans accroche : une famille chacun.
with a as (
  select c.id, cl.label_id, c.accroche_norm, c.created_at, c.parent_bleo_id
    from public.contenus c
    join lateral (select l.label_id from public.contenu_labels l where l.contenu_id = c.id
                   order by l.label_id limit 1) cl on true
   where c.statut = 'valide' and c.famille_id is null
)
insert into public.bleo_familles (label_id, accroche_norm, racine_contenu_id, created_at)
select label_id, null, id, created_at
  from a
 where parent_bleo_id is null and accroche_norm is null;

update public.contenus c
   set famille_id = f.id, generation = 0
  from public.bleo_familles f
 where f.racine_contenu_id = c.id and f.accroche_norm is null and c.famille_id is null;

-- Variantes : la famille du parent, génération + 1 (plafonnée à 2). Trois passes
-- couvrent les chaînes de l'historique (parent → génération 1 → génération 2).
do $$
begin
  for i in 1..3 loop
    update public.contenus c
       set famille_id = p.famille_id, generation = least(coalesce(p.generation, 0) + 1, 2)
      from public.contenus p
     where c.parent_bleo_id = p.id and p.famille_id is not null
       and c.famille_id is null and c.statut = 'valide';
  end loop;
end;
$$;

-- Restes (parent non valide) : traités comme des racines.
with a as (
  select c.id, cl.label_id, c.accroche_norm, c.created_at, c.parent_bleo_id
    from public.contenus c
    join lateral (select l.label_id from public.contenu_labels l where l.contenu_id = c.id
                   order by l.label_id limit 1) cl on true
   where c.statut = 'valide' and c.famille_id is null
)
insert into public.bleo_familles (label_id, accroche_norm, racine_contenu_id, created_at)
select distinct on (label_id, accroche_norm) label_id, accroche_norm, id, created_at
  from a
 where accroche_norm is not null
 order by label_id, accroche_norm, created_at, id
on conflict (label_id, accroche_norm) where accroche_norm is not null do nothing;

with a as (
  select c.id, cl.label_id, c.accroche_norm, c.created_at, c.parent_bleo_id
    from public.contenus c
    join lateral (select l.label_id from public.contenu_labels l where l.contenu_id = c.id
                   order by l.label_id limit 1) cl on true
   where c.statut = 'valide' and c.famille_id is null
)
update public.contenus c
   set famille_id = f.id, generation = 0
  from a
  join public.bleo_familles f on f.label_id = a.label_id and f.accroche_norm = a.accroche_norm
 where c.id = a.id;

with a as (
  select c.id, cl.label_id, c.accroche_norm, c.created_at, c.parent_bleo_id
    from public.contenus c
    join lateral (select l.label_id from public.contenu_labels l where l.contenu_id = c.id
                   order by l.label_id limit 1) cl on true
   where c.statut = 'valide' and c.famille_id is null
)
insert into public.bleo_familles (label_id, accroche_norm, racine_contenu_id, created_at)
select label_id, null, id, created_at
  from a;

update public.contenus c
   set famille_id = f.id, generation = 0
  from public.bleo_familles f
 where f.racine_contenu_id = c.id and f.accroche_norm is null and c.famille_id is null;

-- Types, classes, états de départ.
update public.contenus c
   set type_bleo = case when c.livre and coalesce(c.tier_rapport->>'origine', '') <> 'pod_original'
                        then 'remake' else 'historique' end,
       classe_defaut = case when c.livre and coalesce(c.tier_rapport->>'origine', '') <> 'pod_original' then 'livre'
                            when c.pod is not null then 'podz'
                            else 'import' end,
       etat_bleo = 'a_juger',
       verdict = 'en_attente'
 where c.statut = 'valide' and c.famille_id is not null and c.type_bleo is null;
