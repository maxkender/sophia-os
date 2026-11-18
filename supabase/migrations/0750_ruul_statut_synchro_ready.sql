-- 0750 : l'étape « paie Ruul » du dashboard et la paie lisent le même statut (Max, 18/11).
-- La paie et l'API Ruul disent « prêt » quand Ruul dit READY (ACTIVE + KYC APPROVED + banque) ; l'ancien champ
-- profiles.ruul_statut (manuel : a_ajouter / invite / pret / paye_1x) restait parfois « invite » : 19 posteurs READY
-- voyaient l'étape non cochée et recevaient encore les relances « finissez votre Ruul » (fonction ruul, statut invite).
-- 1. Trigger : dès que ruul_onboarding passe READY (synchro API), ruul_statut passe « pret » (jamais en arrière,
--    paye_1x reste paye_1x).
-- 2. Rattrapage : les posteurs déjà READY dont ruul_statut est resté a_ajouter / invite / vide passent « pret ».
-- 3. ruul_mon_onboarding : ruul_pret = READY chez Ruul, ou l'ancien statut pret / paye_1x.
-- Additif : un trigger, une fonction recréée (même signature), des statuts alignés sur Ruul.

create or replace function public.ruul_statut_depuis_ready()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.ruul_onboarding = 'READY' and coalesce(new.ruul_statut, '') not in ('pret', 'paye_1x') then
    new.ruul_statut := 'pret';
  end if;
  return new;
end;
$function$;

create or replace trigger ruul_statut_depuis_ready
before insert or update of ruul_onboarding on public.profiles
for each row execute function public.ruul_statut_depuis_ready();

update public.profiles
   set ruul_statut = 'pret'
 where ruul_onboarding = 'READY' and coalesce(ruul_statut, '') not in ('pret', 'paye_1x');

do $p$
declare
  d text := pg_get_functiondef('public.ruul_mon_onboarding()'::regprocedure);
  avant text := $a$'ruul_pret', pr.ruul_statut in ('pret', 'paye_1x'),$a$;
begin
  if position('0750' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0750 : ruul_mon_onboarding ne correspond pas'; end if;
  execute replace(d, avant, $a$'ruul_pret', pr.ruul_statut in ('pret', 'paye_1x') or pr.ruul_onboarding = 'READY' /* 0750 */,$a$);
end
$p$;
