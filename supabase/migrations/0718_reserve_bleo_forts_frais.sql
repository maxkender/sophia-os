-- 0718 : la réserve d'un label se compte en posts « forts et frais » (BLEO),
-- plus en passages restants de la tierlist (décision d'Adrien du 14/11,
-- option 3, appliquée tout de suite aux prochaines assignations).
--
-- POURQUOI. La réserve (« runway », stock des labels du Pilotage, poids et
-- « réserve basse » du choix de label) comptait les passages restants du cycle
-- de la tierlist. BLEO n'use plus les contenus ainsi : 3 520 contenus étaient
-- « épuisés » alors que BLEO les ressert, et 381 vieux imports d'alpha_male
-- comptaient comme restants alors qu'ils ne seront jamais postés.
--
-- LA MESURE. Pour un label (application Sophia) :
--   * un contenu est FORT ET FRAIS dans une langue quand sa valeur BLEO du jour
--     (`bleo_valeurs.valeur` : forme × 0,6 par post récent dans la langue ×
--     0,75 par post de la même accroche × âge) est d'au moins 3. Posts de la
--     récolte du 3 au 12/11 : valeur 3 à 4 = 5 900 vues de moyenne, 4 à 6 =
--     13 900, 6 et plus = 30 000 ; sous 3, 4 000 au plus ;
--   * il compte pour autant de posts qu'il peut en faire avant de passer sous
--     3 (chaque post dans la langue × 0,6) ; seules les langues où le label a
--     un compte actif comptent ;
--   * la demande est ce que la récolte du label a réellement posté par jour sur
--     les 7 derniers jours (passages `valeur`) ; un label sans récolte encore
--     garde la demande de ses comptes ;
--   * réserve = posts forts et frais ÷ demande.
-- Au 14/11 : weird_alpha 0,4 j, alpha_male_yellow 4,6, smart_girl 5,2, RH 7,8,
-- clean_study 8,7, alpha_male 9,4, beau_smart_girl 11,1 (contre 3,9 à 6,8 avec
-- l'ancienne mesure, sans rapport avec ce que BLEO peut servir).
--
-- OÙ ÇA JOUE. `label_application_reserve` garde ses colonnes ; pour Sophia,
-- `contenus_prets` = contenus forts et frais, `passages_restants` = posts
-- forts et frais, `demande_jour` = la récolte par jour. Tout ce qui la lit
-- suit : le choix de label à la création (capacité, réserve basse sous 4 j,
-- « à sec » sous 1 j), la page Répartition, le stock du Pilotage, le sanity
-- du matin, le tableau des podz. Les autres applications gardent l'ancienne
-- mesure. Réglages : `reglages.bleo.reserve` (valeur_forte 3, jours_demande 7).
--
-- Retour arrière : recréer la vue depuis 0656 (ou retirer le join `br`) ; la
-- vue `bleo_reserve_label` peut rester.

update public.reglages
   set valeur = jsonb_set(valeur, '{reserve}', '{"valeur_forte": 3, "jours_demande": 7, "fatigue_post": 0.6}'::jsonb, true)
 where cle = 'bleo';

create or replace function public.bleo_reserve_reglage(p_cle text, p_defaut numeric)
returns numeric
language sql
stable
as $function$
  -- Sans security definer ni search_path : la fonction est inlinée, le réglage
  -- est lu une seule fois par requête (sous-requête constante).
  select coalesce((select (valeur->'reserve'->>p_cle)::numeric from public.reglages where cle = 'bleo'), p_defaut);
$function$;

comment on function public.bleo_reserve_reglage(text, numeric) is
  'Réserve BLEO (0718) : un réglage de reglages.bleo.reserve, lu une fois par requête.';

create or replace view public.bleo_reserve_label as
with langues_actives as (
  select distinct cl.label_id, lower(co.langue) as langue
    from compte_labels cl
    join comptes co on co.id = cl.compte_id
   where co.is_active
),
forts as (
  select xl.label_id,
         count(distinct v.contenu_id) as contenus_forts,
         sum(floor(ln(v.valeur / public.bleo_reserve_reglage('valeur_forte', 3))
                   / ln(1 / public.bleo_reserve_reglage('fatigue_post', 0.6))) + 1) as posts_forts
    from bleo_valeurs v
    join contenus c on c.id = v.contenu_id and c.statut = 'valide' and c.import_statut = 'done'
    join contenu_labels xl on xl.contenu_id = v.contenu_id
    join langues_actives la on la.label_id = xl.label_id and la.langue = v.langue
   where v.valeur >= public.bleo_reserve_reglage('valeur_forte', 3)
   group by xl.label_id
),
recolte as (
  select xl.label_id,
         count(*)::numeric / public.bleo_reserve_reglage('jours_demande', 7) as demande_jour
    from passages pa
    join contenu_labels xl on xl.contenu_id = pa.contenu_id
   where pa.file_bleo = 'valeur'
     and pa.date_publication_prevue between current_date - public.bleo_reserve_reglage('jours_demande', 7)::int
                                        and current_date - 1
   group by xl.label_id
)
select l.id as label_id,
       coalesce(f.contenus_forts, 0)::bigint as contenus_forts,
       coalesce(f.posts_forts, 0)::numeric as posts_forts,
       r.demande_jour
  from labels l
  left join forts f on f.label_id = l.id
  left join recolte r on r.label_id = l.id;

comment on view public.bleo_reserve_label is
  'Réserve BLEO d''un label (0718) : contenus et posts forts et frais (valeur BLEO ≥ valeur_forte dans une langue où le label a un compte actif), et la récolte réellement postée par jour.';

grant select on public.bleo_reserve_label to authenticated, service_role;

-- La vue des réserves suit, pour Sophia : mêmes colonnes, nouvelle mesure.
do $$
declare
  d text := pg_get_viewdef('public.label_application_reserve'::regclass, true);
  avant text;
  n integer;
  a1 text := $a$    COALESCE(s.contenus_prets, 0::bigint) AS contenus_prets,
    COALESCE(s.passages_restants, 0::numeric) AS passages_restants,
    COALESCE(d.comptes, 0::bigint) AS comptes,
    round(COALESCE(d.demande_jour, 0::numeric), 2) AS demande_jour,
        CASE
            WHEN COALESCE(d.demande_jour, 0::numeric) > 0::numeric THEN round(COALESCE(s.passages_restants, 0::numeric) / d.demande_jour, 1)
            ELSE NULL::numeric
        END AS reserve_jours$a$;
  b1 text := $b$    CASE WHEN li.application_id = application_id_sophia() THEN COALESCE(br.contenus_forts, 0::bigint)
         ELSE COALESCE(s.contenus_prets, 0::bigint) END AS contenus_prets,
    CASE WHEN li.application_id = application_id_sophia() THEN COALESCE(br.posts_forts, 0::numeric)
         ELSE COALESCE(s.passages_restants, 0::numeric) END AS passages_restants,
    COALESCE(d.comptes, 0::bigint) AS comptes,
    round(CASE WHEN li.application_id = application_id_sophia() AND br.demande_jour > 0::numeric THEN br.demande_jour
               ELSE COALESCE(d.demande_jour, 0::numeric) END, 2) AS demande_jour,
        CASE
            WHEN li.application_id = application_id_sophia() AND br.demande_jour > 0::numeric
                 THEN round(COALESCE(br.posts_forts, 0::numeric) / br.demande_jour, 1)
            WHEN li.application_id = application_id_sophia() AND COALESCE(d.demande_jour, 0::numeric) > 0::numeric
                 THEN round(COALESCE(br.posts_forts, 0::numeric) / d.demande_jour, 1)
            WHEN li.application_id <> application_id_sophia() AND COALESCE(d.demande_jour, 0::numeric) > 0::numeric
                 THEN round(COALESCE(s.passages_restants, 0::numeric) / d.demande_jour, 1)
            ELSE NULL::numeric
        END AS reserve_jours$b$;
  a2 text := $c$LEFT JOIN demande d ON d.label_id = li.label_id AND d.application_id = li.application_id$c$;
  b2 text := $d$LEFT JOIN demande d ON d.label_id = li.label_id AND d.application_id = li.application_id
     LEFT JOIN bleo_reserve_label br ON br.label_id = li.label_id$d$;
begin
  avant := d;
  n := (length(d) - length(replace(d, a1, ''))) / length(a1);
  if n <> 1 then raise exception '0718 : bloc des colonnes trouvé % fois (attendu 1), rien n''est changé', n; end if;
  n := (length(d) - length(replace(d, a2, ''))) / length(a2);
  if n <> 1 then raise exception '0718 : jointure demande trouvée % fois (attendu 1), rien n''est changé', n; end if;
  d := replace(replace(d, a1, b1), a2, b2);
  execute 'create or replace view public.label_application_reserve as ' || rtrim(d, E'; \n');
end;
$$;

insert into supabase_migrations.schema_migrations (version, name, statements)
values (to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS'), 'reserve_bleo_forts_frais', array['voir 0718']);
