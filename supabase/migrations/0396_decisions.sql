-- 0396 — Chantier du 28 oct., partie C : la page « Decisions » (ex Check,
-- Kill or Double).
--
-- 1. Le Nudge du jeudi n'existe plus (décision de Max) : le contrôle du jeudi
--    ne garde que les propositions « Recréer ». `ckd_controle` réécrite à
--    signature identique (corps de 0385, un filtre en plus). Les nudges déjà
--    proposés ou décidés restent en base et lisibles dans History.
-- 2. `decisions_a_prendre()` : le bloc « To decide now », les propositions
--    sans décision des 7 derniers jours (Kill, Double, Recréer), avec le nom
--    du posteur, sa HM, et la relance du mercredi de la semaine (inactifs).
-- 3. `decisions_semaine(p_lundi)` : les nombres de la semaine en haut de page
--    (messages du mercredi, Recréer du jeudi, propositions du samedi, arrêts
--    du dimanche, paie du lundi suivant).
-- Admin et Head of Ops (is_admin).
--
-- Additive : aucune donnée modifiée.
-- Retour arrière : réappliquer ckd_controle de 0385 ; drop function
-- public.decisions_a_prendre(), public.decisions_semaine(date).

create or replace function public.ckd_controle(p_type text, p_jour date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jour date;
  v_ctrl uuid;
  v_n    integer;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'ckd_controle : réservé à l''admin';
  end if;
  v_jour := coalesce(p_jour, public.ckd_jour_controle(p_type, (now() at time zone 'Europe/Paris')::date));

  insert into public.ckd_controles as k (type, jour, lance_par)
  values (p_type, v_jour, auth.uid())
  on conflict (type, jour) do update set lance_at = now(), lance_par = excluded.lance_par
  returning k.id into v_ctrl;

  delete from public.ckd_propositions where controle_id = v_ctrl and decision is null;

  insert into public.ckd_propositions
    (controle_id, type, jour, regle, action, compte_id, poster_id, hm_id, pays, langue, label_id, application, donnees)
  select v_ctrl, p_type, v_jour, c.regle, c.action, c.compte_id, c.poster_id, c.hm_id, c.pays, c.langue,
         c.label_id, c.application, c.donnees
    from public.ckd_calculer(p_type, v_jour) c
   -- 28 oct. (0396) : le Nudge du jeudi n'existe plus, le jeudi ne propose que Recréer.
   where not (p_type = 'jeudi' and c.action = 'nudge')
  on conflict (compte_id, regle, jour) do nothing;

  -- v3 (0385) : les inactifs, proposés en Kill le samedi.
  if p_type = 'samedi' then
    insert into public.ckd_propositions
      (controle_id, type, jour, regle, action, compte_id, poster_id, hm_id, pays, langue, label_id, application, donnees)
    select v_ctrl, p_type, v_jour, c.regle, c.action, c.compte_id, c.poster_id, c.hm_id, c.pays, c.langue,
           c.label_id, c.application, c.donnees
      from public.ckd_calculer_inactifs(v_ctrl, v_jour) c
    on conflict (compte_id, regle, jour) do nothing;
  end if;

  select count(*) into v_n from public.ckd_propositions where controle_id = v_ctrl;
  update public.ckd_controles set nb_propositions = v_n where id = v_ctrl;
  return v_n;
end;
$$;

create or replace function public.decisions_a_prendre()
returns table (
  id          uuid,
  type        text,
  jour        date,
  regle       text,
  action      text,
  compte_id   uuid,
  handle      text,
  poster_id   uuid,
  poster_nom  text,
  hm_prenom   text,
  pays        text,
  donnees     jsonb,
  mercredi_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'decisions_a_prendre : réservé à l''admin et au Head of Ops';
  end if;
  return query
  select p.id, p.type, p.jour, p.regle, p.action, p.compte_id,
         coalesce(c.handle_tiktok, p.donnees->>'handle'), p.poster_id,
         coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
         hm.prenom, p.pays, p.donnees,
         (select max(n.envoye_at) from public.nudges n
           where n.poster_id = p.poster_id and n.type = 'mercredi'
             and n.periode = p.jour - (extract(isodow from p.jour)::int - 1))
    from public.ckd_propositions p
    left join public.comptes c on c.id = p.compte_id
    left join public.profiles pr on pr.id = p.poster_id
    left join public.profiles hm on hm.id = p.hm_id
   where p.decision is null
     and p.action in ('ne_pas_renouveler', 'doubler', 'recreer')
     and p.jour >= (now() at time zone 'Europe/Paris')::date - 7
   order by p.action, hm.prenom nulls last, pr.prenom;
end;
$$;

revoke execute on function public.decisions_a_prendre() from public, anon;
grant execute on function public.decisions_a_prendre() to authenticated;

create or replace function public.decisions_semaine(p_lundi date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_jeudi uuid;
  v_samedi uuid;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'decisions_semaine : réservé à l''admin et au Head of Ops';
  end if;
  select id into v_jeudi from public.ckd_controles where type = 'jeudi' and jour = p_lundi + 3;
  select id into v_samedi from public.ckd_controles where type = 'samedi' and jour = p_lundi + 5;
  return jsonb_build_object(
    'mercredi', jsonb_build_object(
      'envoyes', (select count(*) from public.nudges n where n.type = 'mercredi' and n.periode = p_lundi)),
    'jeudi', jsonb_build_object(
      'calcule', v_jeudi is not null,
      'propositions', (select count(*) from public.ckd_propositions p where p.controle_id = v_jeudi and p.action = 'recreer'),
      'a_decider', (select count(*) from public.ckd_propositions p
                     where p.controle_id = v_jeudi and p.action = 'recreer' and p.decision is null)),
    'samedi', jsonb_build_object(
      'calcule', v_samedi is not null,
      'propositions', (select count(*) from public.ckd_propositions p
                        where p.controle_id = v_samedi and p.action in ('ne_pas_renouveler', 'doubler')),
      'a_decider', (select count(*) from public.ckd_propositions p
                     where p.controle_id = v_samedi and p.action in ('ne_pas_renouveler', 'doubler') and p.decision is null)),
    'dimanche', jsonb_build_object(
      'prevus', (select count(*) from public.ckd_arrets a
                  where a.annule_at is null
                    and coalesce(a.fait_at, a.prevu_at) >= ((p_lundi + 6)::timestamp at time zone 'Europe/Paris')
                    and coalesce(a.fait_at, a.prevu_at) < (((p_lundi + 7)::timestamp + interval '10 hours') at time zone 'Europe/Paris')),
      'faits', (select count(*) from public.ckd_arrets a
                 where a.annule_at is null and a.fait_at is not null
                   and a.fait_at >= ((p_lundi + 6)::timestamp at time zone 'Europe/Paris')
                   and a.fait_at < (((p_lundi + 7)::timestamp + interval '10 hours') at time zone 'Europe/Paris'))),
    'lundi', jsonb_build_object(
      'lignes', (select count(*) from public.paie_semaines ps where ps.semaine = p_lundi and not ps.exclu),
      'payees', (select count(*) from public.paie_semaines ps where ps.semaine = p_lundi and not ps.exclu and ps.paye_at is not null))
  );
end;
$$;

revoke execute on function public.decisions_semaine(date) from public, anon;
grant execute on function public.decisions_semaine(date) to authenticated;

notify pgrst, 'reload schema';
