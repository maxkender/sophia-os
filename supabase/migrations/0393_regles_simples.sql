-- 0393 — Chantier du 28 oct., partie A : les règles, en plus simple.
--
-- 1. Réglages (textes aux posteurs, en anglais) :
--    - paie_regle_lien_texte : la règle du lien (déjà appliquée par 0304) ;
--    - warmup_regle_texte    : la règle unique du warm-up (plus de reposts) ;
--    - relance_texte_acces   : la relance « accès » ne parle plus que de la
--      connexion (Slack ne bloque plus). Texte donné par Max le 28 oct.
-- 2. La retenue (décision de Max) : 1 post manqué toléré par compte et par
--    semaine, puis 1 $ par post manqué :
--      retenue du compte = max(0, manqués − paie.manques_toleres) × paie.retenue_par_post
--    à partir de la semaine du 2 nov. (payée le 9). Jusqu'à la semaine du
--    26 oct. (payée le 2 nov.), l'ancienne règle « 10 posts sur 14 = plein ».
--    paie.seuil_posts_complets n'est plus lu ensuite ; le réglage reste.
--    Le reste ne change pas : posts retirés ni attendus ni manqués, jamais
--    négatif, 0 post rien, chaque compte à part.
--
-- Additive : 2 réglages créés s'ils manquent, la clé manques_toleres (1)
-- ajoutée au réglage paie, le texte de relance_texte_acces remplacé (demandé
-- par Max), paie_reglages et paie_calculer_v3 réécrites à signature identique.
-- Les lignes déjà générées dans paie_semaines ne bougent pas.
-- Retour arrière : réappliquer paie_reglages et paie_calculer_v3 de 0380 ;
-- remettre l'ancien texte de relance_texte_acces (0391).

insert into public.reglages (cle, valeur) values
  ('paie_regle_lien_texte', to_jsonb('A post only counts when you mark it published with its link on your dashboard, the same day, before midnight (your time). After midnight it counts as missed.'::text)),
  ('warmup_regle_texte', to_jsonb('Create your TikTok account, click Start warmup and follow 5 accounts before Sunday midnight.'::text))
on conflict (cle) do nothing;

update public.reglages
   set valeur = to_jsonb('Hi {prenom}, to start posting on Monday {date}, please log in to your dashboard today: {url}. Your login is in the welcome message above.'::text),
       updated_at = now()
 where cle = 'relance_texte_acces';

update public.reglages
   set valeur = valeur || jsonb_build_object('manques_toleres', 1), updated_at = now()
 where cle = 'paie' and not (valeur ? 'manques_toleres');

create or replace function public.paie_reglages()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'seuil_posts_complets', coalesce((v->>'seuil_posts_complets')::int, 10),
    'retenue_par_post', coalesce((v->>'retenue_par_post')::numeric, 1),
    'manques_toleres', coalesce((v->>'manques_toleres')::int, 1))
  from (select coalesce((select valeur from public.reglages where cle = 'paie'), '{}'::jsonb) as v) r;
$$;

create or replace function public.paie_calculer_v3(p_lundi date)
returns table (
  poster_id      uuid,
  nb_comptes     integer,
  comptes_payes  integer,
  prevus         integer,
  faits          integer,
  manques        integer,
  tarif          numeric,
  retenue        numeric,
  montant        numeric,
  statut         text,
  raison         text,
  action         text,
  detail_comptes jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with reg as (
    select (r->>'seuil_posts_complets')::int as seuil, (r->>'retenue_par_post')::numeric as par_post,
           (r->>'manques_toleres')::int as toleres,
           -- La règle de la tolérance vaut à partir de la semaine du 2 nov. (payée le 9).
           p_lundi >= date '2026-11-02' as tolerance
      from (select public.paie_reglages() as r) x
  ),
  bornes as (
    select (p_lundi::timestamp at time zone 'Europe/Paris') as debut,
           ((p_lundi + 7)::timestamp at time zone 'Europe/Paris') as fin,
           -- Lundi 10 h de la semaine suivante : un arrêt jusque-là vaut pour cette paie.
           (((p_lundi + 7)::timestamp + interval '10 hours') at time zone 'Europe/Paris') as coupure
  ),
  posteurs as (
    select pr.id, pr.is_active, pr.tarif_hebdo
      from public.profiles pr
     where exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
  ),
  comptes_semaine as (
    select c.id, c.poster_id, c.handle_tiktok,
           count(p.id)::int as attendus,
           (count(p.id) filter (where p.publie_at is not null))::int as faits,
           (c.is_active
             and ((c.warmup_ends_at > b.debut and c.warmup_ends_at <= b.fin + interval '1 day')
                  or (c.warmup_ends_at is null and c.created_at < b.debut
                      and c.created_at >= b.debut - interval '21 days'))) as en_warmup
      from public.comptes c
      join posteurs po on po.id = c.poster_id
      cross join bornes b
      left join public.passages p
        on p.compte_id = c.id
       and p.date_publication_prevue between p_lundi and p_lundi + 6
       and p.statut::text <> 'brouillon'
       and not coalesce(p.est_rappel, false)
     where c.type_compte = 'perso'
     group by c.id, c.poster_id, c.handle_tiktok, c.is_active, c.created_at, c.warmup_ends_at, b.fin, b.debut
  ),
  tarifs as (
    select po.id as poster_id, coalesce(po.tarif_hebdo, public.paie_tarif_zone(po.id)) as tarif
      from posteurs po
     where po.id in (select cs.poster_id from comptes_semaine cs)
  ),
  par_compte as (
    select cs.*, t.tarif,
           greatest(cs.attendus - cs.faits, 0) as rates,
           case when cs.faits = 0 then 0
                -- 28 oct. : 1 post manqué toléré par compte et par semaine, puis 1 $ par post.
                when rg.tolerance then greatest(cs.attendus - cs.faits - rg.toleres, 0) * rg.par_post
                -- Jusqu'à la semaine du 26 oct. : 10 posts sur 14 = plein (0380).
                when cs.faits >= rg.seuil or cs.faits >= cs.attendus then 0
                else greatest(cs.attendus - cs.faits, 0) * rg.par_post end as retenue_compte
      from comptes_semaine cs
      join tarifs t on t.poster_id = cs.poster_id
      cross join reg rg
  ),
  agreg as (
    select pc.poster_id,
           max(pc.tarif) as tarif,
           (count(*) filter (where pc.attendus > 0))::int as nb_comptes,
           (count(*) filter (where pc.attendus > 0 and pc.faits > 0))::int as comptes_payes,
           coalesce(sum(pc.attendus), 0)::int as prevus,
           coalesce(sum(pc.faits), 0)::int as faits,
           coalesce(sum(pc.rates), 0)::int as manques,
           coalesce(sum(pc.retenue_compte) filter (where pc.faits > 0), 0)::numeric as retenue,
           coalesce(sum(greatest(pc.tarif - pc.retenue_compte, 0)) filter (where pc.faits > 0), 0)::numeric as montant,
           bool_or(pc.en_warmup and pc.attendus = 0) as warmup,
           coalesce(jsonb_agg(jsonb_build_object(
             'compte_id', pc.id, 'handle', pc.handle_tiktok, 'attendus', pc.attendus, 'faits', pc.faits,
             'rates', pc.rates, 'retenue', pc.retenue_compte,
             'montant', case when pc.faits > 0 and pc.tarif is not null then greatest(pc.tarif - pc.retenue_compte, 0) else 0 end,
             'warmup', pc.en_warmup and pc.attendus = 0)
             order by pc.handle_tiktok) filter (where pc.attendus > 0 or (pc.en_warmup and pc.attendus = 0)), '[]'::jsonb)
             as detail
      from par_compte pc
     group by pc.poster_id
    having (count(*) filter (where pc.attendus > 0)) > 0 or bool_or(pc.en_warmup)
  ),
  etat as (
    select a.*, po.is_active,
           -- Kill (ne pas renouveler) validé cette semaine : arrêt prévu ou fait d'ici lundi 10 h.
           exists (select 1 from public.ckd_arrets ar
                     join public.comptes c on c.id = ar.compte_id
                    cross join bornes b
                   where c.poster_id = a.poster_id and ar.raison = 'ne_pas_renouveler'
                     and ar.annule_at is null
                     and coalesce(ar.fait_at, ar.prevu_at) >= b.debut
                     and coalesce(ar.fait_at, ar.prevu_at) <= b.coupure) as kill,
           -- La semaine payée avait déjà été financée (« Semaine suivante faite » la semaine d'avant).
           exists (select 1 from public.paie_semaines ps
                    where ps.poster_id = a.poster_id and ps.semaine = p_lundi - 7
                      and ps.semaine_suivante_faite_at is not null) as deja_financee,
           -- Comptes qui posteront la semaine suivante (même calcul que `paie_semaine_suivante`, 0369).
           (select count(*) from public.comptes c
             where c.poster_id = a.poster_id and c.type_compte = 'perso' and c.is_active
               and coalesce((select pj.premier_jour - (extract(isodow from pj.premier_jour)::int - 1)
                               from public.comptes_premier_jour pj where pj.compte_id = c.id),
                            (c.warmup_ends_at at time zone 'Europe/Paris')::date) <= p_lundi + 7)::int as n_suiv
      from agreg a
      join posteurs po on po.id = a.poster_id
  ),
  decision as (
    select e.*,
           case
             when (e.kill or not e.is_active) and e.faits = 0 and e.deja_financee then 'annuler'
             -- Arrêté sans aucun post et semaine pas financée : rien à payer ni à annuler.
             when (e.kill or not e.is_active) and e.faits = 0 then 'rien'
             when (e.kill or not e.is_active) then 'kill'
             when e.nb_comptes = 0 or e.faits = 0 then 'rien'
             when e.n_suiv >= 2 and e.n_suiv > e.comptes_payes then 'modifier'
             when e.retenue > 0 then 'payer_moins'
             else 'payer'
           end as action,
           array_remove(array[
             case when e.nb_comptes = 0 then 'Semaine de warm-up : rien à payer (la 1re semaine de posts le paie)' end,
             case when e.nb_comptes > 0 and e.faits = 0 then '0 post dans la semaine : rien à payer' end,
             case when e.faits > 0 and e.tarif is null then 'Tarif à renseigner (pays hors zone de paie)' end
           ], null) as liste
      from etat e
  )
  select d.poster_id, d.nb_comptes, d.comptes_payes, d.prevus, d.faits, d.manques, d.tarif,
         case when d.tarif is null then 0 else d.retenue end,
         case when d.tarif is null then 0 else d.montant end,
         case when cardinality(d.liste) > 0 and d.faits > 0 then 'a_voir' else 'ok' end,
         nullif(array_to_string(d.liste, ' · '), ''),
         d.action,
         d.detail
    from decision d;
$$;

revoke execute on function public.paie_calculer_v3(date) from public, anon, authenticated;
grant execute on function public.paie_calculer_v3(date) to service_role;

notify pgrst, 'reload schema';
