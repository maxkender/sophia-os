-- 16/11 : la page Decisions (samedi) tombait en « statement timeout » sous charge.
-- masterlist_contexte relisait les ~5 000 messages pour chacun des ~600 posteurs (3,1 s à vide) ;
-- semaine_extras cherchait les semaines de chaque compte dans une table non indexée.
-- Mêmes signatures, mêmes colonnes, mêmes valeurs : on lit une seule fois et on regroupe.

create or replace function public.masterlist_contexte(p_lundi date, p_posteurs uuid[])
 returns table(poster_id uuid, dernier_recu jsonb, dernier_envoye jsonb, repondu boolean, derniere_connexion timestamp with time zone,
               dernier_post_at timestamp with time zone, arrivee timestamp with time zone, badges text[], absence jsonb,
               absences_30j integer, upwork_lu_at timestamp with time zone)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with m as materialized (select * from public.messages_posteurs(p_posteurs) where at is not null),
  debut as (select (p_lundi::timestamp at time zone 'Europe/Paris') as t),
  recu as (
    select distinct on (x.poster_id) x.poster_id, x.at,
           jsonb_build_object('canal', x.canal, 'at', x.at, 'texte', x.texte, 'lien', x.lien) as j
      from m x where x.sens = 'recu' order by x.poster_id, x.at desc),
  envoye as (
    select distinct on (x.poster_id) x.poster_id, x.at,
           jsonb_build_object('canal', x.canal, 'at', x.at, 'texte', x.texte, 'lien', x.lien) as j
      from m x where x.sens = 'envoye' order by x.poster_id, x.at desc),
  badges as (
    select x.poster_id,
           array_agg(distinct case x.cas when 'stop' then 'stop' when 'absent' then 'absent' when 'paie' then 'paie' end)
             filter (where x.cas in ('stop', 'absent', 'paie')) as b
      from m x, debut d where x.sens = 'recu' and x.at >= d.t group by x.poster_id),
  posts as (
    select co.poster_id, max(coalesce(pa.publie_at, pa.lien_confirme_at)) as at
      from public.passages pa join public.comptes co on co.id = pa.compte_id
     where co.poster_id = any (p_posteurs) and pa.publie_url is not null
     group by co.poster_id),
  sess as (
    select s.user_id, max(coalesce(s.refreshed_at, s.updated_at)) as at
      from auth.sessions s where s.user_id = any (p_posteurs) group by s.user_id)
  select pr.id,
         r.j,
         e.j,
         coalesce(r.at > e.at, false),
         greatest(u.last_sign_in_at, se.at),
         po.at,
         coalesce(pr.offre_acceptee_le::timestamptz, pr.created_at),
         b.b,
         (select jsonb_build_object('debut', a.debut, 'fin', coalesce(a.retour_le, a.fin), 'jours', a.jours, 'raison', a.raison,
                                    'declare_at', a.declare_at, 'retour', a.retour_le is not null)
            from public.absences_declarees a
           where a.poster_id = pr.id and (a.retour_le is null or a.retour_le >= a.debut)
             and a.debut <= p_lundi + 6 and coalesce(a.retour_le, a.fin) >= p_lundi
           order by a.declare_at desc limit 1),
         (select count(*)::int from public.absences_declarees a
           where a.poster_id = pr.id and a.declare_at > now() - interval '30 days'),
         (select s.lu_at from public.upwork_salons s where s.contrat_id = pr.upwork_contract_id)
    from public.profiles pr
    left join auth.users u on u.id = pr.id
    left join recu r on r.poster_id = pr.id
    left join envoye e on e.poster_id = pr.id
    left join badges b on b.poster_id = pr.id
    left join posts po on po.poster_id = pr.id
    left join sess se on se.user_id = pr.id
   where pr.id = any (p_posteurs) and public.is_admin();
$function$;

create or replace function public.semaine_extras(p_lundi date)
 returns table(compte_id uuid, poster_id uuid, sans_contrat boolean, contrat_id text, freelance_nom text, profil_nom text,
               message_recu_at timestamp with time zone, message_apercu text, reponse_apres_nudge boolean, liens_a_verifier integer,
               vues_baisse boolean, actif_semaines integer, fiable_semaines integer, dernier_nudge_at timestamp with time zone,
               needs_you_n integer, disputes_n integer, to_read_n integer, connecte boolean, sur_slack boolean, tiktok_trouve boolean,
               start_warmup boolean, abonnements integer, relances integer, derniere_reaction_at timestamp with time zone)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_debut timestamptz := (p_lundi::timestamp at time zone 'Europe/Paris');
  v_posts int := coalesce((select (r.valeur ->> 'posts')::int from public.reglages r where r.cle = 'masterlist_confiance'), 6);
  v_ny jsonb;
begin
  if not (public.is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'semaine_extras : réservé à l''admin et au Head of Ops' using errcode = '42501';
  end if;
  select coalesce(jsonb_object_agg(x.poster_id, x.n), '{}'::jsonb) into v_ny
    from (select n.poster_id, count(*) as n from public.needs_you() n where n.poster_id is not null group by n.poster_id) x;
  return query
  with c as (
    select co.id, co.poster_id, co.handle_tiktok, pr.upwork_contract_id, pr.prenom, pr.nom, pr.slack_user_id, pr.premiere_connexion_at,
           co.warmup_started_at
      from public.comptes co
      join public.profiles pr on pr.id = co.poster_id and pr.is_active
     where co.type_compte = 'perso' and co.is_active
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id and h.exclu_suivi /* 0575 */)
  ),
  semaines as (
    -- Posts avec lien par compte et par semaine, sur les 8 dernières semaines finies.
    select pa.compte_id, date_trunc('week', pa.date_publication_prevue)::date as s,
           count(*) filter (where pa.publie_url is not null) as liens,
           avg(pa.vues) filter (where pa.vues is not null) as vues
      from public.passages pa
     where pa.compte_id in (select c.id from c)
       and pa.date_publication_prevue >= p_lundi - 56 and pa.date_publication_prevue < p_lundi
       and pa.statut::text <> 'brouillon' and not coalesce(pa.est_rappel, false)
     group by 1, 2
  ),
  -- 16/11 : une ligne par compte (avant : la table des semaines relue pour chaque compte).
  sem as (
    select se.compte_id,
           max(se.vues) filter (where se.s = p_lundi - 7) as v1,
           max(se.vues) filter (where se.s = p_lundi - 14) as v2,
           max(se.vues) filter (where se.s = p_lundi - 21) as v3,
           jsonb_object_agg(((p_lundi - se.s) / 7)::text, se.liens) as liens
      from semaines se group by se.compte_id
  ),
  premiers as (
    select pa.compte_id, min(pa.date_publication_prevue) as d
      from public.passages pa
     where pa.compte_id in (select c.id from c) and pa.publie_url is not null
     group by pa.compte_id
  )
  select c.id, c.poster_id, c.upwork_contract_id is null, c.upwork_contract_id,
         (select uc.freelancer_nom from public.upwork_contrats uc where uc.contrat_id = c.upwork_contract_id limit 1),
         nullif(btrim(concat_ws(' ', c.prenom, c.nom)), ''),
         m.recu_at, m.texte,
         exists (select 1 from public.posteur_reponses r join public.nudges n on n.poster_id = r.poster_id
                  where r.poster_id = c.poster_id and n.type = 'jeudi' and n.periode = p_lundi and r.recu_at > n.envoye_at),
         (select count(*) from public.passages pa where pa.compte_id = c.id and pa.publie_url is not null
             and pa.resolution_statut = 'a_resoudre' and pa.date_publication_prevue between p_lundi and p_lundi + 6)::int,
         coalesce(sm.v1 < sm.v2 * 0.8 and sm.v2 < sm.v3 * 0.8, false),
         ((p_lundi - pm.d) / 7)::int,
         -- Les semaines fiables, de la plus récente en remontant (la 1re qui manque arrête le compte).
         (select coalesce(min(k2) - 1, 8) from generate_series(1, 8) k2
           where coalesce((sm.liens ->> k2::text)::int, 0) < v_posts)::int,
         (select max(n.envoye_at) from public.nudges n where n.poster_id = c.poster_id
             and (n.slack_erreur is null or coalesce(array_length(n.canaux, 1), 0) > 0)),
         coalesce((v_ny ->> c.poster_id::text)::int, 0),
         (select count(*) from public.contestations ct where ct.poster_id = c.poster_id and ct.statut = 'ouverte')::int,
         (select count(*) from public.posteur_reponses r where r.poster_id = c.poster_id and r.lu_at is null
             and r.corrige_at is null and r.liste in ('a_lire', 'paie'))::int,
         c.premiere_connexion_at is not null,
         c.slack_user_id is not null,
         coalesce((select w.existe from public.ckd_warmup_releves w where w.compte_id = c.id and w.existe is not null
                    order by w.releve_at desc limit 1), false),
         c.warmup_started_at is not null,
         (select w.abonnements from public.ckd_warmup_releves w where w.compte_id = c.id and w.existe is not null
           order by w.releve_at desc limit 1),
         (select count(*) from public.nudges n where n.poster_id = c.poster_id and n.type in ('relance', 'handle', 'handle_upwork')
             and (n.slack_erreur is null or coalesce(array_length(n.canaux, 1), 0) > 0))::int,
         (select max(r.recu_at) from public.posteur_reponses r where r.poster_id = c.poster_id)
    from c
    left join sem sm on sm.compte_id = c.id
    left join premiers pm on pm.compte_id = c.id
    left join lateral (
      select r.recu_at, left(r.texte, 160) as texte from public.posteur_reponses r
       where r.poster_id = c.poster_id and r.recu_at >= v_debut
       order by r.recu_at desc limit 1) m on true;
end;
$function$;
