-- Migration micabo → Sophia, étape 3a/3 : CORRESPONDANCE (Sophia, après le dépôt).
--
-- Où : base Sophia (mbikecieskoobeizixig), après l'étape 2 (dépôt).
-- N'écrit que dans `migration_micabo`. Rejouable : ne touche pas aux lignes
-- déjà tranchées.
--
-- Règle (décision du 2026-10-09) : un créateur micabo se connecte à Sophia avec
-- le MÊME identifiant que sur micabo, au domaine près (`x@micabo.app` →
-- `x@sophia.com`), et le même mot de passe. Une seule connexion par personne :
-- un créateur déjà sur Sophia garde son login Sophia, ses comptes micabo y sont
-- rattachés.
--
-- Pour chaque créateur, la décision est posée ainsi :
--  - `creer`       : `x@sophia.com` est libre → nouveau login, même id que sur
--                    micabo, même mot de passe ;
--  - `a_confirmer` : `x@sophia.com` existe déjà. Même personne (→ `existant`,
--                    ses comptes vont sur ce login) ou homonyme (→ `creer` avec
--                    un autre `email_sophia`) : à trancher par un humain. Tant
--                    qu'il en reste, l'import (3b) refuse de tourner.

create table if not exists migration_micabo.correspondance (
  micabo_id uuid primary key,
  email_micabo text not null,
  email_sophia text not null,
  prenom text,
  nom text,
  decision text not null check (decision in ('creer', 'a_confirmer', 'existant')),
  sophia_id uuid,
  importe_le timestamptz
);
revoke all on table migration_micabo.correspondance from public, anon, authenticated;

insert into migration_micabo.correspondance (micabo_id, email_micabo, email_sophia, prenom, nom, decision, sophia_id)
select
  (c ->> 'micabo_id')::uuid,
  c -> 'utilisateur' ->> 'email',
  lower(split_part(c -> 'utilisateur' ->> 'email', '@', 1)) || '@sophia.com',
  c -> 'profil' ->> 'prenom',
  c -> 'profil' ->> 'nom',
  case when s.id is null then 'creer' else 'a_confirmer' end,
  coalesce(s.id, (c ->> 'micabo_id')::uuid)
from migration_micabo.depot d,
     jsonb_array_elements(d.donnees -> 'createurs') c
left join auth.users s
  on lower(s.email) = lower(split_part(c -> 'utilisateur' ->> 'email', '@', 1)) || '@sophia.com'
on conflict (micabo_id) do nothing;

-- Rapport : les cas à trancher d'abord, avec le nom des deux côtés.
select
  m.decision,
  m.email_micabo,
  m.email_sophia,
  m.prenom || ' ' || coalesce(m.nom, '') as micabo,
  p.prenom || ' ' || coalesce(p.nom, '') as sophia_existant,
  (select count(*) from migration_micabo.depot d,
     jsonb_array_elements(d.donnees -> 'comptes') k
   where (k ->> 'poster_id')::uuid = m.micabo_id) as comptes_tiktok
from migration_micabo.correspondance m
left join public.profiles p on p.id = m.sophia_id and m.decision <> 'creer'
order by (m.decision = 'creer'), m.email_micabo;
