-- File des prochains comptes : chaque entrée = label + mode UGC.
-- Ancien format { "label_ids": ["…"] } → { "items": [{ "label_id", "ugc" }] }.
-- Les lecteurs (Edge + front) normalisent encore le legacy.

update public.reglages
set
  valeur = jsonb_build_object(
    'items',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('label_id', elem, 'ugc', false)
          order by ord
        )
        from jsonb_array_elements_text(coalesce(valeur->'label_ids', '[]'::jsonb))
          with ordinality as t(elem, ord)
      ),
      '[]'::jsonb
    )
  ),
  updated_at = now()
where cle = 'file_labels_comptes'
  and valeur ? 'label_ids'
  and not (valeur ? 'items');

-- Une persona UGC ne peut être liée qu’à un seul compte.
create unique index if not exists comptes_ugc_persona_unique
  on public.comptes (ugc_persona_id)
  where ugc_persona_id is not null;
