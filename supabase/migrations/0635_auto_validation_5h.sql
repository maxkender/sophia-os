-- 0635 : la validation automatique des podz passe à 5 h après le dépôt, et
-- tourne toutes les 10 minutes (Adrien, 1/11).
--
-- Avec BLEO, un contenu n'entre dans le plan qu'une fois validé ET passé par la
-- nuit (famille, valeur), au tirage de 14 h suivant. À 12 h après un dépôt de
-- 7-8 h, la validation tombait entre 19 h et 4 h (le cron horaire valide une
-- dizaine de livraisons par passage, budget de 90 s) : publication à J+2. À 5 h,
-- et avec un passage toutes les 10 minutes, les dépôts du matin sont validés
-- vers 11 h-13 h 30. La spec prévoyait 6 h (L7).
--
-- Appliquée le 1/11 à 10 h 20 (execute_sql). Retour arrière :
--   update pods set auto_validation_heures = 12 where auto_validation;
--   select cron.alter_job((select jobid from cron.job where jobname = 'pods-auto-validation'), schedule := '20 * * * *');

update pods set auto_validation_heures = 5
 where auto_validation and auto_validation_heures = 12;

select cron.alter_job((select jobid from cron.job where jobname = 'pods-auto-validation'), schedule := '*/10 * * * *');
