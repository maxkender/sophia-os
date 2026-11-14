-- 0717 : tableau des podz plus parlant (demande d'Adrien du 14/11).
--
-- 1. Les VUES MOYENNES des posts mûrs de chaque podz (« c'est ce qui est
--    intéressant »), à côté de la médiane : `pods_tableau` rend `vues_moyenne`.
-- 2. Les COMPTES d'un podz : `pods_comptes(pod)` rend les comptes actifs qui
--    portent son label, avec leur langue, leurs posts du label sur 15 jours et
--    leurs vues moyennes (posts mûrs, 3 à 15 jours). Lue par la page Pods quand
--    on clique sur « 100 % podz » (ou sur le nombre de comptes de la fiche).
--
-- Additive : un champ de plus dans `pods_tableau`, une fonction en lecture.
-- Retour arrière : supprimer `pods_comptes` ; retirer les deux lignes ajoutées.

create or replace function pg_temp.bleo_patcher(p_fn regprocedure, p_paires text[])
returns void
language plpgsql
as $function$
declare
  d text;
  i integer;
  n integer;
begin
  d := pg_get_functiondef(p_fn);
  for i in 1 .. array_length(p_paires, 1) / 2 loop
    n := (length(d) - length(replace(d, p_paires[2 * i - 1], ''))) / length(p_paires[2 * i - 1]);
    if n <> 1 then
      raise exception '0717 : % : bloc % trouvé % fois (attendu 1), rien n''est changé', p_fn, i, n;
    end if;
    d := replace(d, p_paires[2 * i - 1], p_paires[2 * i]);
  end loop;
  execute d;
end;
$function$;

-- 1. La moyenne dans pods_tableau.
select pg_temp.bleo_patcher('public.pods_tableau(integer)'::regprocedure, array[
$a$      (percentile_cont(0.5) within group (order by x.vues) filter (where x.mur))::int as vues_mediane,$a$,
$b$      (percentile_cont(0.5) within group (order by x.vues) filter (where x.mur))::int as vues_mediane,
      round(avg(x.vues) filter (where x.mur))::int as vues_moyenne,$b$,
$c$        'vues_mediane', s.vues_mediane,$c$,
$d$        'vues_mediane', s.vues_mediane,
        'vues_moyenne', s.vues_moyenne,$d$
]);

-- 2. Les comptes d'un podz.
create or replace function public.pods_comptes(p_pod text)
returns table (
  compte_id uuid,
  handle text,
  langue text,
  pays text,
  cree_le date,
  posts_15j integer,
  mures integer,
  vues_moyenne integer,
  vues_max integer,
  dernier_post date
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'pods : réservé aux admins' using errcode = '42501';
  end if;

  return query
  select c.id, c.handle_tiktok, c.langue, c.pays, c.created_at::date,
         count(pa.id) filter (where pa.statut = 'publie')::int,
         count(pa.id) filter (where pa.statut = 'publie' and pa.publie_at <= now() - interval '3 days' and pa.vues is not null)::int,
         round(avg(pa.vues) filter (where pa.statut = 'publie' and pa.publie_at <= now() - interval '3 days'))::int,
         max(pa.vues)::int,
         (max(pa.publie_at) filter (where pa.statut = 'publie') at time zone 'Europe/Paris')::date
    from pods po
    join compte_labels cl on cl.label_id = po.label_id
    join comptes c on c.id = cl.compte_id and c.is_active
    left join passages pa
           on pa.compte_id = c.id
          and pa.publie_at >= now() - interval '15 days'
          and not coalesce(pa.est_rappel, false)
          and exists (select 1 from contenu_labels x where x.contenu_id = pa.contenu_id and x.label_id = po.label_id)
   where po.slug = p_pod
   group by c.id, c.handle_tiktok, c.langue, c.pays, c.created_at
   order by c.langue, c.handle_tiktok;
end;
$function$;

comment on function public.pods_comptes(text) is
  'Page Pods (0717) : les comptes actifs qui portent le label d''un podz, avec leurs posts du label sur 15 jours (hors rappels) et leurs vues moyennes mûres.';

revoke all on function public.pods_comptes(text) from public, anon;
grant execute on function public.pods_comptes(text) to authenticated, service_role;

insert into supabase_migrations.schema_migrations (version, name, statements)
values (to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS'), 'pods_moyenne_comptes', array['voir 0717']);
