-- 0254 : vue `label_reserve` — combien de jours de passages il reste par label.
--
-- POURQUOI. Le pool se vide sans que personne le voie venir : le 21/09,
-- `smart_girl` (60 comptes) n'avait plus que 5 jours de réserve et rien ne
-- l'affichait. On ne s'en apercevait qu'au moment où l'assignation resservait
-- le même slideshow au même compte.
--
-- POURQUOI EN SQL ET PAS DANS LE FRONT. Le calcul croise `contenu_labels`
-- (3 369 lignes), `contenu_tier_etat` (3 375) et `compte_labels` : lu depuis le
-- navigateur, ça dépasse le plafond `max-rows` de PostgREST et le chiffre sort
-- FAUX sans le dire — précisément la panne que la 0253 vient de corriger côté
-- moteur, et le front n'a pas le garde-fou de `serviceClient`. Ici la vue rend
-- une ligne par label : le front lit dix lignes, jamais des milliers.
--
-- LA DEMANDE EST THÉORIQUE, PAS HISTORIQUE, et c'est le choix qui compte. On
-- aurait pu diviser le stock par la consommation observée des N derniers jours.
-- Mais cette moyenne s'effondre justement quand le pool est à sec — un label
-- affamé consomme peu, donc sa réserve paraîtrait LONGUE au pire moment. On
-- divise donc par ce que les comptes vont réclamer demain.
--
-- RÉPARTITION MULTI-LABEL : `choisirContenu` pioche dans l'UNION des labels du
-- compte, donc un compte à deux labels ne pèse pas deux fois son quota. Sa
-- demande est divisée entre ses labels (28 comptes sur 145 sont dans ce cas).
-- C'est une approximation : le moteur peut très bien servir un compte à 100 %
-- sur un seul de ses labels. Elle reste plus juste que le double comptage.
--
-- QUI COMPTE DANS LA DEMANDE : exactement les comptes que l'assignation sert
-- (voir `listerComptesSousQuota`) — actifs, hors `cm`, hors `ugc_ai_video`, et
-- dont le warmup est terminé. Un compte dont le warmup n'a jamais démarré ne
-- tire rien du pool, donc ne réduit rien ; le jour où il démarre, la réserve
-- baisse d'un coup. C'est voulu : la vue dit ce qui se passe, pas ce qui
-- devrait se passer.
--
-- CE QUE `reserve_jours` NE DIT PAS : ce n'est pas une prédiction, c'est un
-- PLANCHER. Le stock se recharge à chaque requalification (un contenu qui finit
-- son cycle repart avec les passages de son nouveau rang) et à chaque import.
-- La vue répond « combien de jours si plus rien n'entrait et plus rien n'était
-- requalifié », ce qui est la bonne question pour décider s'il faut sourcer.
--
-- `reserve_jours` est NULL quand aucun compte ne porte le label : une réserve
-- infinie n'a pas de sens, et un 999 ferait croire à une mesure.

create or replace view public.label_reserve as
with stock as (
  select
    cl.label_id,
    count(distinct c.id)            as contenus_prets,
    coalesce(sum(e.restants), 0)    as passages_restants
  from public.contenu_labels cl
  join public.contenus c
    on c.id = cl.contenu_id
   and c.statut = 'valide'
   and c.import_statut = 'done'
  join public.contenu_tier_etat e on e.contenu_id = c.id
  group by cl.label_id
),
demande as (
  select
    cl.label_id,
    count(*) as comptes,
    -- Même plafond que le moteur : posts_par_jour est borné à [1, 3] par
    -- compte avant d'être consommé (`listerComptesSousQuota`).
    sum(
      least(3, greatest(1, coalesce(co.posts_par_jour, 1)))::numeric
      / nullif(n.nb_labels, 0)
    ) as demande_jour
  from public.compte_labels cl
  join public.comptes co
    on co.id = cl.compte_id
   and co.is_active
   and coalesce(co.type_compte, '') <> 'cm'
   and coalesce(co.ugc_ai_video, false) = false
   and co.warmup_ends_at is not null
   and co.warmup_ends_at <= now()
  join lateral (
    select count(*) as nb_labels
    from public.compte_labels x
    where x.compte_id = co.id
  ) n on true
  group by cl.label_id
)
select
  l.id                                  as label_id,
  l.nom,
  l.slug,
  l.application_id,
  coalesce(s.contenus_prets, 0)         as contenus_prets,
  coalesce(s.passages_restants, 0)      as passages_restants,
  coalesce(d.comptes, 0)                as comptes,
  round(coalesce(d.demande_jour, 0), 2) as demande_jour,
  case
    when coalesce(d.demande_jour, 0) > 0
      then round(coalesce(s.passages_restants, 0)::numeric / d.demande_jour, 1)
    else null
  end                                   as reserve_jours
from public.labels l
left join stock s   on s.label_id = l.id
left join demande d on d.label_id = l.id;

comment on view public.label_reserve is
  'Réserve de passages par label : stock restant (contenus valides et importés, passages tierlist non consommés) divisé par la demande quotidienne des comptes servis par l''assignation. PLANCHER et non prédiction — le stock se recharge à chaque requalification et à chaque import. reserve_jours est NULL quand aucun compte ne porte le label. La demande d''un compte multi-label est répartie entre ses labels, parce que choisirContenu pioche dans leur union.';

grant select on public.label_reserve to authenticated;
grant select on public.label_reserve to service_role;

-- Comme en 0253 : `anon` est retiré explicitement, sinon les privilèges par
-- défaut du schéma l'accordent d'office et cette vue en sémantique definer
-- exposerait le stock de contenus à la clé publique du front.
revoke select on public.label_reserve from anon;
