-- 0714 : Support, Phase 4 bis « tickets OS » (Max, 13/11).
-- Quand Max ou Adrien met ✅ sur le ticket dans #a-os-tickets (lecture des réactions seulement, rien
-- d'autre ne change dans le système d'Adrien), l'OS le note et prévient le posteur sur son canal
-- (texte modifiable : réglage ticket_regle_texte ; action « ticket_regle_prevenir » de la page Contrôle).
-- Additif : deux colonnes, un réglage, un cron.

alter table public.support_demandes add column if not exists ticket_regle_at timestamptz;
alter table public.support_demandes add column if not exists ticket_prevenu_at timestamptz;

insert into public.reglages (cle, valeur)
select 'ticket_regle_texte', to_jsonb('Good news: it''s fixed. Can you try again?'::text)
where not exists (select 1 from public.reglages where cle = 'ticket_regle_texte');

do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'support-tickets-regles') then
    perform cron.schedule('support-tickets-regles', '9-59/15 * * * *', $cmd$
      select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/support',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"tickets_regles"}'::jsonb, timeout_milliseconds := 60000)
    $cmd$);
  end if;
end
$c$;
