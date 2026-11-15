-- 13/11 (Max) : alerte dans « Aujourd'hui » quand il reste moins de 1 000 crédits Brevo.
-- os_aujourdhui renvoie aussi brevo_credits (relevé par la fonction emails toutes les 10 min).

create or replace function public.os_aujourdhui()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'pour_max', (select count(*) from public.support_demandes where niveau = 'max' and statut in ('ouvert', 'attente_posteur')),
    'pour_adrien', (select count(*) from public.support_demandes where coalesce(niveau, 'adrien') = 'adrien' and escalade_at is not null and statut in ('ouvert', 'attente_posteur')),
    'ruul_a_inviter', (select count(*) from public.profiles where canal_paie = 'ruul' and is_active and ruul_statut = 'a_ajouter'),
    'contrats_a_relier', (select count(*) from public.accueils a left join public.upwork_contrats u on u.contrat_id::text = a.contrat_id where a.statut = 'a_relier' and a.classement is null and coalesce(btrim(u.organisation_nom), 'VIk Studios') ilike 'vik studios'),
    'ruul_import_heures', (select floor(extract(epoch from now() - max(at)) / 3600)::int from public.ruul_imports where type = 'statuts'),
    'creations_echouees', (select count(*) from public.hub_echecs e where e.resolu_at is null and e.dernier_at > now() - interval '7 days' and not exists (select 1 from public.hub_posteurs h where h.hub_id = e.hub_id and h.statut = 'cree')),
    'parcours_erreurs', (select count(*) from public.ruul_parcours_envois where not ok and envoye_at > now() - interval '24 hours'),
    -- 0700 : les emails (Brevo).
    'emails_en_file', (select count(*) from public.emails_envois where statut = 'en_file'),
    'emails_non_delivres', (select count(*) from public.emails_envois where statut in ('refuse', 'abandonne') and cree_at > now() - interval '24 hours'),
    'brevo_sans_credit', coalesce((select (valeur ->> 'sans_credit')::boolean from public.reglages where cle = 'emails_brevo'), false),
    'brevo_cle_absente', coalesce((select (valeur ->> 'cle_absente')::boolean from public.reglages where cle = 'emails_brevo'), false),
    -- 0701 : les crédits Brevo restants (alerte sous 1 000).
    'brevo_credits', (select (valeur ->> 'credits')::numeric from public.reglages where cle = 'emails_brevo' and jsonb_typeof(valeur -> 'credits') = 'number'))
  where public.is_admin();
$function$;
