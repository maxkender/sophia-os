-- 0294 : les vues du post au moment de la relecture automatique.
--
-- Un post qui dépasse 5 000 vues ne reçoit aucun message de l'agent (« on ne
-- corrige pas ce qui fait des vues ») : ses défauts restent relevés pour
-- l'admin. Seuil : SEUIL_VUES_SANS_REMARQUE dans
-- supabase/functions/_shared/relecture.ts.
--
-- La valeur gardée est la plus fraîche connue : les vues TikTok lues au scrape
-- (Apify) ou le relevé de l'OS (`passages.vues`), la plus grande des deux.

alter table public.relectures_auto add column if not exists vues integer;

comment on column public.relectures_auto.vues is
  'Vues du post au moment de la relecture (max des vues TikTok au scrape et de passages.vues). Au-delà de 5 000 : aucun message.';
