-- 0572 : un paiement bloqué par le plafond du jour n'est jamais laissé sans
-- prochain essai (9/11 : 44 lignes de la semaine du 2/11 restées à 0).
--
-- La fonction upwork classe ce refus « plafond » : réessai le lendemain
-- 0 h 05 (Paris), sans la limite du mardi 20 h. La paie automatique ne tourne
-- que le lundi et le mardi (cron paie-auto) ; ce cron horaire des autres jours
-- ne reprend que ces lignes-là (rien d'autre ne part).
-- Additif : un cron, cloné de paie-auto (jamais de secret écrit ici).

do $$
declare
  v_base text := (select command from cron.job where jobname = 'paie-auto');
begin
  if v_base is null then
    raise exception '0572 : cron paie-auto introuvable';
  end if;
  perform cron.schedule('paie-auto-plafond', '7 * * * 0,3,4,5,6', v_base);
end $$;
