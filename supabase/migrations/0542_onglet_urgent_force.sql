-- 0542 : un « Urgent » forcé reste Urgent.
--
-- Depuis 0538, probleme_onglet regardait le rituel AVANT l'urgent forcé : une
-- carte forcée en Urgent (question à Max, bot « urgent », bot FAQ « passed to
-- the team ») qui avait aussi un sujet de décision était rangée « samedi », et
-- le trigger l'enregistrait comme un 📅 Samedi forcé (comme si Max l'avait
-- choisi). Maintenant : 📅 de Max → risque / HM → Urgent forcé → décision → bot
-- pas sûr → bots. Le rituel (Weekly decisions) ne dépend pas de l'onglet.
--
-- Réparation : les cartes ouvertes forcées « samedi » sans 📅 Samedi de Max
-- (journal « samedi ») ni décision « samedi » reprennent leur niveau calculé ;
-- celles du bot FAQ (« faq_attente ») repassent en Urgent forcé.

create or replace function public.probleme_onglet(p public.problemes)
returns text
language sql
stable
as $$
  with cats as (
    select p.categorie as c
    union all
    select s->>'categorie' from jsonb_array_elements(coalesce(p.sujets, '[]'::jsonb)) s
  )
  select case
    -- 📅 choisi par Max : Weekly decisions.
    when p.niveau_force and p.niveau = 'samedi' then 'samedi'
    -- Le quotidien à risque, ou une HM : ⚡ pour Max.
    when coalesce(p.sujet, 'posteur') = 'hm'
      or exists (select 1 from cats where c in ('menace', 'hors_plateforme', 'suspect', 'upwork_mauvais_compte', 'contrat_hm'))
      then 'urgent'
    -- 0542 : « urgent » forcé (Max, un bot, le bot FAQ) : ⚡, même avec un sujet de décision.
    when p.niveau_force and p.niveau = 'urgent' then 'urgent'
    -- Une décision : Weekly decisions (« samedi » = l'onglet des décisions).
    when public.probleme_rituel(p) is not null then 'samedi'
    -- Un bot pas sûr : ⚡.
    when coalesce(p.confiance, 1) < 0.8 then 'urgent'
    else 'bots'
  end;
$$;

-- Réparation des 📅 forcés qui ne viennent pas de Max.
update public.problemes p
   set niveau = case when p.journal @> '[{"action":"faq_attente"}]' then 'urgent' else 'bots' end,
       niveau_force = p.journal @> '[{"action":"faq_attente"}]',
       journal = p.journal || jsonb_build_object('at', now(), 'par', '0542', 'action', 'niveau_repare',
                                                 'raison', 'samedi forcé par erreur (0538), pas un choix de Max'),
       maj_at = now()
 where p.statut = 'ouvert' and p.niveau_force and p.niveau = 'samedi'
   and not exists (select 1 from jsonb_array_elements(p.journal) j
                    where j->>'action' = 'samedi'
                       or (j->>'action' = 'decision' and coalesce(j->>'libelle', '') <> '' and p.decision_choisie is not null));

-- Reclassement (le trigger recalcule le niveau).
update public.problemes set niveau = niveau where statut = 'ouvert';
