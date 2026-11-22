-- 0841 : Join v2 (22/11, Max) — formulaire inspiré du site Lovable, provenance, signature avec nom légal et email Ruul,
-- automatisation complète (cron horaire join-relances). MODE TEST : rien de réel (compte OS, Slack, Ruul simulés ;
-- emails et WhatsApp seulement vers les testeurs de join_mode / whatsapp_mode).
-- Uniquement des ajouts sur les tables join_* (créées par 0840) ; aucune autre table, fonction ou cron touché.

alter table public.join_candidatures add column if not exists majeur boolean;              -- « Are you at least 18? »
alter table public.join_candidatures add column if not exists entendu text;               -- ad, referral, sophia_app, other, none
alter table public.join_candidatures add column if not exists parrain text;               -- nom du parrain (si referral)
alter table public.join_candidatures add column if not exists whatsapp_optin_at timestamptz; -- accord WhatsApp (horodaté)
alter table public.join_candidatures add column if not exists source jsonb not null default '{}'::jsonb; -- ref, utm_*, fbclid, landing, at
alter table public.join_candidatures add column if not exists ip_hash text;               -- sha256 de l'IP (limite anti-abus)
alter table public.join_candidatures add column if not exists expire_at timestamptz;      -- offre expirée (J+7 sans signature)
alter table public.join_candidatures alter column age drop not null;

create index if not exists join_candidatures_ip_idx on public.join_candidatures (ip_hash, cree_at);
create index if not exists join_candidatures_cree_idx on public.join_candidatures (cree_at);
create index if not exists join_relances_cand_idx on public.join_relances (candidature_id, etape);

alter table public.join_signatures add column if not exists nom_legal text;
alter table public.join_signatures add column if not exists ruul_email text;

-- Nouveau type d'événement : « expiree ».
do $c$
begin
  if exists (select 1 from pg_constraint where conname = 'join_evenements_type_check') then
    alter table public.join_evenements drop constraint join_evenements_type_check;
  end if;
  alter table public.join_evenements add constraint join_evenements_type_check check (type in (
    'visite', 'candidature', 'verifiee', 'acceptee', 'a_traiter', 'signee', 'connectee', 'tiktok_ok', 'warmup', 'slack',
    'premier_post', 'ruul_ready', 'simule', 'expiree'));
end
$c$;

-- Le cron horaire de Join (la fonction décide : relances, expiration, enchaînement ; mode test strict).
do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'join-relances') then
    perform cron.schedule('join-relances', '23 * * * *', $cmd$
      select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/join',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"relances"}'::jsonb, timeout_milliseconds := 120000)
    $cmd$);
  end if;
end
$c$;
