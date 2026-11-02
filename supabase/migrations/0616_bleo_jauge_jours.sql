-- 0616 : BLEO, la jauge des podz jour par jour (L4, P3).
--
-- `bleo_jauge` est une vue : elle ne dit que l'état du moment. La règle du
-- chef des podz « baisser `par_jour` de 1 quand la jauge reste sous 1 semaine
-- pendant 14 jours » (docs/bleo.md, P3) demande l'historique. Chaque matin à
-- 5 h 40 (heure de Paris, après la nuit BLEO de 5 h 15 et avant les routines
-- de 6 h), `bleo_jauge_photo()` copie la vue dans `bleo_jauge_jours`, une
-- ligne par podz et par jour (rejouable : la ligne du jour est remplacée).
--
-- AJOUT SEULEMENT : une table, une fonction, un cron.

set lock_timeout = '5s';

create table if not exists public.bleo_jauge_jours (
  jour date not null,
  pod text not null,
  label_id uuid,
  familles_en_boite integer not null default 0,
  par_jour numeric,
  semaines numeric,
  part_full_test numeric,
  pris_le timestamptz not null default now(),
  primary key (jour, pod)
);

alter table public.bleo_jauge_jours enable row level security;
create policy bleo_jauge_jours_admin on public.bleo_jauge_jours for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.bleo_jauge_jours to authenticated;
grant all on public.bleo_jauge_jours to service_role;

comment on table public.bleo_jauge_jours is
  'BLEO : la jauge de chaque podz de la voie 1, une photo par jour (5 h 40, heure de Paris). Lue par le chef des podz (P3).';

create or replace function public.bleo_jauge_photo(p_forcer boolean default false)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  n integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'bleo : réservé aux admins' using errcode = '42501';
  end if;
  if not p_forcer and extract(hour from now() at time zone 'Europe/Paris') <> 5 then
    return jsonb_build_object('ignore', 'hors heure');
  end if;
  insert into bleo_jauge_jours (jour, pod, label_id, familles_en_boite, par_jour, semaines, part_full_test, pris_le)
  select v_jour, j.pod, j.label_id, j.familles_en_boite, j.par_jour, j.semaines, j.part_full_test, now()
    from bleo_jauge j
  on conflict (jour, pod) do update
     set label_id = excluded.label_id,
         familles_en_boite = excluded.familles_en_boite,
         par_jour = excluded.par_jour,
         semaines = excluded.semaines,
         part_full_test = excluded.part_full_test,
         pris_le = excluded.pris_le;
  get diagnostics n = row_count;
  return jsonb_build_object('jour', v_jour, 'pods', n);
end;
$$;

grant execute on function public.bleo_jauge_photo(boolean) to service_role;

-- 5 h 40 à Paris : 3 h 40 UTC en été, 4 h 40 UTC en hiver ; la garde garde la bonne.
select cron.schedule('bleo-jauge-photo', '40 3,4 * * *', 'select public.bleo_jauge_photo()');

-- La première photo, tout de suite.
select public.bleo_jauge_photo(true);
