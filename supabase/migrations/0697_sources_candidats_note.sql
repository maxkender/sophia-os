-- 0697 : une note sur une proposition de source (demande d'Adrien du 13/11 :
-- « possibilité de rajouter des notes aux comptes qu'on met en plus tard »).
--
-- `sources_candidats.note` : un mot libre de l'admin, posé en mettant la carte
-- de côté ou modifié ensuite. L'agent éclaireur la relit avec les décisions.
-- `sources_candidats_noter` l'écrit (vide = effacée).
--
-- ✅ Appliquée le 2026-11-13 (MCP).
--
-- Retour arrière : drop function sources_candidats_noter ; la colonne peut rester.

set lock_timeout = '5s';

alter table public.sources_candidats add column if not exists note text;

comment on column public.sources_candidats.note is
  'Note libre de l''admin sur la proposition (0697), posée en la mettant de côté ou après.';

create or replace function public.sources_candidats_noter(p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'sources : réservé aux admins' using errcode = '42501';
  end if;
  update sources_candidats
     set note = nullif(btrim(p_note), ''), updated_at = now()
   where id = p_id;
  if not found then
    raise exception 'sources : proposition introuvable';
  end if;
end;
$function$;

comment on function public.sources_candidats_noter(uuid, text) is
  'Sources (0697) : écrit la note d''une proposition (vide : effacée).';

revoke all on function public.sources_candidats_noter(uuid, text) from public, anon;
grant execute on function public.sources_candidats_noter(uuid, text) to authenticated, service_role;
