-- 0709 : Max (13/11) : une réponse email d'un posteur devient une demande Support de source « email ».
-- La contrainte des sources accepte « email » (élargie, rien d'autre ne change). Les 2 emails déjà reçus
-- (rangés en « help » faute de mieux) passent en « email » : leur Message-ID prouve qu'ils viennent d'un email.
alter table public.support_demandes drop constraint if exists support_demandes_source_check;
alter table public.support_demandes add constraint support_demandes_source_check
  check (source = any (array['help'::text, 'slack_salon'::text, 'slack_aide'::text, 'email'::text]));
update public.support_demandes set source = 'email' where email_message_id is not null and source = 'help';
