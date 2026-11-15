-- 0565 : « lire » (bot_propositions) montre aussi au bot les cartes où il a
-- écrit. Quand le Pay Bot crée une carte de paie pour un posteur qui en a déjà
-- une ouverte, elle est fusionnée dans la carte existante (une carte par
-- posteur, 0532), qui garde son propriétaire (Control Bot, New Cohort Bot).
-- Le Pay Bot ne la revoyait plus jamais (Yusuf, Cane, Balaj, 08/11).
--
-- Désormais : une carte ouverte est lue par son propriétaire ET par tout bot
-- qui y a fusionné, proposé ou créé quelque chose ; le champ « role » dit
-- lequel (proprietaire / contributeur). Aucune carte créée ni dupliquée.
-- La fonction est patchée par remplacement (le reste est inchangé).

do $$
declare
  d text := pg_get_functiondef('public.probleme_bot_lire(text, uuid)'::regprocedure);
  avant_filtre constant text := 'where (o.proprietaire = p_bot and (p_probleme is null or o.id = p_probleme))';
  apres_filtre constant text := 'where ((o.proprietaire = p_bot or exists (select 1 from public.problemes x, jsonb_array_elements(x.journal) jj where x.id = o.id and jj->>''par'' = p_bot and jj->>''action'' in (''fusion'', ''proposer'', ''creer''))) and (p_probleme is null or o.id = p_probleme))';
  avant_champ constant text := '''probleme_id'', o.id, ''poster_id'', o.poster_id,';
  apres_champ constant text := '''probleme_id'', o.id, ''role'', case when o.proprietaire = p_bot then ''proprietaire'' else ''contributeur'' end, ''proprietaire'', o.proprietaire, ''poster_id'', o.poster_id,';
begin
  if position(apres_filtre in d) > 0 then
    return; -- déjà appliquée
  end if;
  if position(avant_filtre in d) = 0 or position(avant_champ in d) = 0 then
    raise exception '0565 : probleme_bot_lire a changé, patch non appliqué';
  end if;
  d := replace(replace(d, avant_filtre, apres_filtre), avant_champ, apres_champ);
  execute d;
end $$;
