-- 0436 — Prompt 25, partie 4 : le samedi, la masterlist (Weekly decisions → Saturday).
--
-- La liste vient de semaine_comptes (0435), du lundi au samedi. Les décisions
-- passent par le parcours existant (ckd_decider, fonction ckd) : un Kill part
-- dimanche midi (message de Kill, puis arrêt complet), un Double suit l'offre au
-- posteur.
-- - samedi_choisir(compte, action) : Kill ou Double sur un compte que le
--   contrôle du samedi n'a pas proposé : une proposition « à la main »
--   (donnees.manuel) dans le contrôle du samedi de la semaine, règle « absent »
--   (Kill) ou « doubler » (Double), puis décidée comme les autres. Rend son id.
-- - samedi_recrues(lundi) : les recrues de la cohorte du lundi suivant, pas
--   prêtes, relancées cette semaine sans réaction (ni réponse ni étape faite
--   depuis la dernière relance) : Kill ou reporter.
--
-- Additive : 2 fonctions. Aucune donnée existante modifiée.

create or replace function public.samedi_choisir(p_compte uuid, p_action text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lundi date := date_trunc('week', (now() at time zone 'Europe/Paris'))::date;
  v_ctrl  public.ckd_controles;
  v_regle text;
  v_id    uuid;
  c       record;
begin
  if not public.is_admin_strict() then
    raise exception 'samedi_choisir : réservé à l''admin';
  end if;
  if p_action not in ('ne_pas_renouveler', 'doubler') then
    raise exception 'samedi_choisir : action % inconnue', p_action;
  end if;
  select * into v_ctrl from public.ckd_controles ct
   where ct.type = 'samedi' and ct.jour between v_lundi and v_lundi + 6
   order by ct.jour desc limit 1;
  if not found then
    raise exception 'samedi_choisir : le contrôle du samedi n''est pas encore calculé';
  end if;
  v_regle := case p_action when 'doubler' then 'doubler' else 'absent' end;

  -- Déjà proposée par le contrôle (même règle) : c'est elle qu'on décide.
  select cp.id into v_id from public.ckd_propositions cp
   where cp.controle_id = v_ctrl.id and cp.compte_id = p_compte and cp.regle = v_regle and cp.decision is null
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select co.id, co.poster_id, co.pays, co.langue, co.handle_tiktok, pr.manager_id,
         public.application_principale(co.parts_applications) as application
    into c
    from public.comptes co join public.profiles pr on pr.id = co.poster_id
   where co.id = p_compte and co.is_active;
  if not found then
    raise exception 'samedi_choisir : compte introuvable ou inactif';
  end if;

  insert into public.ckd_propositions (controle_id, type, jour, regle, action, compte_id, poster_id, hm_id, pays, langue, application, donnees)
  values (v_ctrl.id, 'samedi', v_ctrl.jour, v_regle, p_action, c.id, c.poster_id, c.manager_id, c.pays, c.langue, c.application,
          jsonb_build_object('handle', c.handle_tiktok, 'manuel', true, 'motifs', '[]'::jsonb,
                             'choisi_par', auth.uid(), 'choisi_at', now()))
  on conflict (compte_id, regle, jour) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'samedi_choisir : déjà décidé pour ce compte cette semaine';
  end if;
  return v_id;
end;
$$;
revoke all on function public.samedi_choisir(uuid, text) from public, anon;
grant execute on function public.samedi_choisir(uuid, text) to authenticated;

-- Les recrues de la cohorte du lundi suivant, pas prêtes, relancées sans réaction.
create or replace function public.samedi_recrues(p_lundi date)
returns table (
  poster_id        uuid,
  nom              text,
  hm_nom           text,
  pays             text,
  compte_id        uuid,
  handle           text,
  cohorte_lundi    date,
  connecte         boolean,
  tiktok_trouve    boolean,
  start_warmup     boolean,
  abonnements      integer,
  relances         integer,
  derniere_relance timestamptz,
  repondu_at       timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (public.is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'samedi_recrues : réservé à l''admin et au Head of Ops' using errcode = '42501';
  end if;
  return query
  with r as (
    select e.* from public.etapes_recrues_v2() e
     where not coalesce(e.deuxieme, false) and e.cohorte_lundi = p_lundi + 7 and not coalesce(e.pret, false)
  ),
  n as (
    select nu.poster_id, count(*)::int as relances, max(nu.envoye_at) as derniere
      from public.nudges nu
     where nu.poster_id in (select r.poster_id from r)
       and nu.type in ('relance', 'connexion', 'tiktok', 'warmup_lance', 'warmup_bien_fait', 'jeudi_recrue')
       and nu.envoye_at >= p_lundi
       and (nu.slack_erreur is null or coalesce(array_length(nu.canaux, 1), 0) > 0)
     group by nu.poster_id
  )
  select r.poster_id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), nullif(btrim(concat_ws(' ', hm.prenom, hm.nom)), ''),
         r.pays, r.compte_id, r.handle, r.cohorte_lundi,
         r.premiere_connexion_at is not null, coalesce(r.tiktok_existe, false), r.warmup_started_at is not null, r.abonnements,
         n.relances, n.derniere, r.repondu_at
    from r
    join n on n.poster_id = r.poster_id
    join public.profiles pr on pr.id = r.poster_id
    left join public.profiles hm on hm.id = pr.manager_id
   where r.repondu_at is null or r.repondu_at < n.derniere;
end;
$$;
revoke all on function public.samedi_recrues(date) from public, anon;
grant execute on function public.samedi_recrues(date) to authenticated, service_role;

notify pgrst, 'reload schema';
