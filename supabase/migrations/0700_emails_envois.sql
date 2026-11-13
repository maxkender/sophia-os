-- 13/11 (Max) : Brevo n'avait plus de crédits depuis 01:44 UTC ; les emails « partaient » sans partir.
-- 1. Le journal de chaque email de l'OS : accepté par Brevo ou non (raison), puis délivré ou non.
--    Un refus passager (plus de crédit, Brevo indisponible…) remet l'email en file pour un nouvel essai.
-- 2. Le réglage emails_brevo : les crédits relevés par la fonction `emails` (sans_credit = on met en file).
-- 3. « Aujourd'hui » : emails en file, non délivrés, Brevo sans crédit, clé Brevo absente.
-- 4. La fonction `emails` toutes les 10 minutes (réessais + vérification des livraisons).
-- Ajout seulement : aucune donnée existante modifiée.

create table if not exists public.emails_envois (
  id uuid primary key default gen_random_uuid(),
  destinataire text not null,
  objet text not null,
  -- Le contenu, gardé pour un nouvel essai ; effacé une fois l'email délivré.
  html text,
  texte text,
  desabonnement text,
  tags text[] not null default '{}',
  statut text not null default 'en_file'
    check (statut in ('en_file', 'accepte', 'delivre', 'refuse', 'abandonne', 'renvoye')),
  message_id text,
  erreur text,
  dernier_evenement text,
  tentatives int not null default 0,
  prochain_essai_at timestamptz,
  cree_at timestamptz not null default now(),
  accepte_at timestamptz,
  verifie_at timestamptz,
  livre_at timestamptz
);

create index if not exists emails_envois_statut_idx on public.emails_envois (statut, prochain_essai_at);
create index if not exists emails_envois_message_idx on public.emails_envois (message_id);
create index if not exists emails_envois_dest_idx on public.emails_envois (destinataire, cree_at desc);

-- Le contenu peut porter un mot de passe : lecture par les fonctions (service) seulement.
alter table public.emails_envois enable row level security;
revoke all on public.emails_envois from anon, authenticated;

insert into public.reglages (cle, valeur)
values ('emails_brevo', '{}'::jsonb)
on conflict (cle) do nothing;

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
    'brevo_cle_absente', coalesce((select (valeur ->> 'cle_absente')::boolean from public.reglages where cle = 'emails_brevo'), false))
  where public.is_admin();
$function$;

do $c$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'emails-passage') then
      perform cron.unschedule('emails-passage');
    end if;
    perform cron.schedule('emails-passage', '3-59/10 * * * *', $cmd$
      select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/emails',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"passage"}'::jsonb, timeout_milliseconds := 140000)
    $cmd$);
  end if;
end
$c$;
