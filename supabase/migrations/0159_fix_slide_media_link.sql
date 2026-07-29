-- Fix : Fal/Replicate nettoient, mais structure_slides.media_id pointe encore
-- vers le brut (texte) — écriture non atomique + timeout après upload.
-- 1) RPC de patch atomique d'une slide
-- 2) Répare les slides qui pointent brut/null alors qu'un propre existe

create or replace function public.patch_contenu_slide_media(
  p_contenu_id uuid,
  p_position integer,
  p_media_id uuid,
  p_clear_tentatives boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  slides jsonb;
  i integer;
  elem jsonb;
  n integer;
  changed boolean := false;
begin
  if p_contenu_id is null or p_position is null or p_media_id is null then
    return false;
  end if;

  select structure_slides into slides
  from public.contenus
  where id = p_contenu_id
  for update;

  if slides is null or jsonb_typeof(slides) <> 'array' then
    return false;
  end if;

  n := jsonb_array_length(slides);
  for i in 0 .. n - 1 loop
    elem := slides -> i;
    if (elem ->> 'position')::integer = p_position then
      slides := jsonb_set(slides, array[i::text, 'media_id'], to_jsonb(p_media_id::text), true);
      if p_clear_tentatives then
        slides := slides #- array[i::text, 'tentatives'];
      end if;
      changed := true;
      exit;
    end if;
  end loop;

  if changed then
    update public.contenus
    set structure_slides = slides
    where id = p_contenu_id;
  end if;

  return changed;
end;
$$;

revoke all on function public.patch_contenu_slide_media(uuid, integer, uuid, boolean) from public;
grant execute on function public.patch_contenu_slide_media(uuid, integer, uuid, boolean) to authenticated;
grant execute on function public.patch_contenu_slide_media(uuid, integer, uuid, boolean) to service_role;

-- Répare : slide → brut/null/étranger alors qu'un propre/{contenu}/{pos}.* existe.
do $$
declare
  r record;
  slides jsonb;
  i integer;
  elem jsonb;
  n integer;
  pos integer;
  mid text;
  propre_id uuid;
  cur_path text;
  changed boolean;
begin
  for r in
    select c.id, c.structure_slides
    from public.contenus c
    where c.structure_slides is not null
      and jsonb_typeof(c.structure_slides) = 'array'
  loop
    slides := r.structure_slides;
    n := jsonb_array_length(slides);
    changed := false;
    for i in 0 .. n - 1 loop
      elem := slides -> i;
      pos := (elem ->> 'position')::integer;
      mid := nullif(btrim(elem ->> 'media_id'), '');

      select m.id into propre_id
      from public.media_library m
      where m.contenu_id = r.id
        and m.storage_path like 'propre/' || r.id::text || '/' || pos || '.%'
        and coalesce(m.texte_restant, false) = false
      order by m.verifie_le desc nulls last
      limit 1;

      if propre_id is null then
        continue;
      end if;

      cur_path := null;
      if mid is not null then
        select m.storage_path into cur_path
        from public.media_library m
        where m.id = mid::uuid;
      end if;

      -- Déjà le bon propre (ou un autre propre valide de cette slide) → skip.
      if cur_path is not null
         and cur_path like 'propre/' || r.id::text || '/' || pos || '.%' then
        continue;
      end if;

      -- null / brut / media d'un autre contenu → rattacher le propre.
      slides := jsonb_set(slides, array[i::text, 'media_id'], to_jsonb(propre_id::text), true);
      slides := slides #- array[i::text, 'tentatives'];
      changed := true;
    end loop;

    if changed then
      update public.contenus set structure_slides = slides where id = r.id;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
