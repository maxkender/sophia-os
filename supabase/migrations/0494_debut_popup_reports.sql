-- 0494 — Pop-up « Start Tuesday » / « Postpone » calculé en direct ; samedi : la colonne Reports.
--
-- 1. mon_debut() (le posteur connecté) : son cas (Start Tuesday de sa cohorte,
--    ou Postpone qui l'a mis sur sa cohorte actuelle), sa date de début, et le
--    dernier relevé TikTok de son compte perso (existe, abonnements, vidéos,
--    Start warmup), plus les textes (réglages modifiables). Le dashboard en tire
--    le pop-up ; il disparaît quand tout est fait. Keep : rien.
-- 2. Les textes du pop-up : 6 réglages (anglais, modifiables dans Settings).
-- 3. mes_annonces (même signature) : plus l'ancien message figé « debut_mardi »
--    (remplacé par le pop-up en direct).
-- 4. samedi_reports(lundi) : pour chaque posteur, les Start Tuesday et les
--    Postpone depuis son offre, sa première cohorte, ses posts publiés ; la
--    règle « reporté 2 fois ou plus, ou toujours 0 post après sa première
--    semaine prévue » (proposition Kill & don't pay, rien sans Validate).
--
-- Additive : 6 réglages ajoutés (s'ils n'existent pas), 2 fonctions, 1 remplacée.

insert into public.reglages (cle, valeur, updated_at) values
  ('debut_popup_mardi', to_jsonb('You can''t post yet: {ce_qui_manque}. Do it before Monday 12:00 (Paris) and you start posting on Tuesday {date}.'::text), now()),
  ('debut_popup_reporter', to_jsonb('You can''t post yet: {ce_qui_manque}. Your start has been moved: you start posting on Monday {date}.'::text), now()),
  ('debut_popup_introuvable', to_jsonb('we can''t find your TikTok account: create @{handle} exactly (same spelling)'::text), now()),
  ('debut_popup_start', to_jsonb('click Start warmup on your dashboard'::text), now()),
  ('debut_popup_follows', to_jsonb('you still need to follow {n} more accounts with @{handle} (you have {x}/5)'::text), now()),
  ('debut_popup_posts', to_jsonb('you posted during the warm-up: delete those posts and don''t post before your start date'::text), now())
on conflict (cle) do nothing;

create or replace function public.mon_debut()
returns table (cas text, debut date, cohorte_lundi date, handle text, existe boolean, abonnements integer, videos integer,
               warmup_started_at timestamptz, releve_at timestamptz, textes jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_cohorte date;
  v_cas text;
  v_debut date;
begin
  if v_uid is null then
    return;
  end if;
  select pr.cohorte_lundi into v_cohorte from public.profiles pr where pr.id = v_uid and pr.is_active;
  if v_cohorte is null then
    return;
  end if;
  if exists (select 1 from public.debut_choix d where d.poster_id = v_uid and d.lundi = v_cohorte and d.choix = 'mardi') then
    v_cas := 'mardi';
    v_debut := v_cohorte + 1;
  elsif exists (select 1 from public.debut_choix d where d.poster_id = v_uid and d.choix = 'reporter'
                   and d.lundi < v_cohorte and d.lundi >= v_cohorte - 14) then
    v_cas := 'reporter';
    v_debut := v_cohorte;
  else
    return;
  end if;
  -- Plus de pop-up une fois le jour de début passé.
  if (now() at time zone 'Europe/Paris')::date > v_debut then
    return;
  end if;
  return query
  with cpt as (
    select c.id, c.handle_tiktok, c.warmup_started_at from public.comptes c
     where c.poster_id = v_uid and c.is_active and coalesce(c.type_compte, 'perso') = 'perso'
     order by c.created_at limit 1
  )
  select v_cas, v_debut, v_cohorte, cpt.handle_tiktok, r.existe, r.abonnements, r.videos, cpt.warmup_started_at, r.releve_at,
         (select jsonb_object_agg(g.cle, g.valeur #>> '{}') from public.reglages g where g.cle like 'debut_popup_%')
    from cpt
    left join lateral (
      select w.existe, w.abonnements, w.videos, w.releve_at from public.ckd_warmup_releves w
       where w.compte_id = cpt.id and w.existe is not null
       order by w.releve_at desc limit 1
    ) r on true;
end;
$$;
revoke all on function public.mon_debut() from public, anon;
grant execute on function public.mon_debut() to authenticated;

create or replace function public.mes_annonces()
returns table (id uuid, texte text, cree_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.texte, a.cree_at from public.posteur_annonces a
   where a.poster_id = auth.uid() and a.vu_at is null
     -- 0494 : Start Tuesday : le pop-up calculé en direct (mon_debut) remplace le message figé.
     and a.cle not like 'debut_mardi:%'
   order by a.cree_at desc
   limit 3;
$$;

create or replace function public.samedi_reports(p_lundi date)
returns table (poster_id uuid, nb_mardi integer, nb_reports integer, premiere_cohorte date, posts integer,
               jamais_commence boolean, regle boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with po as (
    select pr.id, pr.cohorte_lundi from public.profiles pr
     where pr.is_active
       and exists (select 1 from public.user_roles ur where ur.user_id = pr.id and ur.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
  ),
  reports as (
    -- Un report = une cohorte quittée (Postpone manuel, auto du dimanche ou du lundi) : une fois par lundi.
    select x.poster_id, x.lundi from (
      select e.poster_id, nullif(substring(e.cle from 'reporte:(\d{4}-\d{2}-\d{2})'), '')::date as lundi
        from public.recrue_evenements e where e.type = 'reporte'
      union
      select r.poster_id, r.periode from public.recrues_rouges r where r.decision = 'reporter'
      union
      select d.poster_id, d.lundi from public.debut_choix d where d.choix = 'reporter'
    ) x where x.lundi is not null
  ),
  agg as (
    select po.id as poster_id,
           (select count(*) from public.debut_choix d where d.poster_id = po.id and d.choix = 'mardi')::int as nb_mardi,
           (select count(distinct r.lundi) from reports r where r.poster_id = po.id)::int as nb_reports,
           least(po.cohorte_lundi,
                 (select min(r.lundi) from reports r where r.poster_id = po.id),
                 (select min(d.lundi) from public.debut_choix d where d.poster_id = po.id)) as premiere,
           (select count(*) from public.passages p join public.comptes c on c.id = p.compte_id
             where c.poster_id = po.id
               and (p.publie_url is not null or p.publie_at is not null or p.statut::text = 'publie'))::int as posts
      from po
  )
  select a.poster_id, a.nb_mardi, a.nb_reports, a.premiere, a.posts,
         (a.posts = 0 and a.premiere is not null and a.premiere < p_lundi),
         (a.nb_reports + a.nb_mardi >= 2 or (a.posts = 0 and a.premiere is not null and a.premiere < p_lundi))
    from agg a
   where a.nb_mardi > 0 or a.nb_reports > 0 or (a.posts = 0 and a.premiere is not null and a.premiere < p_lundi);
end;
$$;
revoke all on function public.samedi_reports(date) from public, anon;
grant execute on function public.samedi_reports(date) to authenticated;

notify pgrst, 'reload schema';
