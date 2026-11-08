-- 0556 : le contrôle de cohérence (0555) toutes les heures (:41), et un premier passage tout de suite.
-- Additif : un cron ; le passage bloque les relances prévues des posteurs tués / reportés / en STOP
-- et ouvre une carte « ⚠️ Incohérence » par règle en défaut.

select cron.schedule('coherence-controle', '41 * * * *', $c$select public.coherence_controle()$c$);
select public.coherence_controle();
