-- 0429 — Le lien d'invitation Slack (réglage slack_lien_invitation), donné par
-- l'utilisateur le 29 oct. : il remplace celui que 0423 avait repris de
-- l'ancien code. Modifiable ensuite dans l'OS.
update public.reglages
   set valeur = to_jsonb('https://join.slack.com/t/sophia-system/shared_invite/zt-4e853lm47-rZcsBVSNXS88LGanfagACQ'::text),
       updated_at = now()
 where cle = 'slack_lien_invitation';
