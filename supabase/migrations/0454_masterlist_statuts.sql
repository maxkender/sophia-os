-- 0454 — Prompts 12 et 14 : la masterlist du samedi (et le jeudi), version 2.
--
-- 1. masterlist_confiance (Weekly decisions → Settings) : un compte est « de
--    confiance » s'il est actif depuis N semaines, avec au moins P posts avec
--    lien chaque semaine pendant les N dernières, sans fiche Needs you ni
--    Dispute ouverte, ni shadowban, et pas nudgé depuis N semaines.
-- 2. semaine_extras(lundi) : ce qu'il faut, compte par compte, pour le statut
--    (rouge / orange / vert), la phrase et la proposition, calculés en direct :
--    contrat relié, nom du freelance, message reçu, liens pas encore vérifiés,
--    vues en baisse, semaines fiables, Needs you / Disputes / To read, et pour
--    les recrues de la cohorte qui arrive : leurs étapes, leurs relances, leur
--    dernière réaction.
-- 3. samedi_fiche() : les liens (Upwork, TikTok, Slack, OS), l'état de la paie,
--    les Recreate, les fiches Needs you, Disputes et To read du posteur.
-- 4. posteur_pause_noter() : « Autre → pause » depuis le samedi.

insert into public.reglages (cle, valeur) values
  ('masterlist_confiance', jsonb_build_object('semaines', 3, 'posts', 6))
on conflict (cle) do nothing;

create or replace function public.semaine_extras(p_lundi date)
returns table (
  compte_id uuid, poster_id uuid, sans_contrat boolean, contrat_id text, freelance_nom text, profil_nom text,
  message_recu_at timestamptz, message_apercu text, reponse_apres_nudge boolean,
  liens_a_verifier integer, vues_baisse boolean, actif_semaines integer, fiable_semaines integer,
  dernier_nudge_at timestamptz, needs_you_n integer, disputes_n integer, to_read_n integer,
  connecte boolean, sur_slack boolean, tiktok_trouve boolean, start_warmup boolean, abonnements integer,
  relances integer, derniere_reaction_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
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
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
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
  )
  select c.id, c.poster_id, c.upwork_contract_id is null, c.upwork_contract_id,
         (select uc.freelancer_nom from public.upwork_contrats uc where uc.contrat_id = c.upwork_contract_id limit 1),
         nullif(btrim(concat_ws(' ', c.prenom, c.nom)), ''),
         m.recu_at, m.texte,
         exists (select 1 from public.posteur_reponses r join public.nudges n on n.poster_id = r.poster_id
                  where r.poster_id = c.poster_id and n.type = 'jeudi' and n.periode = p_lundi and r.recu_at > n.envoye_at),
         (select count(*) from public.passages pa where pa.compte_id = c.id and pa.publie_url is not null
             and pa.resolution_statut = 'a_resoudre' and pa.date_publication_prevue between p_lundi and p_lundi + 6)::int,
         coalesce((select s1.vues < s2.vues * 0.8 and s2.vues < s3.vues * 0.8
                     from semaines s1, semaines s2, semaines s3
                    where s1.compte_id = c.id and s2.compte_id = c.id and s3.compte_id = c.id
                      and s1.s = p_lundi - 7 and s2.s = p_lundi - 14 and s3.s = p_lundi - 21), false),
         (select ((p_lundi - min(pa.date_publication_prevue)) / 7)::int from public.passages pa
           where pa.compte_id = c.id and pa.publie_url is not null),
         -- Les semaines fiables, de la plus récente en remontant (la 1re qui manque arrête le compte).
         (select coalesce(min(k2) - 1, 8) from generate_series(1, 8) k2
           where coalesce((select se.liens from semaines se where se.compte_id = c.id and se.s = p_lundi - 7 * k2), 0) < v_posts)::int,
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
    left join lateral (
      select r.recu_at, left(r.texte, 160) as texte from public.posteur_reponses r
       where r.poster_id = c.poster_id and r.recu_at >= v_debut
       order by r.recu_at desc limit 1) m on true;
end;
$$;
revoke all on function public.semaine_extras(date) from public, anon;
grant execute on function public.semaine_extras(date) to authenticated, service_role;

-- « Autre → pause » le samedi : malade ou absent, la semaine est payée, pas de relance.
create or replace function public.posteur_pause_noter(p_poster uuid, p_jours integer, p_raison text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'posteur_pause_noter : réservé à l''admin'; end if;
  if p_jours is null or p_jours < 1 or p_jours > 30 then raise exception 'pause : de 1 à 30 jours'; end if;
  insert into public.posteur_pauses (poster_id, debut, jusqu_au, raison)
  values (p_poster, now(), now() + make_interval(days => p_jours), coalesce(nullif(btrim(p_raison), ''), 'samedi : pause'));
end;
$$;
revoke all on function public.posteur_pause_noter(uuid, integer, text) from public, anon;
grant execute on function public.posteur_pause_noter(uuid, integer, text) to authenticated;

-- La fiche du samedi, version 2.
create or replace function public.samedi_fiche(p_poster uuid, p_lundi date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
  v_debut timestamptz := (p_lundi::timestamp at time zone 'Europe/Paris');
  v_fin timestamptz := ((p_lundi + 7)::timestamp at time zone 'Europe/Paris');
begin
  if not public.is_admin() then raise exception 'samedi_fiche : réservé à l''admin et au Head of Ops'; end if;
  select jsonb_build_object(
    'posts', coalesce((select jsonb_agg(jsonb_build_object(
                 'jour', pa.date_publication_prevue, 'handle', c.handle_tiktok, 'url', pa.publie_url, 'vues', pa.vues,
                 'statut', pa.resolution_statut) order by pa.date_publication_prevue, c.handle_tiktok)
               from public.passages pa join public.comptes c on c.id = pa.compte_id
              where c.poster_id = p_poster and pa.date_publication_prevue between p_lundi and p_lundi + 6
                and pa.statut::text <> 'brouillon' and not coalesce(pa.est_rappel, false)), '[]'::jsonb),
    'nudges', coalesce((select jsonb_agg(jsonb_build_object('type', n.type, 'at', n.envoye_at, 'canaux', n.canaux,
                 'canal', n.canal, 'texte', left(n.texte, 500), 'erreur', n.slack_erreur) order by n.envoye_at)
               from public.nudges n where n.poster_id = p_poster and n.envoye_at >= v_debut and n.envoye_at < v_fin), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(m order by m->>'at') from (
                 select jsonb_build_object('sens', 'recu', 'canal', r.canal, 'at', r.recu_at, 'texte', left(r.texte, 500),
                          'reponse', left(r.reponse_texte, 500)) m
                   from public.posteur_reponses r where r.poster_id = p_poster and r.recu_at >= v_debut and r.recu_at < v_fin
                 union all
                 select jsonb_build_object('sens', 'envoye', 'canal', coalesce(case when m.upwork_statut = 'envoye' then 'upwork' end, 'slack'),
                          'at', m.created_at, 'texte', left(m.texte, 500))
                   from public.posteur_messages m where m.poster_id = p_poster and m.created_at >= v_debut and m.created_at < v_fin
                 union all
                 select jsonb_build_object('sens', 'envoye', 'canal', coalesce(array_to_string(n.canaux, '+'), n.canal), 'at', n.envoye_at,
                          'texte', left(n.texte, 500))
                   from public.nudges n where n.poster_id = p_poster and n.envoye_at >= v_debut and n.envoye_at < v_fin) x), '[]'::jsonb),
    'historique', jsonb_build_object(
       'cohorte', pr.cohorte_lundi,
       'comptes', coalesce((select jsonb_agg(jsonb_build_object('handle', c.handle_tiktok, 'actif', c.is_active, 'cree', c.created_at)
                                 order by c.created_at) from public.comptes c where c.poster_id = p_poster and c.type_compte = 'perso'), '[]'::jsonb),
       'pauses', coalesce((select jsonb_agg(jsonb_build_object('debut', pp.debut, 'jusqu_au', pp.jusqu_au, 'raison', pp.raison)
                                 order by pp.debut) from public.posteur_pauses pp where pp.poster_id = p_poster), '[]'::jsonb),
       'recreations', (select count(*) from public.ckd_recreations rc where rc.poster_id = p_poster),
       'kills_annules', (select count(*) from public.arrets ar where ar.poster_id = p_poster and ar.annule_at is not null)
                        + (select count(*) from public.ckd_arrets ka join public.comptes c on c.id = ka.compte_id
                            where c.poster_id = p_poster and ka.annule_at is not null)),
    'contrat', jsonb_build_object(
       'id', pr.upwork_contract_id,
       'url', coalesce(pr.upwork_contrat_url, case when pr.upwork_contract_id is not null
                         then 'https://www.upwork.com/nx/wm/workroom/' || pr.upwork_contract_id || '/overview' end),
       'freelance', (select uc.freelancer_nom from public.upwork_contrats uc where uc.contrat_id = pr.upwork_contract_id limit 1),
       'profil', nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''),
       'tarif', coalesce(public.paie_tarif_contrat(pr.id), pr.tarif_hebdo)),
    'liens', jsonb_build_object(
       'tiktok', (select 'https://www.tiktok.com/@' || c.handle_tiktok from public.comptes c
                   where c.poster_id = p_poster and c.type_compte = 'perso' and c.is_active and c.handle_tiktok is not null
                   order by c.created_at limit 1),
       'slack', case when pr.slack_user_id is not null then 'https://sophia-system.slack.com/team/' || pr.slack_user_id end,
       'os', (select '/admin/createurs/' || c.id from public.comptes c
               where c.poster_id = p_poster and c.type_compte = 'perso' order by c.is_active desc, c.created_at limit 1)),
    'semaine', (select jsonb_build_object('faits', c.faits, 'prevus', c.prevus, 'montant', c.montant, 'action', c.action, 'raison', c.raison,
                       'tarif', c.tarif)
                  from public.paie_calculer_v3(p_lundi) c where c.poster_id = p_poster),
    'paie', (select jsonb_build_object(
               'jalons_lus_le', uj.lu_at,
               'finances', (select coalesce(jsonb_agg(jsonb_build_object('nom', x->>'nom', 'montant', x->>'depot', 'etat', x->>'etat')), '[]'::jsonb)
                              from jsonb_array_elements(case when jsonb_typeof(uj.jalons) = 'array' then uj.jalons else '[]'::jsonb end) x
                             where x->>'etat' in ('Active', 'Submitted', 'Rejected')))
               from public.upwork_jalons uj where uj.contrat_id = pr.upwork_contract_id),
    'needs_you', coalesce((select jsonb_agg(jsonb_build_object('type', n.type, 'vu', left(n.vu, 200), 'pense', left(n.pense, 200)))
                             from public.needs_you() n where n.poster_id = p_poster), '[]'::jsonb),
    'disputes', coalesce((select jsonb_agg(jsonb_build_object('type', ct.type, 'texte', left(ct.texte, 200), 'recu_at', ct.recu_at))
                            from public.contestations ct where ct.poster_id = p_poster and ct.statut = 'ouverte'), '[]'::jsonb),
    'to_read', coalesce((select jsonb_agg(jsonb_build_object('liste', r.liste, 'texte', left(r.texte, 200), 'recu_at', r.recu_at) order by r.recu_at desc)
                           from public.posteur_reponses r where r.poster_id = p_poster and r.lu_at is null and r.corrige_at is null
                            and r.liste in ('a_lire', 'paie')), '[]'::jsonb)
  ) into v
  from public.profiles pr where pr.id = p_poster;
  return v;
end;
$$;
revoke all on function public.samedi_fiche(uuid, date) from public, anon;
grant execute on function public.samedi_fiche(uuid, date) to authenticated;

notify pgrst, 'reload schema';
