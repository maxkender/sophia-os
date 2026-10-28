-- 0404 — Système du 2 nov., partie D (1) : le lundi et le jeudi.
--
-- `recrues-check` (toutes les heures) :
--   - lundi 10 h, heure du pays : un message à chaque posteur (une fois,
--     nudges type « lundi ») : la règle du lien à tous ; la nouvelle cohorte
--     prête : « You start posting today » ; pas prête : ce qui manque.
--     Interrupteur `lundi_message_auto` (off | test | on, défaut test).
--   - jeudi 12 h, heure du pays : posts ou liens manquants de lundi à
--     mercredi → un Nudge (une fois, type « jeudi »). Il remplace le message
--     du mercredi. Interrupteur des messages : `relances_auto`.
--   - la règle « inactif » : Nudge du jeudi vraiment envoyé et aucun post
--     publié depuis, vendredi 20 h (heure du pays) → proposé en Kill samedi.
--
-- Additive : réglages, une fonction, inactifs_calculer réécrite à signature
-- identique. Aucune donnée existante modifiée.
-- Retour arrière : drop function semaine_posteurs ; réappliquer
-- inactifs_calculer de 0391 ; delete des réglages lundi_*, jeudi_texte,
-- semaine_heures.

insert into public.reglages (cle, valeur) values
  ('lundi_message_auto', to_jsonb('test'::text)),
  ('lundi_texte_tous', to_jsonb(
    'Reminder: a post only counts when you mark it published with its link on your dashboard, the same day, before midnight. No link = not paid.'::text)),
  ('lundi_texte_cohorte', to_jsonb('You start posting today: 2 posts a day, every day.'::text)),
  ('lundi_texte_warmup', to_jsonb('Your warm-up isn''t finished, so you can''t start yet: {ce_qui_manque}.'::text)),
  ('jeudi_texte', to_jsonb(
    'Hi {prenom}, you''ve been missing posts or links this week ({faits} of {attendus}). Please post twice a day and paste each link on your dashboard the same day.'::text)),
  ('semaine_heures', jsonb_build_object('lundi_heure', 10, 'jeudi_heure', 12, 'fin', 20))
on conflict (cle) do nothing;

-- ---------------------------------------------------------------------------
-- Les posteurs de la semaine (service_role, admin) : ce qui était prévu de
-- lundi à mercredi, ce qui est fait avec son lien, les messages déjà partis.
-- ---------------------------------------------------------------------------
create or replace function public.semaine_posteurs(p_lundi date)
returns table (
  poster_id        uuid,
  prenom           text,
  pays             text,
  fuseau           text,
  slack_user_id    text,
  contrat_id       text,
  cohorte_lundi    date,
  attendus_lun_mer integer,
  faits_lun_mer    integer,
  prevus_semaine   integer,
  envoyes          text[],
  prevus_test      text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if extract(isodow from p_lundi) <> 1 then
    raise exception 'semaine_posteurs : % n''est pas un lundi', p_lundi;
  end if;
  return query
  with po as (
    select pr.* from public.profiles pr
     where pr.is_active
       and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
  ),
  s as (
    select c.poster_id,
           min(c.pays) as pays,
           (count(p.id) filter (where p.date_publication_prevue between p_lundi and p_lundi + 2))::int as attendus,
           (count(p.id) filter (where p.date_publication_prevue between p_lundi and p_lundi + 2
                                  and p.publie_url is not null))::int as faits,
           count(p.id)::int as semaine
      from public.comptes c
      join public.passages p on p.compte_id = c.id
     where c.poster_id in (select id from po) and c.type_compte = 'perso' and c.is_active
       and p.date_publication_prevue between p_lundi and p_lundi + 6
       and p.statut::text <> 'brouillon' and not coalesce(p.est_rappel, false)
     group by c.poster_id
  ),
  cpt as (
    select distinct on (c.poster_id) c.poster_id, c.pays
      from public.comptes c
     where c.poster_id in (select id from po) and c.type_compte = 'perso' and c.is_active
     order by c.poster_id, c.created_at
  )
  select po.id, po.prenom, coalesce(s.pays, cpt.pays),
         case when coalesce(s.pays, cpt.pays) is null then 'Europe/Paris' else public.fuseau_pays(coalesce(s.pays, cpt.pays)) end,
         po.slack_user_id, po.upwork_contract_id, po.cohorte_lundi,
         coalesce(s.attendus, 0), coalesce(s.faits, 0), coalesce(s.semaine, 0),
         coalesce((select array_agg(n.type) from public.nudges n
                    where n.poster_id = po.id and n.periode = p_lundi and n.type in ('lundi', 'jeudi')), '{}'),
         coalesce((select array_agg(v.type) from public.relances_prevues v
                    where v.poster_id = po.id and v.periode = p_lundi and v.type in ('lundi', 'jeudi')), '{}')
    from po
    left join s on s.poster_id = po.id
    left join cpt on cpt.poster_id = po.id
   where s.poster_id is not null or po.cohorte_lundi = p_lundi;
end;
$$;

revoke execute on function public.semaine_posteurs(date) from public, anon;
grant execute on function public.semaine_posteurs(date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- La règle « inactif » (0385, 0391), même signature : le Nudge du jeudi
-- vraiment envoyé cette semaine ET aucun post publié depuis, vendredi 20 h
-- (heure du pays). `nudges_sans_reponse` vaut 1 (le Nudge du jeudi).
-- ---------------------------------------------------------------------------
create or replace function public.inactifs_calculer()
returns table (poster_id uuid, jours_sans_post integer, nudges_sans_reponse integer, dernier_post_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_auj date := (now() at time zone 'Europe/Paris')::date;
  v_lundi date := v_auj - (extract(isodow from v_auj)::int - 1);
begin
  return query
  with m as (
    select n.poster_id, n.envoye_at from public.nudges n
     where n.type = 'jeudi' and n.periode = v_lundi and n.slack_erreur is null
  ),
  s as (
    select m.poster_id, m.envoye_at,
           (select min(c.pays) from public.comptes c where c.poster_id = m.poster_id and c.type_compte = 'perso') as pays,
           (select max(p.publie_at) from public.passages p join public.comptes c on c.id = p.compte_id
             where c.poster_id = m.poster_id) as dernier
      from m
      join public.profiles pr on pr.id = m.poster_id
     where pr.is_active
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = m.poster_id)
  )
  select s.poster_id,
         case when s.dernier is null then 7
              else greatest(v_auj - (s.dernier at time zone 'Europe/Paris')::date, 0) end,
         1, s.dernier
    from s
   where now() >= (((v_lundi + 4)::timestamp + interval '20 hours')
                    at time zone (case when s.pays is null then 'Europe/Paris' else public.fuseau_pays(s.pays) end))
     and (s.dernier is null or s.dernier < s.envoye_at);
end;
$$;

revoke execute on function public.inactifs_calculer() from public, anon, authenticated;
grant execute on function public.inactifs_calculer() to service_role;

notify pgrst, 'reload schema';
