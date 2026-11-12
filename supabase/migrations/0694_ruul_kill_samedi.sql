-- 0694 : PARCOURS RUUL, point 7 — le Kill du samedi d'un posteur Ruul passe par ruul_desactiver
-- (comme Upwork, sans contrat à fermer) : compte désactivé, posts stoppés, plus de relances
-- (relances_stop_at), « À retirer de Slack », arrêt noté « kill_samedi » (Paie → Ruul : « Killé le … »).
-- Les posteurs Upwork ne changent pas. Additif : une fonction nouvelle, trois redéfinies (mêmes signatures).

/* Le cœur de ruul_desactiver, sans contrôle d'accès : appelé par les fonctions du serveur seulement. */
create or replace function public.ruul_desactiver_interne(p_poster uuid, p_source text, p_motif text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_source not in ('je_ne_veux_plus', 'manuel', 'kill_samedi') then raise exception 'source inconnue'; end if;
  if not exists (select 1 from public.profiles where id = p_poster and canal_paie = 'ruul') then return false; end if;
  update public.profiles set is_active = false, relances_stop_at = coalesce(relances_stop_at, now()) where id = p_poster;
  update public.comptes set is_active = false where poster_id = p_poster and is_active;
  update public.relances_prevues set statut = 'perime', maj_at = now() where poster_id = p_poster and statut = 'prevu';
  if not exists (select 1 from public.arrets where poster_id = p_poster and statut in ('a_faire', 'en_cours')) then
    insert into public.arrets (poster_id, source, motif, sans_message, demande_par) values (p_poster, p_source, p_motif, true, auth.uid());
  end if;
  perform public.slack_retrait_ajouter(p_poster);
  return true;
end;
$$;
revoke execute on function public.ruul_desactiver_interne(uuid, text, text) from public, anon, authenticated;

create or replace function public.ruul_desactiver(p_poster uuid, p_source text, p_motif text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.ruul_desactiver_interne(p_poster, p_source, p_motif);
end;
$$;
revoke execute on function public.ruul_desactiver(uuid, text, text) from public, anon;
grant execute on function public.ruul_desactiver(uuid, text, text) to authenticated, service_role;

/* Les Kills du samedi (masterlist, puis tâche planifiée) : un posteur Ruul passe par ruul_desactiver. */
create or replace function public.ckd_arreter_comptes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_n integer := 0;
begin
  if public.automation_en_pause() then
    for r in
      select a.compte_id, c.poster_id from public.ckd_arrets a join public.comptes c on c.id = a.compte_id
       where a.fait_at is null and a.annule_at is null and a.prevu_at <= now()
    loop
      perform public.noter_action_bloquee('ckd', 'kill_samedi', r.poster_id, r.compte_id::text, null);
    end loop;
    return 0;
  end if;
  for r in
    select a.compte_id, c.poster_id, a.raison
      from public.ckd_arrets a
      join public.comptes c on c.id = a.compte_id
     where a.fait_at is null and a.annule_at is null and a.prevu_at <= now()
     for update of a skip locked
  loop
    update public.comptes set is_active = false where id = r.compte_id;
    update public.ckd_arrets set fait_at = now() where compte_id = r.compte_id;
    if not exists (select 1 from public.comptes c where c.poster_id = r.poster_id and c.is_active) then
      update public.profiles set is_active = false where id = r.poster_id and is_active;
      if r.raison = 'ne_pas_renouveler'
         and not exists (select 1 from public.arrets x where x.poster_id = r.poster_id and x.statut in ('a_faire', 'en_cours')) then
        if exists (select 1 from public.profiles p where p.id = r.poster_id and p.canal_paie = 'ruul') then
          perform public.ruul_desactiver_interne(r.poster_id, 'kill_samedi', 'Kill du samedi');
        else
          insert into public.arrets (poster_id, source, sans_message) values (r.poster_id, 'kill_samedi', true);
        end if;
      end if;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

/* Le Kill du samedi d'un posteur sans compte (ou du dimanche) : Ruul → ruul_desactiver. */
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
  if exists (select 1 from public.profiles where id = p_poster and canal_paie = 'ruul') then
    perform public.ruul_desactiver_interne(p_poster, 'kill_samedi', 'Kill du samedi');
    update public.arrets set sans_message = true where poster_id = p_poster and statut = 'a_faire';
    return;
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

/* Paie → Ruul : le dernier arrêt de chaque posteur (« Killé le … » / « Arrêté le … »). */
create or replace function public.ruul_posteurs()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'réservé à l''admin et au Head of Ops'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'poster_id', pr.id, 'nom', coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
             'prenom_legal', h.prenom_legal, 'nom_legal', h.nom_legal,
             'ruul_email', pr.ruul_email, 'ruul_statut', pr.ruul_statut, 'pays', public.paie_pays_posteur(pr.id),
             'cohorte', coalesce(pr.cohorte_lundi, h.debut_le), 'actif', pr.is_active,
             'ajoute_at', pr.ruul_ajoute_at, 'pret_at', pr.ruul_pret_at, 'premier_paiement_at', pr.ruul_premier_paiement_at,
             'relances', pr.ruul_relances, 'relance_at', pr.ruul_relance_at, 'stop_at', pr.relances_stop_at,
             'du', (select coalesce(sum(rp.montant), 0) from public.ruul_paiements rp where rp.poster_id = pr.id and rp.statut in ('a_payer', 'reporte')),
             'arret', (select jsonb_build_object('source', a.source, 'motif', a.motif, 'at', a.created_at)
                         from public.arrets a where a.poster_id = pr.id and a.annule_at is null
                        order by a.created_at desc limit 1))
           order by pr.ruul_statut, pr.prenom)
      from public.profiles pr
      left join public.hub_posteurs h on h.profile_id = pr.id
     where pr.canal_paie = 'ruul'), '[]'::jsonb);
end;
$$;
