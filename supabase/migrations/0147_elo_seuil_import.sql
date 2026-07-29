-- Seuil ELO à l'import v-next : on ne nettoie / traduit un TikTok
-- que pour les langues dont le score cold-start dépasse ce seuil.
-- Si aucune langue ne passe → le TikTok n'est pas importé.
-- N'altère ni posts, ni sujets, ni sources existants.

update public.reglages
set valeur = coalesce(valeur, '{}'::jsonb) || '{"elo_seuil_import": 55}'::jsonb,
    updated_at = now()
where cle = 'scoring'
  and (valeur->>'elo_seuil_import') is null;
