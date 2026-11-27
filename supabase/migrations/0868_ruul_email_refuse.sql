-- 0868 : un email Ruul déjà lié à un compte BUSINESS Ruul (27/11, Max).
--
-- LE CONSTAT. Du 22/11 18:12 UTC au 27/11, GET /workmates répondait 500 pour toute
-- la société 21743 : l'OS avait invité (POST /connect) un posteur dont l'email
-- avait déjà un compte business chez Ruul ; Ruul l'avait lié comme contractor
-- quand même, et cette fiche cassait toute la liste (réponse du support Ruul,
-- 27/11). Ruul a supprimé la fiche et corrigé : /connect répond maintenant 409
-- `email_not_a_contractor` pour un tel email, et /workmates saute une fiche
-- abîmée au lieu d'échouer.
--
-- CE QUE ÇA AJOUTE.
--   1. `ruul_email_refuse(poster, email)` (service) : note le refus dans
--      `profiles.ruul_ne_pas_inviter` = 'email_not_a_contractor:<email>'. Appelée
--      par `connecter` (ruul_connect.ts) sur un 409 `email_not_a_contractor`.
--   2. `ruul_connect_a_faire` : un posteur ainsi noté n'est plus invité tant que
--      son email Ruul est le même ; dès qu'un autre email est saisi, il redevient
--      « à faire » et l'OS le réinvite seul. Les autres raisons de
--      `ruul_ne_pas_inviter` (texte libre) excluent comme avant.
--   3. Le posteur du 22/11 (Ruul a refusé son email) est noté tout de suite.
--
-- ✅ Appliquée le 2026-11-27 (MCP). Additive.
-- Retour arrière : remettre `ruul_connect_a_faire` (filtre `ruul_ne_pas_inviter is null`
-- seul) ; `drop function public.ruul_email_refuse(uuid, text)`.

set lock_timeout = '5s';

create or replace function public.ruul_email_refuse(p_poster uuid, p_email text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'ruul_email_refuse : réservé au service' using errcode = '42501';
  end if;
  update public.profiles p
     set ruul_ne_pas_inviter = 'email_not_a_contractor:' || lower(btrim(p_email))
   where p.id = p_poster
     and lower(btrim(p.ruul_email)) = lower(btrim(p_email));
end;
$function$;

revoke all on function public.ruul_email_refuse(uuid, text) from public, anon, authenticated;
grant execute on function public.ruul_email_refuse(uuid, text) to service_role;

comment on function public.ruul_email_refuse(uuid, text) is
  'Ruul refuse cet email (409 email_not_a_contractor : déjà un compte business). Le note dans ruul_ne_pas_inviter ; un nouvel email Ruul relance l''invitation (0868).';

create or replace function public.ruul_connect_a_faire(p_limite integer default 100)
returns table(poster_id uuid, email text, prenom text, nom text)
language sql
stable security definer
set search_path to 'public'
as $function$
  select p.id, lower(btrim(p.ruul_email)),
         coalesce(nullif(btrim(h.prenom_legal), ''), nullif(btrim(p.prenom), ''), split_part(p.ruul_email, '@', 1)),
         coalesce(nullif(btrim(h.nom_legal), ''), nullif(btrim(p.nom), ''), '-')
    from public.profiles p
    left join public.hub_posteurs h on h.profile_id = p.id
    left join public.ruul_liens l on l.poster_id = p.id
   where p.canal_paie = 'ruul' and p.is_active
     and nullif(btrim(coalesce(p.ruul_email, '')), '') is not null
     -- 0868 : un email refusé par Ruul n'exclut que tant qu'il est toujours l'email Ruul du posteur.
     and (nullif(btrim(coalesce(p.ruul_ne_pas_inviter, '')), '') is null
          or (p.ruul_ne_pas_inviter like 'email_not_a_contractor:%'
              and substr(p.ruul_ne_pas_inviter, 24) <> lower(btrim(p.ruul_email))))
     and p.relances_stop_at is null
     and coalesce(p.ruul_onboarding, '') <> 'READY'
     and (l.poster_id is null or l.cree_at < now() - interval '48 hours')
   order by l.cree_at nulls first, p.cohorte_lundi nulls last
   limit greatest(1, least(coalesce(p_limite, 100), 300));
$function$;

-- 3. Le posteur du 22/11 : Ruul a refusé son email (réponse du support, 27/11).
update public.profiles
   set ruul_ne_pas_inviter = 'email_not_a_contractor:' || lower(btrim(ruul_email))
 where canal_paie = 'ruul'
   and id = '6c52c9a1-872e-4667-8769-a076fdce1926'
   and nullif(btrim(coalesce(ruul_email, '')), '') is not null
   and ruul_ne_pas_inviter is null;
