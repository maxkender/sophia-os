-- Migration micabo → Sophia, étape 1/3 : EXPORT (à lancer dans micabo-os).
--
-- Où : SQL Editor du projet micabo-os (qkmiwnmiwsvwkttldqgb).
-- Lecture seule : ce script ne modifie rien.
--
-- Il rend UNE cellule, `script_pour_sophia` : le script de l'étape 2, à copier
-- tel quel dans le SQL Editor de Sophia. Il contient les mots de passe
-- chiffrés des créateurs : ne le colle nulle part ailleurs (ni chat, ni Slack,
-- ni fichier partagé). Si la cellule s'affiche tronquée, l'exporter (CSV) et
-- copier la valeur depuis le fichier.
--
-- Contenu : les créateurs (rôle poster) — compte de connexion, identités,
-- profil — et tous leurs comptes TikTok, avec les slugs de leurs labels
-- micabo. Ni les HM, ni l'admin.

with posters as (
  select distinct r.user_id as id
  from public.user_roles r
  where r.role::text = 'poster'
),
donnees as (
  select jsonb_build_object(
    'source', 'micabo-os',
    'createurs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'micabo_id', u.id,
        'utilisateur', to_jsonb(u),
        'identites', coalesce(
          (select jsonb_agg(to_jsonb(i)) from auth.identities i where i.user_id = u.id),
          '[]'::jsonb),
        'profil', to_jsonb(p)
      ) order by u.created_at)
      from auth.users u
      join posters x on x.id = u.id
      left join public.profiles p on p.id = u.id
    ), '[]'::jsonb),
    'comptes', coalesce((
      select jsonb_agg(to_jsonb(c) || jsonb_build_object(
        'labels_micabo', coalesce((
          select jsonb_agg(l.slug order by l.slug)
          from public.compte_labels cl
          join public.labels l on l.id = cl.label_id
          where cl.compte_id = c.id), '[]'::jsonb)
      ) order by c.created_at)
      from public.comptes c
      where c.poster_id in (select id from posters)
    ), '[]'::jsonb)
  ) as j
)
select format(
$script$-- Migration micabo → Sophia, étape 2/3 : DÉPÔT (à lancer dans Sophia).
--
-- Où : SQL Editor du projet Sophia OS SLIDESHOW (mbikecieskoobeizixig).
-- Généré par l'export micabo-os le %s.
--
-- Ne touche NI à auth NI aux tables de l'OS : dépose seulement les données
-- dans un schéma privé, `migration_micabo`, que l'API ne publie pas.
-- Rejouable : un nouveau dépôt remplace le précédent.
begin;
create schema if not exists migration_micabo;
revoke all on schema migration_micabo from public, anon, authenticated;
create table if not exists migration_micabo.depot (
  id smallint primary key default 1 check (id = 1),
  genere_le timestamptz not null,
  depose_le timestamptz not null default now(),
  donnees jsonb not null
);
revoke all on table migration_micabo.depot from public, anon, authenticated;
insert into migration_micabo.depot (id, genere_le, donnees)
values (1, %L, %L::jsonb)
on conflict (id) do update
  set genere_le = excluded.genere_le, depose_le = now(), donnees = excluded.donnees;
commit;
select jsonb_array_length(donnees -> 'createurs') as createurs,
       jsonb_array_length(donnees -> 'comptes') as comptes,
       genere_le
from migration_micabo.depot;
$script$,
  now(), now(), j::text
) as script_pour_sophia
from donnees;
