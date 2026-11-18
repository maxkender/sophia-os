-- 0748 : relances KYC Ruul (0747) en 4 passages de 5 minutes le jeudi et le samedi matin : chaque passage s'arrête
-- avant la limite de la fonction et le suivant reprend où il s'est arrêté (une seule relance par jour et par posteur).
-- Additif : l'horaire d'un cron.
do $c$
declare
  v_id bigint;
begin
  select jobid into v_id from cron.job where jobname = 'ruul-kyc-relances';
  if v_id is not null then
    perform cron.alter_job(v_id, schedule := '12,17,22,27 9 * * 4,6');
  end if;
end
$c$;
