-- 0435 — Prompt 25, partie 3 : le jeudi (Weekly decisions → Thursday).
--
-- - semaine_comptes(lundi, jusqu) : TOUS les comptes actifs (hors RUUL), une
--   ligne par compte : posteur, HM, pays, posts avec lien jour par jour du
--   lundi jusqu'au jour donné (compris), vues des derniers posts, signaux
--   (shadowban supposé, compte mort = vues basses, liens introuvables), le
--   nudge du jeudi déjà parti, la proposition du contrôle du jeudi et du samedi,
--   et le chemin de Recreate (contrôle du jeudi, ou page Shadowban).
--   Servira aussi au samedi (partie 4).
-- - jeudi_valider(lundi, comptes) : « Send » du jeudi. Un nudge par posteur
--   (le compte coché qui a le plus manqué), texte jeudi_nudge_texte, dans la
--   file d'envoi (relances_prevues, validé) : Slack d'abord, Upwork dans le
--   budget du jour. Rien ne part avant ce clic. Déjà nudgé cette semaine : rien.
-- - jeudi_nudge_texte : le nouveau texte (« you missed some posts… »).
--
-- Additive : 1 réglage, 2 fonctions. Aucune donnée existante modifiée.

insert into public.reglages (cle, valeur) values
  ('jeudi_nudge_texte', to_jsonb(
    'Hi {prenom}, you missed some posts this week ({faits} of {attendus} so far). If you miss too many, we''ll have to stop our collaboration. Please post twice a day and paste each link the same day.'::text))
on conflict (cle) do nothing;

create or replace function public.semaine_comptes(p_lundi date, p_jusqu date)
returns table (
  compte_id          uuid,
  handle             text,
  poster_id          uuid,
  poster_nom         text,
  prenom             text,
  hm_id              uuid,
  hm_nom             text,
  pays               text,
  cohorte_lundi      date,
  premier_post       date,
  jours              jsonb,
  prevus_passes      integer,
  lien_passes        integer,
  lien_aujourdhui    integer,
  lien_total         integer,
  prevus_semaine     integer,
  vues               jsonb,
  shadowban          text,
  liens_introuvables integer,
  canal              text,
  nudge_envoye_at    timestamptz,
  nudge_en_file      boolean,
  ckd_jeudi_id       uuid,
  ckd_jeudi_action   text,
  ckd_jeudi_decision text,
  ckd_samedi_id      uuid,
  ckd_samedi_action  text,
  ckd_samedi_regle   text,
  ckd_samedi_decision text,
  ckd_samedi_donnees jsonb,
  recreer            text,
  autres_comptes     integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (public.is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'semaine_comptes : réservé à l''admin et au Head of Ops' using errcode = '42501';
  end if;
  return query
  with c as (
    select c.id, c.handle_tiktok, c.poster_id, c.pays, pr.prenom, pr.nom, pr.manager_id, pr.cohorte_lundi,
           pr.slack_user_id, pr.upwork_contract_id
      from public.comptes c
      join public.profiles pr on pr.id = c.poster_id and pr.is_active
     where c.is_active and c.type_compte = 'perso'
       and exists (select 1 from public.user_roles ur where ur.user_id = c.poster_id and ur.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)
  ),
  p as (
    select pa.compte_id, pa.date_publication_prevue as jour, pa.publie_url, pa.vues, pa.resolution_statut
      from public.passages pa
     where pa.compte_id in (select c.id from c)
       and pa.date_publication_prevue between p_lundi and p_lundi + 6
       and pa.statut::text <> 'brouillon' and not coalesce(pa.est_rappel, false)
  ),
  j as (
    select c.id as compte_id, d::date as jour,
           (select count(*) from p where p.compte_id = c.id and p.jour = d::date)::int as prevus,
           (select count(*) from p where p.compte_id = c.id and p.jour = d::date and p.publie_url is not null)::int as lien
      from c cross join generate_series(p_lundi, p_jusqu, interval '1 day') d
  ),
  agg as (
    select j.compte_id,
           jsonb_agg(jsonb_build_object('jour', j.jour, 'prevus', j.prevus, 'lien', j.lien) order by j.jour) as jours,
           coalesce(sum(j.prevus) filter (where j.jour < p_jusqu), 0)::int as prevus_passes,
           coalesce(sum(j.lien) filter (where j.jour < p_jusqu), 0)::int as lien_passes,
           coalesce(sum(j.lien) filter (where j.jour = p_jusqu), 0)::int as lien_aujourdhui,
           coalesce(sum(j.lien), 0)::int as lien_total
      from j group by j.compte_id
  )
  select c.id, c.handle_tiktok, c.poster_id,
         nullif(btrim(concat_ws(' ', c.prenom, c.nom)), ''), c.prenom,
         c.manager_id, nullif(btrim(concat_ws(' ', hm.prenom, hm.nom)), ''), c.pays, c.cohorte_lundi,
         (select min(pa.date_publication_prevue) from public.passages pa where pa.compte_id = c.id and pa.publie_url is not null),
         a.jours, a.prevus_passes, a.lien_passes, a.lien_aujourdhui, a.lien_total,
         (select count(*) from p where p.compte_id = c.id)::int,
         coalesce((select jsonb_agg(jsonb_build_object('jour', x.date_publication_prevue, 'vues', x.vues, 'url', x.publie_url)
                                    order by x.date_publication_prevue desc)
                     from (select pa.date_publication_prevue, pa.vues, pa.publie_url, pa.id
                             from public.passages pa
                            where pa.compte_id = c.id and pa.publie_url is not null
                            order by pa.date_publication_prevue desc, pa.id desc limit 3) x), '[]'::jsonb),
         (select s.type from public.ckd_shadowban s
           where s.compte_id = c.id and s.recreation_at is null and s.nouveau_compte_id is null limit 1),
         (select count(*) from p where p.compte_id = c.id and p.resolution_statut = 'introuvable')::int,
         case when c.slack_user_id is not null then 'slack' when c.upwork_contract_id is not null then 'upwork' end,
         (select max(n.envoye_at) from public.nudges n
           where n.poster_id = c.poster_id and n.type = 'jeudi' and n.periode = p_lundi
             and (n.slack_erreur is null or coalesce(array_length(n.canaux, 1), 0) > 0)),
         exists (select 1 from public.relances_prevues rp
                  where rp.poster_id = c.poster_id and rp.type = 'jeudi' and rp.periode = p_lundi
                    and rp.statut = 'prevu' and rp.valide_at is not null),
         cj.id, cj.action, cj.decision,
         cs.id, cs.action, cs.regle, cs.decision, cs.donnees,
         case when cj.id is not null and cj.action = 'recreer' and cj.decision is null then 'ckd'
              when exists (select 1 from public.ckd_shadowban s where s.compte_id = c.id
                            and s.recreation_at is null and s.nouveau_compte_id is null) then 'shadowban' end,
         (select count(*) from public.comptes c2 where c2.poster_id = c.poster_id and c2.is_active and c2.id <> c.id)::int
    from c
    join agg a on a.compte_id = c.id
    left join public.profiles hm on hm.id = c.manager_id
    left join lateral (
      select cp.id, cp.action, cp.decision from public.ckd_propositions cp
        join public.ckd_controles ct on ct.id = cp.controle_id
       where cp.compte_id = c.id and ct.type = 'jeudi' and ct.jour between p_lundi and p_lundi + 6
       order by (cp.action = 'recreer') desc, cp.created_at desc limit 1) cj on true
    left join lateral (
      select cp.id, cp.action, cp.regle, cp.decision, cp.donnees from public.ckd_propositions cp
        join public.ckd_controles ct on ct.id = cp.controle_id
       where cp.compte_id = c.id and ct.type = 'samedi' and ct.jour between p_lundi and p_lundi + 6
       order by (cp.action = 'ne_pas_renouveler') desc, (cp.action = 'doubler') desc, cp.created_at desc limit 1) cs on true;
end;
$$;
revoke all on function public.semaine_comptes(date, date) from public, anon;
grant execute on function public.semaine_comptes(date, date) to authenticated, service_role;

-- « Send » du jeudi : un nudge par posteur, dans la file d'envoi (validé).
create or replace function public.jeudi_valider(p_lundi date, p_comptes uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aujourdhui date := (now() at time zone 'Europe/Paris')::date;
  v_jusqu date := least(v_aujourdhui, p_lundi + 6);
  v_modele text := coalesce((select r.valeur #>> '{}' from public.reglages r where r.cle = 'jeudi_nudge_texte'), '');
  v_prepares integer := 0;
  v_deja integer := 0;
  v_sans_canal integer := 0;
  r record;
begin
  if not public.is_admin_strict() then
    raise exception 'jeudi_valider : réservé à l''admin';
  end if;
  if extract(isodow from p_lundi) <> 1 then
    raise exception 'jeudi_valider : % n''est pas un lundi', p_lundi;
  end if;
  if btrim(v_modele) = '' then
    raise exception 'jeudi_valider : le texte du nudge (jeudi_nudge_texte) est vide';
  end if;
  for r in
    select distinct on (s.poster_id) s.*
      from public.semaine_comptes(p_lundi, v_jusqu) s
     where s.compte_id = any(p_comptes)
     order by s.poster_id, (s.prevus_passes - s.lien_passes) desc, s.lien_total
  loop
    if r.nudge_envoye_at is not null then
      v_deja := v_deja + 1;
      continue;
    end if;
    if r.canal is null then
      v_sans_canal := v_sans_canal + 1;
      continue;
    end if;
    insert into public.relances_prevues (poster_id, type, periode, statut, canal, texte, raison, donnees, valide_at, valide_par, maj_at)
    values (r.poster_id, 'jeudi', p_lundi, 'prevu', r.canal,
            replace(replace(replace(v_modele,
              '{prenom}', coalesce(nullif(btrim(r.prenom), ''), 'there')),
              '{faits}', r.lien_total::text),
              '{attendus}', (r.prevus_passes + r.lien_aujourdhui)::text),
            'jeudi',
            jsonb_build_object('handle', r.handle, 'faits', r.lien_total, 'attendus', r.prevus_passes + r.lien_aujourdhui,
                               'jours', r.jours, 'hm', r.hm_nom),
            now(), auth.uid(), now())
    on conflict (poster_id, type, periode) do update
       set statut = 'prevu', canal = excluded.canal, texte = excluded.texte, raison = 'jeudi', donnees = excluded.donnees,
           valide_at = now(), valide_par = auth.uid(), maj_at = now();
    v_prepares := v_prepares + 1;
  end loop;
  return jsonb_build_object('prepares', v_prepares, 'deja', v_deja, 'sans_canal', v_sans_canal);
end;
$$;
revoke all on function public.jeudi_valider(date, uuid[]) from public, anon;
grant execute on function public.jeudi_valider(date, uuid[]) to authenticated;

notify pgrst, 'reload schema';
