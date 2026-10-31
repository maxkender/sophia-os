-- 0492 — Posters : préparer la décision du samedi depuis la fiche d'un posteur.
--
-- La décision préparée est un brouillon du samedi (samedi_brouillons, 0484) pour
-- la semaine de ce samedi : Weekly decisions → Saturday la pré-coche et la met
-- dans « To handle ». Une note peut l'accompagner (raison.note).
--
-- samedi_brouillon_noter (même signature) : la raison est fusionnée avec celle
-- déjà notée (la note d'une décision préparée n'est plus perdue quand le samedi
-- note la raison d'un Kill & don't pay). La note vide efface la note.
--
-- Additive : 1 fonction remplacée (même signature). Aucune donnée modifiée.

create or replace function public.samedi_brouillon_noter(p_lundi date, p_compte uuid, p_choix text, p_raison jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_strict() then
    raise exception 'samedi_brouillon_noter : réservé à l''admin' using errcode = '42501';
  end if;
  insert into public.samedi_brouillons (lundi, compte_id, choix, raison, par, maj_at)
  values (p_lundi, p_compte, p_choix, p_raison, auth.uid(), now())
  on conflict (lundi, compte_id) do update
    set choix = excluded.choix,
        raison = case when excluded.raison is null then samedi_brouillons.raison
                      else jsonb_strip_nulls(coalesce(samedi_brouillons.raison, '{}'::jsonb) || excluded.raison) end,
        par = excluded.par, maj_at = now();
end;
$$;
revoke all on function public.samedi_brouillon_noter(date, uuid, text, jsonb) from public, anon;
grant execute on function public.samedi_brouillon_noter(date, uuid, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
