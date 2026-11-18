-- 0751 : warm-up, le bot Help et le dashboard lisent la même donnée (Max, 18/11 : « le dashboard affiche
-- warm-up pas fini pendant que le bot dit tout est OK »). Le bandeau du dashboard suit le minuteur du compte
-- (warmup_started_at / warmup_ends_at : à lancer, en cours jusqu'au lundi, terminé) ; le bot ne lisait que
-- compte_pret (abonnements validés). support_etat_reel donne maintenant aussi la fin et le statut du minuteur,
-- calculés comme statutWarmup côté dashboard.
-- Additif : la fonction est recréée à l'identique, avec deux champs de plus.
do $p$
declare
  d text := pg_get_functiondef('public.support_etat_reel(uuid)'::regprocedure);
  avant text := $a$'releve_at', w.releve_at, 'debut', c.warmup_started_at)$a$;
begin
  if position('0751' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0751 : support_etat_reel ne correspond pas'; end if;
  execute replace(d, avant, $a$'releve_at', w.releve_at, 'debut', c.warmup_started_at, 'fin', c.warmup_ends_at /* 0751 */,
                                         'minuteur', case when c.warmup_started_at is null or c.warmup_ends_at is null then 'attente'
                                                          when c.warmup_ends_at > now() then 'en_cours' else 'termine' end)$a$);
end
$p$;
