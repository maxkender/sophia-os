-- 0540 : Weekly decisions.
-- 1. « Fait jusqu'à la prochaine fois » : un rituel (jeudi, samedi, dimanche)
--    validé reste affiché comme fait jusqu'au même jour de la semaine suivante.
--    Table rituels_faits (ajout seulement), écrite au clic Send / Validate.
--    Les rituels déjà faits sont repris : jeudi 5/11, samedi 31/10, dimanche 1/11.
-- 2. Recreate n'est jamais grisé le jeudi : un compte non recommandé (il fait
--    des vues) peut être recréé après confirmation. ckd_recreer_manuel l'ajoute
--    à la liste Shadowban (vues_basses, « manuel » dans donnees) pour que le
--    parcours habituel (ckd → recreer_shadowban) crée le nouveau compte.

create table if not exists public.rituels_faits (
  id uuid primary key default gen_random_uuid(),
  rituel text not null check (rituel in ('jeudi', 'samedi', 'dimanche')),
  lundi date not null,
  fait_at timestamptz not null default now(),
  fait_par uuid,
  resume jsonb not null default '{}'::jsonb
);
create index if not exists rituels_faits_rituel_fait_at on public.rituels_faits (rituel, fait_at desc);
alter table public.rituels_faits enable row level security;
revoke all on public.rituels_faits from anon, authenticated;

create or replace function public.rituels_droit()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
      or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role::text = 'head_of_ops');
$$;

create or replace function public.rituel_marquer_fait(p_rituel text, p_lundi date, p_resume jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.rituels_droit() then
    raise exception 'rituel_marquer_fait : réservé à l''admin' using errcode = '42501';
  end if;
  insert into public.rituels_faits (rituel, lundi, fait_par, resume)
  values (p_rituel, p_lundi, auth.uid(), coalesce(p_resume, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.rituels_faits_lire(p_depuis date default (current_date - 14))
returns setof public.rituels_faits
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.rituels_droit() then
    raise exception 'rituels_faits_lire : réservé à l''admin' using errcode = '42501';
  end if;
  return query select * from public.rituels_faits r where r.fait_at >= p_depuis order by r.fait_at desc;
end;
$$;

revoke execute on function public.rituel_marquer_fait(text, date, jsonb) from public, anon;
revoke execute on function public.rituels_faits_lire(date) from public, anon;
grant execute on function public.rituel_marquer_fait(text, date, jsonb) to authenticated;
grant execute on function public.rituels_faits_lire(date) to authenticated;

-- Les rituels déjà faits (repris des décisions enregistrées).
insert into public.rituels_faits (rituel, lundi, fait_at, resume)
select x.rituel, x.lundi, x.fait_at, x.resume
  from (values
    ('jeudi', date '2026-11-02',
     (select max(coalesce(n.envoye_at, now())) from public.nudges n where n.type = 'jeudi' and n.envoye_at >= '2026-11-05'),
     jsonb_build_object('repris', true)),
    ('samedi', date '2026-10-26',
     (select max(p.decision_at) from public.ckd_propositions p where p.type = 'samedi' and p.decision_at between '2026-10-31' and '2026-11-01'),
     jsonb_build_object('repris', true)),
    ('dimanche', date '2026-10-26',
     (select max(k.decide_at) from public.dimanche_kills k where k.decide_at between '2026-11-01' and '2026-11-02'),
     jsonb_build_object('repris', true))
  ) as x(rituel, lundi, fait_at, resume)
 where x.fait_at is not null
   and not exists (select 1 from public.rituels_faits r where r.rituel = x.rituel and r.lundi = x.lundi);

-- Recreate « quand même » (compte non recommandé).
create or replace function public.ckd_recreer_manuel(p_compte uuid, p_vues bigint default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.rituels_droit() then
    raise exception 'ckd_recreer_manuel : réservé à l''admin' using errcode = '42501';
  end if;
  insert into public.ckd_shadowban (compte_id, type, depuis, poster_id, hm_id, pays, handle, application, donnees, calcule_at)
  select c.id, 'vues_basses', (now() at time zone 'Europe/Paris')::date, c.poster_id, pr.manager_id, c.pays, c.handle_tiktok,
         public.application_principale(c.parts_applications),
         jsonb_build_object('manuel', true, 'raison', 'Recreate le jeudi malgré les vues (non recommandé)', 'vues', p_vues,
                            'par', auth.uid(), 'handle', c.handle_tiktok),
         now()
    from public.comptes c
    left join public.profiles pr on pr.id = c.poster_id
   where c.id = p_compte and c.is_active and c.poster_id is not null
  on conflict (compte_id) do nothing;
  if not exists (select 1 from public.ckd_shadowban s where s.compte_id = p_compte) then
    raise exception 'compte introuvable ou inactif';
  end if;
end;
$$;

revoke execute on function public.ckd_recreer_manuel(uuid, bigint) from public, anon;
grant execute on function public.ckd_recreer_manuel(uuid, bigint) to authenticated;
