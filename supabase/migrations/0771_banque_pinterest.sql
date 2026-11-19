-- 0771 : banque d'images venues de Pinterest (demande d'Adrien du 19/11).
--   Atala n'a ni source ni image (0 image sous ses 4 labels au 19/11, 140
--   photos de course dans toute la banque de l'OS). Avant ses podz, on remplit
--   la banque de ses labels avec des images cherchées sur Pinterest, triées à
--   l'œil, recadrées en 9:16 (dossier `banque/` du dépôt, fonction Edge
--   `banque`).
--
--   - `media_source` reçoit la valeur `pinterest` : une image de la banque dit
--     d'où elle vient (ni `nettoye_reference`, ni `genere_ia`).
--   - `media_origines` : une ligne par image entrée de l'extérieur. `ref` est
--     l'empreinte de l'image chez Pinterest (les 32 caractères de son adresse
--     i.pinimg.com) : la même image épinglée dix fois n'entre qu'une fois, et
--     on retrouve l'épingle d'une image qu'il faut retirer.
--   - `banque_jetons` : le jeton de l'agent qui verse (empreinte seulement,
--     jamais en clair, posée à part comme celle d'un podz) et son plafond sur
--     24 h. Hors de la table `pods` : cet agent ne livre rien et ne doit pas
--     entrer dans le tableau des podz.
--   - `banque_etat(application)` : par label, le nombre d'images propres et
--     celles venues de Pinterest.
--
-- ✅ Appliquée le 2026-11-19 (MCP). Additive, idempotente. Rien n'est écrit dans
-- `media_library` ici. L'empreinte du jeton de l'agent est posée à part.
-- Retour arrière : drop function banque_etat, drop table banque_jetons,
-- media_origines (la valeur d'enum reste, sans effet).

alter type public.media_source add value if not exists 'pinterest';

create table if not exists public.media_origines (
  media_id uuid primary key references public.media_library (id) on delete cascade,
  site text not null check (site in ('pinterest')),
  ref text not null,
  image_url text not null,
  page_url text,
  requete text,
  jeton text,
  created_at timestamptz not null default now(),
  unique (site, ref)
);

create index if not exists media_origines_jeton_idx on public.media_origines (jeton, created_at desc);

comment on table public.media_origines is
  '0771 : origine d''une image entrée de l''extérieur dans la banque (Pinterest). ref = empreinte de l''image sur le site.';

alter table public.media_origines enable row level security;

drop policy if exists media_origines_admin on public.media_origines;
create policy media_origines_admin on public.media_origines
  for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.media_origines to authenticated;
grant all on public.media_origines to service_role;

create table if not exists public.banque_jetons (
  nom text primary key,
  jeton_hash text not null unique,
  actif boolean not null default true,
  par_jour integer not null default 400 check (par_jour between 1 and 5000),
  created_at timestamptz not null default now()
);

comment on table public.banque_jetons is
  '0771 : agents qui versent dans la banque d''images (fonction Edge banque). Empreinte SHA-256 du jeton, jamais le jeton.';

-- Aucune politique : seule la fonction Edge (service_role) lit cette table.
alter table public.banque_jetons enable row level security;
revoke all on public.banque_jetons from anon, authenticated;
grant all on public.banque_jetons to service_role;

create or replace function public.banque_etat(p_application text)
returns table (label text, propres bigint, pinterest bigint)
language sql
stable
security definer
set search_path = public
as $$
  select l.nom,
         count(m.id) filter (where m.storage_path like 'propre/%' and m.texte_restant is not true),
         count(o.media_id) filter (where o.site = 'pinterest')
    from labels l
    join applications a on a.id = l.application_id
    left join media_labels ml on ml.label_id = l.id
    left join media_library m on m.id = ml.media_id
    left join media_origines o on o.media_id = m.id
   where a.slug = p_application
   group by l.nom
   order by l.nom;
$$;

revoke all on function public.banque_etat(text) from public, anon, authenticated;
grant execute on function public.banque_etat(text) to service_role;
