-- 0287 : chiffres du nouveau choix de label (création d'un compte, et
-- réaffectation des comptes d'un label fermé à l'assignation de nuit).
--
-- CE QUI CHANGE PAR RAPPORT À 0275. Le choix équilibré pesait chaque label à
-- √(contenus validés) × performance lissée. Analyse du 15/10 : le stock
-- écrasait la performance (RH, meilleur label à 1,45, recevait 8,9 % des
-- nouveaux comptes ; alpha_male, à 0,90, 19,5 %), le stock comptait tout ce
-- qui avait été validé et pas ce qui reste à poster, et un label vidé de ses
-- comptes redevenait « en retard » : `sam.focus429` est né le 15/10 dans
-- alpha_male_film une heure après qu'on en a sorti les dix comptes.
--
-- Le nouveau calcul vit dans `_shared/choix_label_equilibre.ts` ; cette
-- fonction lui donne, pour les labels candidats, en une lecture :
--   - comptes_langue / comptes_pays / comptes_total : liens actifs compte ↔
--     label dans la langue du compte, dans son pays, dans toute la flotte ;
--   - passages_restants / demande_jour : la réserve du label POUR
--     L'APPLICATION (vue `label_application_reserve`) — ce qui reste à poster
--     et ce que ses comptes consomment par jour ;
--   - passages / perf_label / perf_flotte : comme 0275 (posts 28 jours de
--     l'application, médiane des vues rapportées à la médiane de leur langue) ;
--   - recents_langue / recence_langue, recents_pays / recence_pays : présence
--     parmi les `p_recents` derniers comptes créés dans la langue, et dans le
--     pays (0 = aucun ; sinon p_recents + 1 − rang du plus récent).
--
-- LE PAYS. `p_pays` vide → le pays par défaut de la langue
-- (`pays_defaut_langue`, la table du trigger 0281, désormais à un seul
-- endroit en base). en / ar / es-419 / ru n'en ont pas : sans pays saisi, la
-- dimension pays est simplement absente (0 partout), le choix ne regarde que
-- la langue.
--
-- Additive : deux fonctions nouvelles ; le trigger 0281 est réécrit pour lire
-- la même table, à l'identique (vérification en bas). 0275 reste en place,
-- inutilisée par le nouveau code.
-- Lecture seule. Réservée au service (manage-users, minuit-vnext).
-- Retour arrière :
--   drop function public.stats_choix_label(uuid[], uuid, text, text, integer);
--   (manage-users retombe alors sur « le moins utilisé », minuit-vnext saute
--   la fermeture des labels et le dit dans son avertissement.)

create or replace function public.pays_defaut_langue(p_langue text)
returns text
language sql
immutable
set search_path = public
as $$
  -- Casse ignorée : la RPC reçoit des langues en minuscules (`pt-br`), le
  -- trigger la langue telle que stockée (`pt-BR`).
  select case lower(trim(p_langue))
    when 'fr'    then 'FR'
    when 'de'    then 'DE'
    when 'it'    then 'IT'
    when 'es'    then 'ES'
    when 'pt'    then 'PT'
    when 'pt-br' then 'BR'
    when 'cs'    then 'CZ'
    when 'nl'    then 'NL'
    when 'el'    then 'GR'
    when 'hu'    then 'HU'
    when 'pl'    then 'PL'
    when 'ro'    then 'RO'
    when 'sv'    then 'SE'
    when 'tr'    then 'TR'
    when 'da'    then 'DK'
    when 'no'    then 'NO'
    when 'hr'    then 'HR'
    when 'sl'    then 'SI'
    when 'sk'    then 'SK'
    when 'sr'    then 'RS'
    when 'he'    then 'IL'
    when 'fi'    then 'FI'
    when 'et'    then 'EE'
    when 'bg'    then 'BG'
    else null  -- en, ar, es-419, ru : plusieurs marchés, au HM de trancher
  end;
$$;

comment on function public.pays_defaut_langue(text) is
  'Pays par défaut d''une langue de compte (table du trigger comptes_pays_defaut, 0281). NULL pour en/ar/es-419/ru. Jumeau front : PAYS_PAR_DEFAUT_LANGUE (src/features/moteur/pays.ts).';

-- Même comportement que 0281, la table vit maintenant dans pays_defaut_langue.
create or replace function public.comptes_pays_defaut()
returns trigger
language plpgsql
as $$
begin
  if new.pays is null and new.langue is not null then
    new.pays := public.pays_defaut_langue(new.langue);
  end if;
  return new;
end;
$$;

create or replace function public.stats_choix_label(
  p_labels uuid[],
  p_application uuid,
  p_langue text,
  p_pays text,
  p_recents integer
)
returns table (
  label_id uuid,
  comptes_langue integer,
  comptes_pays integer,
  comptes_total integer,
  passages_restants numeric,
  demande_jour numeric,
  passages integer,
  perf_label numeric,
  perf_flotte numeric,
  recents_langue integer,
  recence_langue integer,
  recents_pays integer,
  recence_pays integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with app as (
    select coalesce(p_application, '00000000-0000-4000-8000-000000000001'::uuid) as id
  ),
  cible as (
    select
      lower(nullif(trim(coalesce(p_langue, '')), '')) as langue,
      coalesce(
        upper(nullif(trim(coalesce(p_pays, '')), '')),
        public.pays_defaut_langue(nullif(trim(coalesce(p_langue, '')), ''))
      ) as pays,
      greatest(coalesce(p_recents, 0), 0) as fenetre
  ),
  lab as (
    select distinct unnest(p_labels) as label_id
  ),
  liens as (
    select cl.label_id, lower(c.langue) as langue, upper(c.pays) as pays
    from compte_labels cl
    join comptes c on c.id = cl.compte_id
    where c.is_active and cl.label_id = any(p_labels)
  ),
  reserve as (
    select r.label_id, r.passages_restants, r.demande_jour
    from label_application_reserve r
    cross join app
    where r.application_id = app.id and r.label_id = any(p_labels)
  ),
  publies as (
    select xl.label_id, pa.vues, lower(pa.langue) as langue
    from passages pa
    join contenu_labels xl on xl.contenu_id = pa.contenu_id
    cross join app
    where xl.label_id = any(p_labels)
      and pa.statut = 'publie'
      and pa.publie_at >= now() - interval '28 days'
      and pa.vues is not null
      and pa.langue is not null
      and coalesce(pa.application_id, '00000000-0000-4000-8000-000000000001'::uuid) = app.id
  ),
  mediane_langue as (
    select p.langue, percentile_cont(0.5) within group (order by p.vues) as med
    from publies p
    group by p.langue
  ),
  rapports as (
    select p.label_id, p.vues / m.med as rapport
    from publies p
    join mediane_langue m on m.langue = p.langue
    where m.med > 0
  ),
  perf as (
    select r.label_id, count(*) as n, percentile_cont(0.5) within group (order by r.rapport) as med
    from rapports r
    group by r.label_id
  ),
  flotte as (
    select percentile_cont(0.5) within group (order by r.rapport) as med from rapports r
  ),
  -- Les derniers comptes actifs portant un label candidat, dans la langue puis
  -- dans le pays : la fenêtre anti-rafale de chaque dimension.
  recents_langue as (
    select c.id, row_number() over (order by c.created_at desc, c.id desc) as rang
    from comptes c, cible
    where c.is_active
      and cible.langue is not null
      and lower(c.langue) = cible.langue
      and exists (select 1 from compte_labels x where x.compte_id = c.id and x.label_id = any(p_labels))
    order by c.created_at desc, c.id desc
    limit (select fenetre from cible)
  ),
  recents_pays as (
    select c.id, row_number() over (order by c.created_at desc, c.id desc) as rang
    from comptes c, cible
    where c.is_active
      and cible.pays is not null
      and upper(c.pays) = cible.pays
      and exists (select 1 from compte_labels x where x.compte_id = c.id and x.label_id = any(p_labels))
    order by c.created_at desc, c.id desc
    limit (select fenetre from cible)
  ),
  porteurs_langue as (
    select x.label_id, count(distinct r.id) as nb, max((select fenetre from cible) + 1 - r.rang) as recence
    from recents_langue r
    join compte_labels x on x.compte_id = r.id
    where x.label_id = any(p_labels)
    group by x.label_id
  ),
  porteurs_pays as (
    select x.label_id, count(distinct r.id) as nb, max((select fenetre from cible) + 1 - r.rang) as recence
    from recents_pays r
    join compte_labels x on x.compte_id = r.id
    where x.label_id = any(p_labels)
    group by x.label_id
  )
  select
    lab.label_id,
    (select count(*) from liens l, cible
      where l.label_id = lab.label_id and cible.langue is not null and l.langue = cible.langue)::integer,
    (select count(*) from liens l, cible
      where l.label_id = lab.label_id and cible.pays is not null and l.pays = cible.pays)::integer,
    (select count(*) from liens l where l.label_id = lab.label_id)::integer,
    coalesce(reserve.passages_restants, 0)::numeric,
    coalesce(reserve.demande_jour, 0)::numeric,
    coalesce(perf.n, 0)::integer,
    perf.med::numeric,
    (select med from flotte)::numeric,
    coalesce(pl.nb, 0)::integer,
    coalesce(pl.recence, 0)::integer,
    coalesce(pp.nb, 0)::integer,
    coalesce(pp.recence, 0)::integer
  from lab
  left join reserve on reserve.label_id = lab.label_id
  left join perf on perf.label_id = lab.label_id
  left join porteurs_langue pl on pl.label_id = lab.label_id
  left join porteurs_pays pp on pp.label_id = lab.label_id;
$$;

revoke all on function public.stats_choix_label(uuid[], uuid, text, text, integer) from public;
revoke all on function public.stats_choix_label(uuid[], uuid, text, text, integer) from anon;
revoke all on function public.stats_choix_label(uuid[], uuid, text, text, integer) from authenticated;
grant execute on function public.stats_choix_label(uuid[], uuid, text, text, integer) to service_role;

comment on function public.stats_choix_label(uuid[], uuid, text, text, integer) is
  'Choix de label (manage-users à la création, minuit-vnext pour réaffecter les comptes d''un label fermé) : comptes par label (langue / pays / flotte), réserve de l''application (passages restants, demande par jour), performance 28 j rapportée à la langue, présence parmi les derniers comptes de la langue et du pays. Lecture seule.';

-- APPLIQUÉE le 15/10/2026 en deux temps, enregistrée sous `0287a_pays_defaut_langue`
-- (pays_defaut_langue + trigger) puis `0287b_stats_choix_label`. Vérifiée : SE | BR | NULL | BG.
--
-- Vérification attendue après pose (lecture seule) :
--   select pays_defaut_langue('sv'), pays_defaut_langue('pt-BR'),
--          pays_defaut_langue('en'), pays_defaut_langue('bg');
--   → SE | BR | NULL | BG
