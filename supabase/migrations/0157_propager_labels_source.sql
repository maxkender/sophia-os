-- Quand on ajoute/modifie les labels d'un compte TikTok source,
-- synchroniser automatiquement tous ses slideshows (contenus) et leurs images.
-- La suppression d'une source ne doit JAMAIS effacer contenus/médias
-- (FK déjà ON DELETE SET NULL — documenté ici + garde-fou commentaire).

create or replace function public.propager_labels_source(p_compte_reference_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
begin
  if p_compte_reference_id is null then
    return 0;
  end if;

  -- Remplacer les labels de tous les slideshows de cette source.
  delete from public.contenu_labels cl
  using public.contenus c
  where cl.contenu_id = c.id
    and c.compte_reference_id = p_compte_reference_id;

  insert into public.contenu_labels (contenu_id, label_id)
  select c.id, crl.label_id
  from public.contenus c
  join public.compte_reference_labels crl
    on crl.compte_reference_id = c.compte_reference_id
  where c.compte_reference_id = p_compte_reference_id
  on conflict do nothing;

  -- Images liées au slideshow OU directement à la source.
  delete from public.media_labels ml
  using public.media_library m
  where ml.media_id = m.id
    and (
      m.compte_reference_id = p_compte_reference_id
      or exists (
        select 1
        from public.contenus c
        where c.id = m.contenu_id
          and c.compte_reference_id = p_compte_reference_id
      )
    );

  insert into public.media_labels (media_id, label_id)
  select distinct m.id, cl.label_id
  from public.media_library m
  join public.contenu_labels cl on cl.contenu_id = m.contenu_id
  join public.contenus c on c.id = m.contenu_id
  where c.compte_reference_id = p_compte_reference_id
  on conflict do nothing;

  -- Médias orphelins (lié à la source mais pas encore à un contenu).
  insert into public.media_labels (media_id, label_id)
  select m.id, crl.label_id
  from public.media_library m
  join public.compte_reference_labels crl
    on crl.compte_reference_id = m.compte_reference_id
  where m.compte_reference_id = p_compte_reference_id
    and m.contenu_id is null
  on conflict do nothing;

  select count(*)::integer into n
  from public.contenus
  where compte_reference_id = p_compte_reference_id;

  return n;
end;
$$;

revoke all on function public.propager_labels_source(uuid) from public;
grant execute on function public.propager_labels_source(uuid) to authenticated;
grant execute on function public.propager_labels_source(uuid) to service_role;

-- Écriture atomique : labels source + propagation contenus/médias.
create or replace function public.set_labels_source(
  p_compte_reference_id uuid,
  p_label_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_compte_reference_id is null then
    raise exception 'compte_reference_id requis';
  end if;

  -- JWT user → admin requis. service_role / SQL direct (uid null) → OK.
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'réservé admin';
  end if;

  -- Évite N propagations via le trigger pendant le replace.
  alter table public.compte_reference_labels
    disable trigger compte_reference_labels_propager;

  begin
    delete from public.compte_reference_labels
    where compte_reference_id = p_compte_reference_id;

    if p_label_ids is not null and cardinality(p_label_ids) > 0 then
      insert into public.compte_reference_labels (compte_reference_id, label_id)
      select p_compte_reference_id, x
      from unnest(p_label_ids) as x
      on conflict do nothing;
    end if;
  exception
    when others then
      alter table public.compte_reference_labels
        enable trigger compte_reference_labels_propager;
      raise;
  end;

  alter table public.compte_reference_labels
    enable trigger compte_reference_labels_propager;

  return public.propager_labels_source(p_compte_reference_id);
end;
$$;

revoke all on function public.set_labels_source(uuid, uuid[]) from public;
grant execute on function public.set_labels_source(uuid, uuid[]) to authenticated;
grant execute on function public.set_labels_source(uuid, uuid[]) to service_role;

-- Filet : toute écriture directe sur le pont source→label repropager.
create or replace function public.trg_compte_reference_labels_propager()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid;
begin
  sid := coalesce(NEW.compte_reference_id, OLD.compte_reference_id);
  if sid is not null then
    perform public.propager_labels_source(sid);
  end if;
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists compte_reference_labels_propager on public.compte_reference_labels;
create trigger compte_reference_labels_propager
  after insert or delete on public.compte_reference_labels
  for each row
  execute function public.trg_compte_reference_labels_propager();

-- Garde-fou documentaire : supprimer une source ne doit pas CASCADE
-- sur contenus / media_library / sujets (SET NULL uniquement).
do $$
declare
  r record;
begin
  for r in
    select conname, conrelid::regclass as tbl, confdeltype
    from pg_constraint
    where confrelid = 'public.comptes_reference'::regclass
      and contype = 'f'
      and conrelid::regclass::text in (
        'public.contenus',
        'public.media_library',
        'public.sujets',
        'public.import_file',
        'public.extractions',
        'public.comptes'
      )
  loop
    if r.confdeltype = 'c' then -- CASCADE
      raise exception
        'FK % sur % ne doit PAS être ON DELETE CASCADE (slideshows à conserver)',
        r.conname, r.tbl;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
