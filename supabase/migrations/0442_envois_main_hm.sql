-- 0442 — Prompt 25 v4, débordement vers les HM : « To send by hand ».
--
-- Quand Upwork ne peut plus rien prendre aujourd'hui (budgets de Max et
-- d'Adrien épuisés, ou erreur de limite sur les deux), un message qui devait
-- partir sur Upwork ne passe plus au lendemain : il va à la HM de la recrue.
-- - relances_prevues : statut « main » (à envoyer à la main), main_at,
--   main_hm_id, main_slack_at (DM Slack groupé, une fois par heure au plus),
--   main_envoye_at, main_par. Les types : accueil, relance, lundi, lundi_soir,
--   jeudi, reponse (« Please ask on Slack »). Jamais la paie ni la fin de
--   contrat (ce ne sont pas des messages).
-- - envois_main_liste() : les messages à envoyer à la main (la HM : les siens ;
--   l'admin et le Head of Ops : tous), dans l'ordre bienvenue > relances >
--   lundi > nudge du jeudi > réponses.
-- - envoi_main_fait(poster, type, periode, par) : « Sent » (OS ou Slack) : le
--   message est noté parti (nudges, canal upwork, par la HM) ; la bienvenue
--   marque l'accueil envoyé ; la réponse marque la réponse partie.
-- - needs_you : pas marqué Sent 6 h après → « Pas envoyé à la main depuis 6 h ».
--
-- Additive : 1 contrainte élargie, 5 colonnes, 2 fonctions, needs_you
-- complété. Aucune donnée existante modifiée.

alter table public.relances_prevues drop constraint if exists relances_prevues_statut_check;
alter table public.relances_prevues add constraint relances_prevues_statut_check
  check (statut in ('prevu', 'bloque', 'ecarte', 'expire', 'perime', 'doublon', 'deja_envoye', 'main'));

alter table public.relances_prevues add column if not exists main_at timestamptz;
alter table public.relances_prevues add column if not exists main_hm_id uuid references public.profiles(id) on delete set null;
alter table public.relances_prevues add column if not exists main_slack_at timestamptz;
alter table public.relances_prevues add column if not exists main_envoye_at timestamptz;
alter table public.relances_prevues add column if not exists main_par uuid references auth.users(id) on delete set null;
comment on column public.relances_prevues.main_at is
  'Prompt 25 v4 (0442) : Upwork plein ; le message attend que la HM l''envoie à la main (statut main).';

create or replace function public.envois_main_liste()
returns table (
  poster_id  uuid,
  type       text,
  periode    date,
  nom        text,
  hm_id      uuid,
  hm_nom     text,
  contrat_id text,
  salon_url  text,
  texte      text,
  priorite   integer,
  main_at    timestamptz,
  en_retard  boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_tous boolean := public.is_admin();
begin
  if auth.uid() is null then
    raise exception 'envois_main_liste : connexion requise' using errcode = '42501';
  end if;
  return query
  select v.poster_id, v.type, v.periode,
         nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''),
         coalesce(pr.manager_id, v.main_hm_id),
         nullif(btrim(concat_ws(' ', hm.prenom, hm.nom)), ''),
         pr.upwork_contract_id,
         case when pr.upwork_contract_id is not null
              then 'https://www.upwork.com/nx/wm/workroom/' || pr.upwork_contract_id || '/overview' end,
         v.texte,
         case v.type when 'accueil' then 0 when 'relance' then 1 when 'lundi' then 2 when 'lundi_soir' then 2
                     when 'jeudi' then 3 else 4 end,
         v.main_at,
         v.main_at < now() - interval '6 hours'
    from public.relances_prevues v
    join public.profiles pr on pr.id = v.poster_id
    left join public.profiles hm on hm.id = coalesce(pr.manager_id, v.main_hm_id)
   where v.statut = 'main'
     and (v_tous or coalesce(pr.manager_id, v.main_hm_id) = auth.uid())
   order by 10, v.main_at;
end;
$$;
revoke all on function public.envois_main_liste() from public, anon;
grant execute on function public.envois_main_liste() to authenticated;

create or replace function public.envoi_main_fait(p_poster uuid, p_type text, p_periode date, p_par uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_par uuid := case when v_service then p_par else auth.uid() end;
  v record;
begin
  select rp.*, pr.manager_id into v
    from public.relances_prevues rp
    join public.profiles pr on pr.id = rp.poster_id
   where rp.poster_id = p_poster and rp.type = p_type and rp.periode = p_periode
   for update of rp;
  if not found then
    raise exception 'envoi_main_fait : message introuvable';
  end if;
  if not (v_service or public.is_admin() or v.manager_id = auth.uid() or v.main_hm_id = auth.uid()) then
    raise exception 'envoi_main_fait : réservé à la HM de la recrue et à l''admin' using errcode = '42501';
  end if;
  if v.statut <> 'main' then
    return false;
  end if;
  update public.relances_prevues
     set statut = 'deja_envoye', main_envoye_at = now(), main_par = v_par, maj_at = now()
   where poster_id = p_poster and type = p_type and periode = p_periode;
  -- Le message est parti : sur Upwork, par la HM. Une réponse n'est pas un message d'étape (pas de période).
  insert into public.nudges (poster_id, type, periode, compte_id, cible, canal, canaux, texte, envoye_par)
  values (p_poster, p_type, case when p_type = 'reponse' then null else p_periode end, null, 'hm', 'upwork',
          array['upwork'], v.texte, v_par)
  on conflict do nothing;
  if p_type = 'accueil' then
    update public.accueils
       set statut = 'envoye', message_at = now(), message_texte = v.texte, raison = 'envoyé à la main par la HM', updated_at = now()
     where poster_id = p_poster and message_at is null;
  elsif p_type = 'reponse' and (v.donnees ->> 'reponse_id') is not null then
    update public.posteur_reponses
       set reponse_statut = 'envoye', reponse_at = now()
     where id = (v.donnees ->> 'reponse_id')::uuid and reponse_statut = 'a_la_main';
  end if;
  return true;
end;
$$;
revoke all on function public.envoi_main_fait(uuid, text, date, uuid) from public, anon;
grant execute on function public.envoi_main_fait(uuid, text, date, uuid) to authenticated, service_role;

do $ny$
declare
  v_def text := pg_get_functiondef('public.needs_you()'::regprocedure);
  v_avant text := $q$    union all
    select 'samedi:' || cp.id$q$;
  v_apres text := $q$    union all
    select 'main:' || rp.poster_id || ':' || rp.type || ':' || rp.periode, 'bloque', 'envoi_main_6h', rp.poster_id, null,
           left(coalesce(rp.texte, ''), 400),
           'Upwork plein : à envoyer à la main par la HM, pas marqué Sent depuis 6 h',
           null, case when rp.type in ('lundi', 'lundi_soir') then 'lundi' else 'rien' end, rp.main_at,
           array['ouvrir'], rp.poster_id::text, '/admin/auto/sent?onglet=main', rp.type, 1
      from public.relances_prevues rp
     where rp.statut = 'main' and rp.main_at < now() - interval '6 hours'
    union all
    select 'samedi:' || cp.id$q$;
begin
  if position(v_avant in v_def) = 0 then raise exception '0442 : bloc « samedi » introuvable dans needs_you()'; end if;
  execute replace(v_def, v_avant, v_apres);
end;
$ny$;

notify pgrst, 'reload schema';
