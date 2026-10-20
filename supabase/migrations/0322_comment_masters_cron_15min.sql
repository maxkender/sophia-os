-- 0322 : le cron des comment masters passe de l'heure au quart d'heure.
--
-- À PASSER APRÈS le déploiement de la fonction `comment-masters` de 0321, et
-- pas avant : l'ancienne fonction relève TOUS les posts de moins de 12 h à
-- chaque appel, quatre appels par heure lui coûteraient quatre fois plus.
--
-- POURQUOI. Depuis 0321, la cadence de 2 h est tenue post par post
-- (`comment_master_suivis.dernier_releve_at`), plus par le cron. Un passage
-- qui n'a rien à relever ne coûte rien (aucun appel Apify). Le quart d'heure
-- sert à deux choses :
--   * les relevés tombent à 2 h, 4 h, 6 h… de la publication à 15 min près,
--     au lieu d'une heure près (le relevé de 12 h existe vraiment) ;
--   * un run Apify trop lent pour être attendu dans le passage (coupure à
--     150 s) est relevé au passage suivant, 15 min plus tard, et pas 1 h.
--
-- Le secret reste dans la commande du job existant : seul l'horaire change.
--
-- Retour arrière : la même chose avec '7 * * * *'.

do $$
declare
  v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'comment-masters';
  if v_job is null then
    raise exception '0322 : job comment-masters introuvable';
  end if;
  perform cron.alter_job(v_job, schedule := '*/15 * * * *');
end $$;
