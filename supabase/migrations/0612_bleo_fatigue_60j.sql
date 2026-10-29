-- 0612 : BLEO, la fatigue s'oublie (D41, décision d'Adrien le 29/10).
--
-- A5 comptait `n_post` (passages du contenu dans la langue) et `n_accroche`
-- (passages de la même famille dans la langue) depuis toujours, y compris les
-- passages restés `assigne` des semaines après leur date sans jamais être
-- publiés. La meilleure accroche de weird_alpha (433 000 vues) valait ainsi
-- 0,005 en allemand : 22 passages de la famille, dont 4 jamais publiés.
--
-- Désormais, un passage ne compte dans la fatigue que :
--   * s'il date des `valeur.fatigue_jours` (60) derniers jours ;
--   * et, s'il n'est pas publié, seulement jusqu'à `valeur.fatigue_attente_jours`
--     (3) jours après sa date prévue.
--
-- La fonction de nuit est patchée EN PLACE (sa version en prod diffère du
-- fichier 0602 par des commentaires) : seul le bloc `exp` de A5 change, et la
-- migration échoue si le bloc attendu n'est pas trouvé.

set lock_timeout = '5s';

update public.reglages
   set valeur = jsonb_set(jsonb_set(valeur, '{valeur,fatigue_jours}', '60'), '{valeur,fatigue_attente_jours}', '3')
 where cle = 'bleo';

do $migration$
declare
  src text;
  ancien constant text := $a$  exp as (
    select p.contenu_id, p.langue, count(*) as n
      from passages p
     where p.statut in ('assigne', 'valide_par_poster', 'publie')
     group by p.contenu_id, p.langue
  ),$a$;
  nouveau constant text := $n$  exp as (
    -- D41 : la fatigue s'oublie après `valeur.fatigue_jours` jours, et un passage
    -- jamais publié ne compte que `valeur.fatigue_attente_jours` jours après sa date.
    select p.contenu_id, p.langue, count(*) as n
      from passages p
     where p.statut in ('assigne', 'valide_par_poster', 'publie')
       and p.date_publication_prevue >= v_jour - coalesce((reg->'valeur'->>'fatigue_jours')::int, 60)
       and (p.statut = 'publie'
            or p.date_publication_prevue >= v_jour - coalesce((reg->'valeur'->>'fatigue_attente_jours')::int, 3))
     group by p.contenu_id, p.langue
  ),$n$;
begin
  select prosrc into src from pg_proc where oid = 'public.bleo_nuit(boolean)'::regprocedure;
  if position(ancien in src) = 0 then
    raise exception 'bleo_nuit : bloc exp de A5 introuvable, rien n''est changé';
  end if;
  src := replace(src, ancien, nouveau);
  execute format(
    'create or replace function public.bleo_nuit(p_forcer boolean default false) returns jsonb language plpgsql set search_path to %L as %L',
    'public', src);
end;
$migration$;
