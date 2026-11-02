-- 0474 — Le check du warm-up, le dimanche soir (Weekly decisions → Sunday).
--
-- Dimanche 20:00 : les recrues de la cohorte du lendemain. En haut celles à
-- risque (moins de 5 abonnements, compte introuvable ou relevé illisible,
-- posts publiés pendant le warm-up), puis les autres ; à part, sans compte ou
-- sans Start warmup (report d'une semaine, comme aujourd'hui).
-- Deux décisions, rien ne part sans clic :
--   « Warm-up OK »     : elle commence lundi ;
--   « Not warmed up »  : ses posts commencent mardi (warmup_ends_at des comptes
--                        actifs au mardi 00:00, heure du pays) et un message part
--                        (Slack, sinon Upwork), par la fonction upwork.
--
-- Additive : 1 table, 2 fonctions. Aucune ligne supprimée.

create table if not exists public.warmup_checks (
  poster_id uuid not null references public.profiles(id),
  lundi date not null,
  decision text not null check (decision in ('ok', 'pas_chaud')),
  decide_par uuid,
  decide_at timestamptz not null default now(),
  canal text,
  message_statut text,
  message_erreur text,
  primary key (poster_id, lundi)
);
alter table public.warmup_checks enable row level security;
create policy "warmup_checks lecture" on public.warmup_checks for select using ((select public.is_admin()));

create or replace function public.warmup_check_liste(p_lundi date)
returns table (
  poster_id uuid, nom text, hm_nom text, slack boolean, contrat_id text, compte_id uuid, handle text, pays text,
  warmup_started_at timestamptz, releve_at timestamptz, existe boolean, abonnements int, videos int, erreur_releve text,
  releves jsonb, risques text[], groupe text, decision text, decide_at timestamptz, message_statut text, message_erreur text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role'
          or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'head_of_ops')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with r as (
    select pr.id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), '') as nom,
           (select nullif(btrim(concat_ws(' ', m.prenom, m.nom)), '') from public.profiles m where m.id = pr.manager_id) as hm_nom,
           pr.slack_user_id is not null as slack, pr.upwork_contract_id::text as contrat_id,
           c.id as compte_id, c.handle_tiktok, c.pays, c.warmup_started_at
      from public.profiles pr
      left join lateral (
        select x.* from public.comptes x
         where x.poster_id = pr.id and x.is_active and coalesce(x.type_compte, 'perso') = 'perso'
         order by (x.warmup_started_at is not null) desc, x.created_at
         limit 1
      ) c on true
     where pr.is_active
       and pr.cohorte_lundi = p_lundi
       and exists (select 1 from public.user_roles ur where ur.user_id = pr.id and ur.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
       and concat_ws(' ', pr.prenom, pr.nom) !~* '\mtest\M'
  ),
  d as (
    select r.*, w.releve_at, w.existe, w.abonnements, w.videos, w.erreur,
           (select coalesce(jsonb_agg(jsonb_build_object('at', y.releve_at, 'existe', y.existe, 'abonnements', y.abonnements,
                                                         'videos', y.videos, 'erreur', y.erreur) order by y.releve_at desc), '[]'::jsonb)
              from (select * from public.ckd_warmup_releves z where z.compte_id = r.compte_id order by z.releve_at desc limit 3) y) as releves
      from r
      left join lateral (
        select x.releve_at, x.existe, x.abonnements, x.videos, x.erreur
          from public.ckd_warmup_releves x
         where x.compte_id = r.compte_id
         order by x.releve_at desc
         limit 1
      ) w on true
  )
  select d.id, d.nom, d.hm_nom, d.slack, d.contrat_id, d.compte_id, d.handle_tiktok, d.pays,
         d.warmup_started_at, d.releve_at, d.existe, d.abonnements, d.videos, d.erreur, d.releves,
         array_remove(array[
           case when d.compte_id is not null and d.warmup_started_at is not null and d.releve_at is null then 'jamais_releve' end,
           case when d.existe is false then 'introuvable' end,
           case when d.releve_at is not null and d.existe is null then 'illisible' end,
           case when d.existe and coalesce(d.abonnements, 0) < 5 then 'moins_5' end,
           case when d.existe and coalesce(d.videos, 0) > 0 then 'posts' end
         ], null),
         case when d.compte_id is null or d.warmup_started_at is null then 'report'
              when d.releve_at is null or d.existe is not true or coalesce(d.abonnements, 0) < 5 or coalesce(d.videos, 0) > 0 then 'risque'
              else 'ok' end,
         wc.decision, wc.decide_at, wc.message_statut, wc.message_erreur
    from d
    left join public.warmup_checks wc on wc.poster_id = d.id and wc.lundi = p_lundi
   order by case when d.compte_id is null or d.warmup_started_at is null then 2
                 when d.releve_at is null or d.existe is not true or coalesce(d.abonnements, 0) < 5 or coalesce(d.videos, 0) > 0 then 0
                 else 1 end,
            d.hm_nom nulls last, d.nom;
end;
$$;
revoke all on function public.warmup_check_liste(date) from public, anon;
grant execute on function public.warmup_check_liste(date) to authenticated, service_role;

-- La décision ; « Not warmed up » : posts à partir de mardi. Le message est noté par la fonction upwork.
create or replace function public.warmup_check_noter(
  p_poster uuid, p_lundi date, p_decision text, p_par uuid default null,
  p_canal text default null, p_statut text default null, p_erreur text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(auth.jwt() ->> 'role', '') = 'service_role' or current_user = 'postgres' or public.is_admin()) then
    raise exception 'warmup_check_noter : réservé à la fonction upwork et à l''admin' using errcode = '42501';
  end if;
  if p_decision not in ('ok', 'pas_chaud') then
    raise exception 'warmup_check_noter : décision inconnue';
  end if;
  insert into public.warmup_checks (poster_id, lundi, decision, decide_par, decide_at, canal, message_statut, message_erreur)
  values (p_poster, p_lundi, p_decision, p_par, now(), p_canal, p_statut, p_erreur)
  on conflict (poster_id, lundi) do update
     set decision = excluded.decision, decide_par = coalesce(excluded.decide_par, warmup_checks.decide_par), decide_at = now(),
         canal = coalesce(excluded.canal, warmup_checks.canal),
         message_statut = coalesce(excluded.message_statut, warmup_checks.message_statut),
         message_erreur = excluded.message_erreur;
  if p_decision = 'pas_chaud' then
    update public.comptes c
       set warmup_ends_at = greatest(coalesce(c.warmup_ends_at, '-infinity'::timestamptz),
                                     ((p_lundi + 1)::timestamp at time zone coalesce(public.fuseau_pays(c.pays), 'Europe/Paris')))
     where c.poster_id = p_poster and c.is_active;
  end if;
  insert into public.recrue_evenements (poster_id, type, at, detail, cle)
  values (p_poster, 'warmup_check', now(),
          case when p_decision = 'ok' then 'Sunday warm-up check: OK, starts Monday'
               else 'Sunday warm-up check: not warmed up, posts start Tuesday' end,
          p_lundi::text || ':' || p_decision)
  on conflict (poster_id, type, cle) do nothing;
end;
$$;
revoke all on function public.warmup_check_noter(uuid, date, text, uuid, text, text, text) from public, anon;
grant execute on function public.warmup_check_noter(uuid, date, text, uuid, text, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
