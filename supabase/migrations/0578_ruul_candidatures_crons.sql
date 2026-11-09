-- 0578 : la copie des candidatures du site toutes les 15 min (fonction ruul,
-- action « candidatures »), et deux interrupteurs, éteints : rien ne part
-- vers les candidats sans l'OK de Max.
--   ruul_candidatures_auto  : envoyer au site les décisions (acceptée → lien
--                             de signature ; refusée) ;
--   ruul_relances_signature : relances de signature J+1, J+3, J+6, J+7
--                             expirée, cohorte ratée décalée.
-- relance_base_at : le point de départ des relances de signature (par défaut
-- la date d'acceptation ; remis à maintenant pour un rattrapage).
-- Additif : une colonne, deux réglages, un cron.

alter table public.ruul_candidatures add column if not exists relance_base_at timestamptz;

insert into public.reglages (cle, valeur) values
  ('ruul_candidatures_auto', 'false'::jsonb),
  ('ruul_relances_signature', 'false'::jsonb)
on conflict (cle) do nothing;

do $c$
begin
  perform cron.schedule('ruul-candidatures', '7,22,37,52 * * * *', $cmd$
    select net.http_post(
      url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/ruul',
      headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
      body := '{"action":"candidatures"}'::jsonb,
      timeout_milliseconds := 120000)
  $cmd$);
end
$c$;
