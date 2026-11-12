-- 0685 : la Boîte de Support (Max, 12/11).
--  - « Envoyer en ticket à l'OS » : la demande part dans #a-os-tickets (l'IT guy la traite) ; on garde
--    quand, par qui, et le message Slack du ticket.
--  - « Avoir le contexte » : l'analyse de tout ce que l'OS sait sur le posteur, gardée sur la demande.
-- Additif : cinq colonnes. support_detail renvoie déjà toute la ligne (to_jsonb).

alter table public.support_demandes add column if not exists ticket_at timestamptz;
alter table public.support_demandes add column if not exists ticket_slack_ts text;
alter table public.support_demandes add column if not exists ticket_par uuid;
alter table public.support_demandes add column if not exists contexte_analyse text;
alter table public.support_demandes add column if not exists contexte_at timestamptz;
