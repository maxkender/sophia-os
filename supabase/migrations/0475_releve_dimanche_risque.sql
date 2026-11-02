-- 0475 — Le check du warm-up : relevé du dimanche 18:00 et « à risque » réel.
--
-- - Cron releve-cohorte-dimanche (toutes les 5 min, dimanche 18:00-19:55
--   Paris ; la fonction ckd vérifie l'heure) : chaque recrue de la cohorte du
--   lendemain qui a cliqué Start warmup est relevée (page TikTok, sinon Apify).
-- - warmup_check_liste : « à risque » seulement si le compte existe avec moins
--   de 5 abonnements ou un post, ou s'il est introuvable par les 2 méthodes.
--   Illisible ou jamais relevé : un groupe à part (« illisible »).
--
-- Additive : 1 cron (commande reprise d'un cron ckd, seule l'action change),
-- warmup_check_liste remplacée. Aucune donnée modifiée.

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
        -- Le dernier relevé qui a conclu (existe ou introuvable), sinon le dernier tout court.
        select x.releve_at, x.existe, x.abonnements, x.videos, x.erreur
          from public.ckd_warmup_releves x
         where x.compte_id = r.compte_id
         order by (x.existe is not null) desc, x.releve_at desc
         limit 1
      ) w on true
  ),
  g as (
    select d.*,
           case when d.compte_id is null or d.warmup_started_at is null then 'report'
                when d.existe is false then 'risque'
                when d.existe and (coalesce(d.abonnements, 0) < 5 or coalesce(d.videos, 0) > 0) then 'risque'
                when d.existe then 'ok'
                else 'illisible' end as groupe
      from d
  )
  select g.id, g.nom, g.hm_nom, g.slack, g.contrat_id, g.compte_id, g.handle_tiktok, g.pays,
         g.warmup_started_at, g.releve_at, g.existe, g.abonnements, g.videos, g.erreur, g.releves,
         array_remove(array[
           case when g.compte_id is not null and g.warmup_started_at is not null and g.releve_at is null then 'jamais_releve' end,
           case when g.existe is false then 'introuvable' end,
           case when g.releve_at is not null and g.existe is null then 'illisible' end,
           case when g.existe and coalesce(g.abonnements, 0) < 5 then 'moins_5' end,
           case when g.existe and coalesce(g.videos, 0) > 0 then 'posts' end
         ], null),
         g.groupe, wc.decision, wc.decide_at, wc.message_statut, wc.message_erreur
    from g
    left join public.warmup_checks wc on wc.poster_id = g.id and wc.lundi = p_lundi
   order by case g.groupe when 'risque' then 0 when 'illisible' then 1 when 'ok' then 2 else 3 end, g.hm_nom nulls last, g.nom;
end;
$$;
revoke all on function public.warmup_check_liste(date) from public, anon;
grant execute on function public.warmup_check_liste(date) to authenticated, service_role;

do $c$
declare
  v text;
begin
  select regexp_replace(j.command, '"action"\s*:\s*"releve_warmup_planifie"', '"action":"releve_cohorte"') into v
    from cron.job j where j.jobname = 'ckd-warmup-releve';
  if v is null or v !~ '"action":"releve_cohorte"' then
    raise exception '0475 : commande du cron ckd-warmup-releve introuvable';
  end if;
  if not exists (select 1 from cron.job where jobname = 'releve-cohorte-dimanche') then
    perform cron.schedule('releve-cohorte-dimanche', '*/5 16,17,18 * * 0', v);
  end if;
end;
$c$;

notify pgrst, 'reload schema';
