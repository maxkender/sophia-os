-- 0845 : un angle de placement peut faire jusqu'à 2000 caractères (500 avant,
-- 0285). Demande du 23/11 : « augmenter la limite de mots pour les angles ».
-- Même borne dans l'OS (ANGLE_LONGUEUR_MAX de angles.ts et angle_placement.ts).
--
-- Retour arrière : remettre la contrainte à 500 (les angles plus longs
-- devront d'abord être raccourcis).

set lock_timeout = '5s';

do $$
declare c text;
begin
  for c in
    select con.conname from pg_constraint con
     where con.conrelid = 'public.angles_placement'::regclass and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%btrim(texte)%'
  loop
    execute format('alter table public.angles_placement drop constraint %I', c);
  end loop;
end $$;

alter table public.angles_placement
  add constraint angles_placement_texte_check check (length(btrim(texte)) between 1 and 2000);
