-- 0439 — Prompt 25 v4, partie 3 : le Kill du samedi part à Validate, sans message.
--
-- - arrets.sans_message : l'arrêt complet ne met aucun dernier message sur
--   Upwork (fonction upwork, arreterUn). Vrai pour le Kill du samedi.
-- - ckd_decider : un Kill (ne_pas_renouveler) décidé sur le contrôle du samedi
--   s'arrête tout de suite (avant : dimanche 23 h 30) : compte désactivé, et
--   s'il n'en reste aucun, posteur désactivé et arrêt complet (Slack, contrat
--   fermé ; déjà posté : après la paie de lundi). Le reste ne change pas.
-- - ckd_arreter_comptes : l'arrêt du Kill du samedi est « sans message ».
-- - samedi_arreter_recrue(poster) : une recrue sans compte, Kill depuis la
--   liste du samedi : désactivée, arrêt complet sans message.
-- - needs_you : « À payer ou rembourser avant fermeture » quand un arrêt ne
--   peut pas fermer le contrat (milestone encore financée, ou semaine à payer
--   lundi) et qu'aucun remboursement n'est déjà demandé.
--
-- Additive : 1 colonne, 1 fonction, 3 fonctions modifiées. Aucune donnée
-- existante modifiée.

alter table public.arrets add column if not exists sans_message boolean not null default false;
comment on column public.arrets.sans_message is
  'Prompt 25 v4 (0439) : aucun dernier message sur Upwork (Kill du samedi).';

do $decider$
declare
  v_def text := pg_get_functiondef('public.ckd_decider(uuid,text,text,uuid)'::regprocedure);
  v_avant text := $q$    v_prevu := public.ckd_prochain_arret(now(), true);$q$;
  v_apres text := $q$    -- Prompt 25 v4 : le Kill du samedi part à Validate (avant : dimanche 23 h 30).
    v_prevu := case when p.type = 'samedi' then now() else public.ckd_prochain_arret(now(), true) end;$q$;
begin
  if position(v_avant in v_def) = 0 then raise exception '0439 : ckd_prochain_arret introuvable dans ckd_decider'; end if;
  execute replace(v_def, v_avant, v_apres);
end;
$decider$;

do $arreter$
declare
  v_def text := pg_get_functiondef('public.ckd_arreter_comptes()'::regprocedure);
  v_avant text := $q$insert into public.arrets (poster_id, source) values (r.poster_id, 'kill_samedi');$q$;
  v_apres text := $q$insert into public.arrets (poster_id, source, sans_message) values (r.poster_id, 'kill_samedi', true);$q$;
begin
  if position(v_avant in v_def) = 0 then raise exception '0439 : insertion de l''arrêt introuvable dans ckd_arreter_comptes'; end if;
  execute replace(v_def, v_avant, v_apres);
end;
$arreter$;

create or replace function public.samedi_arreter_recrue(p_poster uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_strict() then
    raise exception 'samedi_arreter_recrue : réservé à l''admin';
  end if;
  if not exists (select 1 from public.profiles where id = p_poster) then
    raise exception 'samedi_arreter_recrue : posteur introuvable';
  end if;
  update public.profiles set is_active = false where id = p_poster and is_active;
  update public.comptes set is_active = false where poster_id = p_poster and is_active;
  -- Ses messages prévus ne partent plus (statut, rien n'est effacé).
  update public.relances_prevues set statut = 'perime', maj_at = now() where poster_id = p_poster and statut = 'prevu';
  if not exists (select 1 from public.arrets where poster_id = p_poster and statut in ('a_faire', 'en_cours')) then
    insert into public.arrets (poster_id, source, demande_par, sans_message) values (p_poster, 'kill_samedi', auth.uid(), true);
  else
    update public.arrets set sans_message = true where poster_id = p_poster and statut = 'a_faire';
  end if;
end;
$$;
revoke all on function public.samedi_arreter_recrue(uuid) from public, anon;
grant execute on function public.samedi_arreter_recrue(uuid) to authenticated;

do $ny$
declare
  v_def text := pg_get_functiondef('public.needs_you()'::regprocedure);
  v_avant text := $q$    union all
    select 'samedi:' || cp.id$q$;
  v_apres text := $q$    union all
    select 'fermeture:' || a.id, 'a_la_main', 'a_payer_avant_fermeture', a.poster_id, null,
           coalesce((select e->>'detail' from jsonb_array_elements(a.etapes) e
                      where e->>'action' in ('fermeture', 'paie') and e->>'statut' = 'a_faire' limit 1), ''),
           'À payer ou rembourser avant fermeture', null, 'paie', a.created_at,
           array['ouvrir'], a.id::text, '/admin/auto/payroll', null, 1
      from public.arrets a
     where a.annule_at is null and a.statut <> 'annule'
       and exists (select 1 from jsonb_array_elements(a.etapes) e where e->>'action' in ('fermeture', 'paie') and e->>'statut' = 'a_faire')
       and not exists (select 1 from jsonb_array_elements(a.etapes) e where e->>'action' = 'remboursement' and e->>'statut' = 'a_faire')
    union all
    select 'samedi:' || cp.id$q$;
begin
  if position(v_avant in v_def) = 0 then raise exception '0439 : bloc « samedi » introuvable dans needs_you()'; end if;
  execute replace(v_def, v_avant, v_apres);
end;
$ny$;

notify pgrst, 'reload schema';
