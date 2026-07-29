-- ELO import : plus d'écart entre 1k et 20k vues.
-- Cause principale de la compression 56–59 : regularisation_k=5 des comptes
-- était réutilisée pour l'ELO (kk=2.5 → tout tire vers prior 50).
-- On introduit elo_regularisation_k (défaut 1), poids vues 90 %, plafond 80k.
-- Recalcule les scores contenu_langues existants (formule log^1.3).

update public.reglages
set valeur = coalesce(valeur, '{}'::jsonb) || jsonb_build_object(
      'elo_poids_vues', 0.9,
      'elo_vues_plafond', 80000,
      'elo_regularisation_k', 1
    ),
    updated_at = now()
where cle = 'scoring';

-- Recalcule ELO cold-start pour chaque contenu_langue.
do $$
declare
  prior double precision := 50;
  k double precision := 1;
  poids double precision := 0.9;
  plafond double precision := 80000;
  seuil double precision := 55;
  exp_vues constant double precision := 1.3;
  r record;
  vues double precision;
  pert double precision;
  vues_score double precision;
  base double precision;
  kk double precision;
  elo double precision;
  den double precision;
begin
  select
    coalesce((valeur->>'score_prior')::float, 50),
    coalesce((valeur->>'elo_regularisation_k')::float, 1),
    coalesce((valeur->>'elo_poids_vues')::float, 0.9),
    coalesce((valeur->>'elo_vues_plafond')::float, 80000),
    coalesce((valeur->>'elo_seuil_import')::float, 55)
  into prior, k, poids, plafond, seuil
  from public.reglages
  where cle = 'scoring';

  den := power(ln(1 + greatest(plafond, 1)), exp_vues);
  if den <= 0 then
    return;
  end if;

  for r in
    select
      cl.id as cl_id,
      cl.langue,
      c.langue_source,
      coalesce(c.vues_source, 0)::float as vues,
      coalesce(c.pertinence_score, 0)::float as pert,
      coalesce(c.import_elo_force_seuil, false) as force_seuil
    from public.contenu_langues cl
    join public.contenus c on c.id = cl.contenu_id
  loop
    vues := greatest(r.vues, 0);
    pert := least(100, greatest(0, r.pert));
    vues_score := least(100, greatest(0, power(ln(1 + vues), exp_vues) / den * 100));
    base := (1 - poids) * pert + poids * vues_score;
    kk := case when r.langue = r.langue_source then k / 2.0 else k * 2.0 end;
    elo := (kk * prior + base) / (kk + 1);
    if r.force_seuil then
      elo := greatest(elo, seuil);
    end if;

    update public.contenu_langues
    set score = elo,
        score_maj_at = now()
    where id = r.cl_id;
  end loop;
end $$;
