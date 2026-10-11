-- 0275 : chiffres du choix de label à la création d'un compte.
--
-- manage-users ne tire plus « le label le moins utilisé de la langue, égalités
-- au hasard » : il équilibre chaque langue d'après un poids par label (stock de
-- contenus × performance récente). Cette fonction lui donne, pour les labels
-- candidats, en une lecture :
--   - comptes_langue / comptes_total : liens actifs compte ↔ label (dans la
--     langue du compte créé / dans toute la flotte) ;
--   - stock : contenus validés du label, utilisables par l'application
--     (Sophia : tous ; autre application : pertinence éligible) ;
--   - passages / mediane_vues : posts publiés sur 28 jours pour l'application,
--     et leur médiane de vues ; mediane_flotte : la même médiane sur tous les
--     labels candidats (référence de la performance) ;
--   - recents_langue : RÉCENCE du label parmi les `p_recents` derniers comptes
--     actifs créés dans la langue (diversité : pas le même label en rafale).
--     0 = aucun d'eux ne le porte ; sinon p_recents + 1 − rang du plus récent
--     qui le porte (le dernier compte créé vaut p_recents, le plus ancien de la
--     fenêtre vaut 1) : plus c'est grand, plus il vient de servir.
--
-- Additive : une fonction nouvelle, rien d'existant ne change. Lecture seule.
-- Réservée au service (manage-users) : ni anon ni authenticated.
-- Retour arrière : `drop function public.stats_labels_creation(uuid[], uuid, text, integer);`
-- (manage-users retombe alors sur l'ancien « moins utilisé »).
--
-- En prod (11/10/2026), une première version à 3 arguments (sans p_recents ni
-- recents_langue) existe aussi, inutilisée : le connecteur Supabase ne passe
-- pas les DROP. La supprimer depuis le SQL Editor :
-- `drop function public.stats_labels_creation(uuid[], uuid, text);`

create or replace function public.stats_labels_creation(
  p_labels uuid[],
  p_application uuid,
  p_langue text,
  p_recents integer
)
returns table (
  label_id uuid,
  comptes_langue integer,
  comptes_total integer,
  stock integer,
  passages integer,
  mediane_vues numeric,
  mediane_flotte numeric,
  recents_langue integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with app as (
    select coalesce(p_application, '00000000-0000-4000-8000-000000000001'::uuid) as id
  ),
  lab as (
    select distinct unnest(p_labels) as label_id
  ),
  liens as (
    select cl.label_id, c.langue
    from compte_labels cl
    join comptes c on c.id = cl.compte_id
    where c.is_active and cl.label_id = any(p_labels)
  ),
  stock as (
    select xl.label_id, count(distinct co.id) as n
    from contenu_labels xl
    join contenus co on co.id = xl.contenu_id
    cross join app
    where xl.label_id = any(p_labels)
      and co.statut = 'valide'
      and (
        app.id = '00000000-0000-4000-8000-000000000001'::uuid
        or exists (
          select 1 from contenu_pertinences cp
          where cp.contenu_id = co.id and cp.application_id = app.id and cp.eligible
        )
      )
    group by xl.label_id
  ),
  publies as (
    select xl.label_id, pa.vues
    from passages pa
    join contenu_labels xl on xl.contenu_id = pa.contenu_id
    cross join app
    where xl.label_id = any(p_labels)
      and pa.statut = 'publie'
      and pa.publie_at >= now() - interval '28 days'
      and pa.vues is not null
      and coalesce(pa.application_id, '00000000-0000-4000-8000-000000000001'::uuid) = app.id
  ),
  perf as (
    select p.label_id, count(*) as n, percentile_cont(0.5) within group (order by p.vues) as med
    from publies p
    group by p.label_id
  ),
  flotte as (
    select percentile_cont(0.5) within group (order by p.vues) as med from publies p
  ),
  recents as (
    select c.id, row_number() over (order by c.created_at desc, c.id desc) as rang
    from comptes c
    where c.is_active
      and lower(c.langue) = lower(coalesce(p_langue, ''))
      and exists (
        select 1 from compte_labels x where x.compte_id = c.id and x.label_id = any(p_labels)
      )
    order by c.created_at desc, c.id desc
    limit greatest(coalesce(p_recents, 0), 0)
  )
  select
    lab.label_id,
    (select count(*) from liens l where l.label_id = lab.label_id
       and lower(l.langue) = lower(coalesce(p_langue, '')))::integer,
    (select count(*) from liens l where l.label_id = lab.label_id)::integer,
    coalesce(stock.n, 0)::integer,
    coalesce(perf.n, 0)::integer,
    perf.med::numeric,
    (select med from flotte)::numeric,
    (select coalesce(max(greatest(coalesce(p_recents, 0), 0) + 1 - r.rang), 0)
       from recents r join compte_labels x on x.compte_id = r.id
       where x.label_id = lab.label_id)::integer
  from lab
  left join stock on stock.label_id = lab.label_id
  left join perf on perf.label_id = lab.label_id;
$$;

revoke all on function public.stats_labels_creation(uuid[], uuid, text, integer) from public;
revoke all on function public.stats_labels_creation(uuid[], uuid, text, integer) from anon;
revoke all on function public.stats_labels_creation(uuid[], uuid, text, integer) from authenticated;
grant execute on function public.stats_labels_creation(uuid[], uuid, text, integer) to service_role;

comment on function public.stats_labels_creation(uuid[], uuid, text, integer) is
  'Choix de label à la création (manage-users) : comptes par label (langue / flotte), stock utilisable, médiane de vues 28 j, récence parmi les p_recents derniers comptes de la langue. Lecture seule.';
