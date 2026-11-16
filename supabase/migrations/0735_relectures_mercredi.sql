-- 0735 : la relecture simple part le mercredi, plus le samedi (16/11).
--
-- Décision d'Adrien : les 15 posts de la semaine partent aux relecteurs natifs
-- le mercredi à 8 h 07 UTC (au lieu du samedi, 0631). Même appel, même tirage
-- (0632, 0729) ; seul le jour change. Le premier lot du mercredi part le
-- 18/11. Les relectures du samedi 14/11 encore à faire restent dans l'espace
-- des relecteurs, devant les nouvelles.
--
-- La consolidation des règles natives (0734) reste le lundi : elle reprend
-- les relectures faites dans la semaine et triées depuis.
--
-- Retour arrière : rejouer le bloc cron de 0631 ('7 8 * * 6').

do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'relectures-hebdo') then
    perform cron.unschedule('relectures-hebdo');
  end if;
  perform cron.schedule('relectures-hebdo', '7 8 * * 3', 'select public.relectures_envoyer_toutes(15, 14);');
end
$cron$;
