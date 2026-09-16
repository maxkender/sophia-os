-- Requalification : sortir du blocage « cycle fini, aucune vue relevée ».
--
-- Jusqu'ici, un slideshow qui avait fait tous ses passages mais dont aucun post
-- ne portait de mesure restait en attente **indéfiniment** : `restants = 0` le
-- sortait du pool, et l'absence de `m` empêchait la requalification de le
-- relancer. Out du pool, jamais requalifié — mort silencieuse.
--
-- La vue gagne de quoi distinguer « pas encore mesuré » de « jamais mesurable » :
--
--   mesures            passages publiés portant une mesure de vues
--   introuvables       publiés dont la résolution a rendu les armes
--                      (`resolution_statut = 'introuvable'`, terminal après
--                      ~2 h 55 — voir docs/resolution-publication.md)
--   en_attente_mesure  publiés, sans vues, résolution encore en cours
--
-- Les trois partitionnent `publies`. `en_attente_mesure = 0` veut dire que plus
-- aucune mesure n'arrivera : on peut trancher tout de suite au lieu d'attendre.
--
-- `dernier_publie_at` tombe en repli sur la date prévue : un créneau coché
-- « publié » sans horodatage rendait la colonne nulle, donc l'âge du cycle
-- immesurable — exactement quand le délai plafond en a besoin.

create or replace view public.contenu_tier_etat as
select
  c.id                                   as contenu_id,
  c.tier,
  c.passages_prevus,
  c.tier_cycle,
  c.tier_maj_at,
  coalesce(p.publies, 0)                 as publies,
  coalesce(p.en_vol, 0)                  as en_vol,
  greatest(
    c.passages_prevus - coalesce(p.publies, 0) - coalesce(p.en_vol, 0),
    0
  )                                      as restants,
  p.moyenne_vues                         as moyenne_vues,
  p.max_vues                             as max_vues,
  coalesce(p.nb_150k, 0)                 as nb_150k,
  p.dernier_publie_at                    as dernier_publie_at,
  -- En queue, et pas au milieu : `create or replace view` n'accepte que des
  -- colonnes ajoutées à la fin, jamais un réordonnancement.
  coalesce(p.mesures, 0)                 as mesures,
  coalesce(p.introuvables, 0)            as introuvables,
  coalesce(p.en_attente_mesure, 0)       as en_attente_mesure
from public.contenus c
left join lateral (
  select
    count(*) filter (where s.statut = 'publie')                    as publies,
    count(*) filter (
      where s.statut <> 'publie'
        and coalesce(s.date_publication_prevue, current_date)
            >= ((now() at time zone 'Europe/Paris')::date - 2)
    )                                                              as en_vol,
    avg(s.vues) filter (where s.statut = 'publie' and s.vues is not null)  as moyenne_vues,
    max(s.vues) filter (where s.statut = 'publie')                 as max_vues,
    count(*) filter (where s.statut = 'publie' and s.vues >= 150000) as nb_150k,
    count(*) filter (where s.statut = 'publie' and s.vues is not null) as mesures,
    count(*) filter (
      where s.statut = 'publie'
        and s.vues is null
        and s.resolution_statut = 'introuvable'
    )                                                              as introuvables,
    count(*) filter (
      where s.statut = 'publie'
        and s.vues is null
        and coalesce(s.resolution_statut, 'a_resoudre') <> 'introuvable'
    )                                                              as en_attente_mesure,
    coalesce(
      max(s.publie_at) filter (where s.statut = 'publie'),
      max((s.date_publication_prevue::timestamp) at time zone 'Europe/Paris')
        filter (where s.statut = 'publie')
    )                                                              as dernier_publie_at
  from public.passages s
  where s.contenu_id = c.id
    and s.tier_cycle = c.tier_cycle
    and s.est_rappel = false
) p on true;

comment on view public.contenu_tier_etat is
  'Avancement du cycle tierlist par contenu : passages publiés, en vol (réservés 2 jours), restants, mesurés / introuvables / en attente de mesure, m, max et nb ≥ 150k.';

grant select on public.contenu_tier_etat to authenticated;
grant select on public.contenu_tier_etat to service_role;

-- Plafond d'attente d'une mesure avant relance du cycle au même rang.
-- 3 jours : au-delà, mieux vaut refaire tourner le slideshow sans note que le
-- laisser dormir. Éditable dans Pilotage.
update public.reglages
set valeur = coalesce(valeur, '{}'::jsonb)
  || jsonb_build_object('requalif_max_jours', 3)
where cle = 'tierlist'
  and not (coalesce(valeur, '{}'::jsonb) ? 'requalif_max_jours');
