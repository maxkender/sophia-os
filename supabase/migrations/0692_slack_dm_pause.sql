-- 0692 : URGENT (Max, 12/11) — liaisons Slack fausses (rattachées par le prénom).
-- Interrupteur des DM Slack aux posteurs : `slack_dm_posteurs` ("off" | "on"), posé sur "off".
-- Tant qu'il est sur "off", aucun DM Slack ne part vers un posteur (relances, réponses, liens),
-- jusqu'à ce que Max dise OK. Additif : un réglage.
insert into public.reglages (cle, valeur)
select 'slack_dm_posteurs', '"off"'::jsonb
 where not exists (select 1 from public.reglages where cle = 'slack_dm_posteurs');
