-- 0252 : bascule `marco.leader464` et `jakob.fokus628` de alpha_male_film
-- vers weird_alpha.
--
-- POURQUOI. La migration 0251 a vidé alpha_male_film de ses comptes, mais ces
-- deux-là ont été créés le 20/09, après son passage, et portent encore le label
-- retiré du catalogue. Aucun des deux n'a jamais reçu de créneau.
--
-- À NOTER : le label reste proposé à la création d'un compte, donc le cas se
-- reproduira tant qu'il n'est pas retiré du formulaire.
--
-- ORDRE : on AJOUTE avant de RETIRER — les deux comptes n'ont que ce label, et
-- un compte sans label fait échouer `assignerCompteJour`.
--
-- IDEMPOTENTE : rejouée, elle ne trouve plus aucun des deux sur film.

do $$
declare
  id_film     uuid;
  id_weird    uuid;
  cibles      uuid[];
  n_orphelins int;
begin
  select id into id_film  from public.labels where nom = 'alpha_male_film';
  select id into id_weird from public.labels where nom = 'weird_alpha';

  if id_weird is null then
    raise exception '0252 : label weird_alpha introuvable — bascule annulée.';
  end if;
  if id_film is null then
    raise notice '0252 : label alpha_male_film absent — rien à faire.';
    return;
  end if;

  select coalesce(array_agg(c.id), '{}') into cibles
  from public.comptes c
  join public.compte_labels cl on cl.compte_id = c.id and cl.label_id = id_film
  where c.handle_tiktok in ('marco.leader464', 'jakob.fokus628');

  if cardinality(cibles) = 0 then
    raise notice '0252 : aucun des deux comptes sur alpha_male_film — rien à faire.';
    return;
  end if;

  insert into public.compte_labels (compte_id, label_id)
  select unnest(cibles), id_weird
  on conflict (compte_id, label_id) do nothing;

  delete from public.compte_labels
  where label_id = id_film and compte_id = any(cibles);

  select count(*) into n_orphelins
  from public.comptes c
  where c.id = any(cibles)
    and not exists (select 1 from public.compte_labels x where x.compte_id = c.id);
  if n_orphelins > 0 then
    raise exception '0252 : % compte(s) sans label après bascule — annulé.', n_orphelins;
  end if;

  raise notice '0252 : % compte(s) basculé(s) vers weird_alpha.', cardinality(cibles);
end $$;
