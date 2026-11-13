-- 0686 : réponses des posteurs à nos emails (Max, 12/11, point 10). Brevo transmet l'email à l'OS
-- (fonction support, ?entrant=brevo) : il devient une demande Help. On garde l'expéditeur et le
-- Message-ID (un email n'est jamais traité deux fois). Additif : deux colonnes, un index.
alter table public.support_demandes add column if not exists email_message_id text;
alter table public.support_demandes add column if not exists email_de text;
create unique index if not exists support_demandes_email_message_id_idx
  on public.support_demandes (email_message_id) where email_message_id is not null;
