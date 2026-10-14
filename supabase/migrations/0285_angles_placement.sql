-- 0285 : angles de placement — plusieurs par label × application, en TEST ou ACTIF.
--
-- 0279 rangeait UN angle par paire dans `label_applications.angle`. Désormais
-- une paire peut porter plusieurs angles, chacun avec un statut :
--
--  - actif : ajouté au prompt de placement PARTOUT (nuit, assignation, toutes
--    les préparations de deck). Au plus UN par paire (index unique partiel) ;
--  - test  : lu SEULEMENT par le test à blanc « contenus » (page Tests), qui
--    génère une variante par angle en test, à côté de la référence (l'angle
--    actif, ou sans angle), pour comparer.
--
-- Activer un angle repasse l'actif précédent en test, dans la même transaction
-- (`activer_angle_placement`). Un angle n'est jamais effacé par un décochage
-- d'application sur un label (table à part, sans clé vers label_applications) :
-- il reste, inutilisé, tant que la paire n'existe plus.
--
-- `label_applications.angle` n'est plus lue par le moteur : ses valeurs non
-- vides (aucune en prod au 2026-10-14) sont recopiées ici en angle actif.
--
-- Additive : nouvelle table et fonction, aucune lecture existante ne change.
-- Retour arrière : `drop function public.activer_angle_placement(uuid);
--                   drop table public.angles_placement;`

create table if not exists public.angles_placement (
  id uuid primary key default gen_random_uuid(),
  label_id uuid not null references public.labels(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  texte text not null check (length(btrim(texte)) between 1 and 500),
  statut text not null default 'test' check (statut in ('test', 'actif')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null
);

create unique index if not exists angles_placement_un_actif
  on public.angles_placement (label_id, application_id)
  where statut = 'actif';

create index if not exists angles_placement_paire
  on public.angles_placement (label_id, application_id, statut);

alter table public.angles_placement enable row level security;

drop policy if exists angles_placement_read on public.angles_placement;
create policy angles_placement_read on public.angles_placement
  for select to authenticated using (true);

drop policy if exists angles_placement_admin on public.angles_placement;
create policy angles_placement_admin on public.angles_placement
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.angles_placement to authenticated;
grant all on public.angles_placement to service_role;

comment on table public.angles_placement is
  'Angles de placement par label × application. actif (au plus un par paire) = ajouté au prompt de placement partout ; test = lu seulement par le test à blanc « contenus », une variante par angle. Voir supabase/functions/_shared/angle_placement.ts.';

-- Activer un angle : l'actif précédent de la paire repasse en test, dans la
-- même transaction (l'index unique partiel interdit deux actifs). Droits de
-- l'appelant (RLS : admin seulement).
create or replace function public.activer_angle_placement(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_label uuid;
  v_app uuid;
begin
  select label_id, application_id into v_label, v_app
  from public.angles_placement where id = p_id;
  if v_label is null then
    raise exception 'angle % introuvable', p_id;
  end if;
  update public.angles_placement
     set statut = 'test', updated_at = now()
   where label_id = v_label and application_id = v_app and statut = 'actif' and id <> p_id;
  update public.angles_placement
     set statut = 'actif', updated_at = now()
   where id = p_id;
end;
$$;

revoke all on function public.activer_angle_placement(uuid) from public, anon;
grant execute on function public.activer_angle_placement(uuid) to authenticated, service_role;

-- Reprise de 0279 : un angle non vide de label_applications devient l'angle
-- actif de sa paire (sans doublon si on rejoue la migration).
insert into public.angles_placement (label_id, application_id, texte, statut, created_by)
select la.label_id, la.application_id, left(btrim(la.angle), 500), 'actif', null
from public.label_applications la
where nullif(btrim(la.angle), '') is not null
  and not exists (
    select 1 from public.angles_placement ap
    where ap.label_id = la.label_id and ap.application_id = la.application_id and ap.statut = 'actif'
  );

comment on column public.label_applications.angle is
  'Remplacée par la table angles_placement (0285) : n''est plus lue par le moteur.';
