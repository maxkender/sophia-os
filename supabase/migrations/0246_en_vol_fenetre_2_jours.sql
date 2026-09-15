-- Fenêtre de réservation `en_vol` : 7 jours → 2 jours.
--
-- Un passage assigné mais non publié réserve son créneau (`restants` baisse)
-- pour éviter que le même slideshow parte chez cinq créateurs le même jour.
-- La fenêtre est la soupape : passé ce délai, un passage jamais publié cesse
-- de réserver et le slideshow retourne au pool.
--
-- À 7 jours, un post oublié gelait un créneau une semaine entière — sur un
-- pool tendu, c'est une semaine de quota perdue. 2 jours suffisent : au-delà,
-- un post non publié ne part plus.
--
-- Seule la ligne `- 7` → `- 2` change ; le reste de la vue est identique à
-- 0237_tierlist.sql.

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
  p.dernier_publie_at                    as dernier_publie_at
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
    max(s.publie_at) filter (where s.statut = 'publie')            as dernier_publie_at
  from public.passages s
  where s.contenu_id = c.id
    and s.tier_cycle = c.tier_cycle
    and s.est_rappel = false
) p on true;

comment on view public.contenu_tier_etat is
  'Avancement du cycle tierlist par contenu : passages publiés, en vol (réservés 2 jours), restants, moyenne (m) et max de vues.';

grant select on public.contenu_tier_etat to authenticated;
grant select on public.contenu_tier_etat to service_role;
