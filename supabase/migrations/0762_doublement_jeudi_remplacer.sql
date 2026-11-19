-- 0762 : doublement du jeudi (19/11). Recalculer les propositions d'un jeudi avec la règle v2 sans rien supprimer :
-- les lignes encore sans décision sont mises à jour (rang, vues, viraux, label proposé), celles qui sortent du
-- classement passent « annule » et ne s'affichent plus ; les nouvelles sont ajoutées. Les lignes décidées ne bougent pas.
-- jeudi_doubles_lire_v2 et jeudi_doubles_preparer ignorent les lignes annulées sans décision. Additif.

create or replace function public.jeudi_doubles_recalculer(p_jeudi date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_maj integer;
  v_sortis integer;
  v_ajoutes integer;
begin
  if not public.is_admin_strict() and coalesce(auth.jwt()->>'role', '') <> 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.doubles_jeudi d
     set rang = k.rang, star = k.star, vues_med = k.vues_med, viraux = k.viraux, bons = k.bons, posts = k.posts,
         meilleur_url = k.meilleur_url, meilleur_vues = k.meilleur_vues, label_propose_id = k.label_propose_id,
         statut = 'propose', annule_at = null
    from public.jeudi_doubles_calculer_v2(p_jeudi) k
   where d.jeudi = p_jeudi and d.compte_id = k.compte_id and d.decision is null and d.statut in ('propose', 'annule');
  get diagnostics v_maj = row_count;
  update public.doubles_jeudi d set statut = 'annule', annule_at = now(), rang = null
   where d.jeudi = p_jeudi and d.decision is null and d.statut = 'propose'
     and d.compte_id not in (select k.compte_id from public.jeudi_doubles_calculer_v2(p_jeudi) k);
  get diagnostics v_sortis = row_count;
  insert into public.doubles_jeudi (jeudi, compte_id, poster_id, rang, star, vues_med, viraux, bons, posts, meilleur_url, meilleur_vues, label_propose_id)
  select p_jeudi, k.compte_id, k.poster_id, k.rang, k.star, k.vues_med, k.viraux, k.bons, k.posts, k.meilleur_url, k.meilleur_vues, k.label_propose_id
    from public.jeudi_doubles_calculer_v2(p_jeudi) k
  on conflict (jeudi, compte_id) do nothing;
  get diagnostics v_ajoutes = row_count;
  return jsonb_build_object('mis_a_jour', v_maj, 'sortis', v_sortis, 'ajoutes', v_ajoutes);
end;
$function$;

revoke all on function public.jeudi_doubles_recalculer(date) from public, anon;
grant execute on function public.jeudi_doubles_recalculer(date) to authenticated, service_role;

-- Les 40 au plus se comptent sans les lignes sorties du classement.
create or replace function public.jeudi_doubles_preparer(p_jeudi date)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_n integer;
begin
  if not public.is_admin() and coalesce(auth.jwt()->>'role', '') <> 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.doubles_jeudi (jeudi, compte_id, poster_id, rang, star, vues_med, viraux, bons, posts, meilleur_url, meilleur_vues, label_propose_id)
  select p_jeudi, k.compte_id, k.poster_id, k.rang, k.star, k.vues_med, k.viraux, k.bons, k.posts, k.meilleur_url, k.meilleur_vues, k.label_propose_id
    from public.jeudi_doubles_calculer_v2(p_jeudi) k
   where (select count(*) from public.doubles_jeudi d where d.jeudi = p_jeudi and not (d.statut = 'annule' and d.decision is null)) < 40
  on conflict (jeudi, compte_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

create or replace function public.jeudi_doubles_lire_v2(p_jeudi date)
returns table (id uuid, compte_id uuid, poster_id uuid, poster_nom text, hm_nom text, pays text, langue text, handle text,
               label_nom text, app_nom text, canal_paie text, star boolean, vues_med integer, viraux integer, bons integer, posts integer,
               meilleur_url text, meilleur_vues integer, label_propose_id uuid, label_propose_nom text, label_choisi_id uuid,
               decision text, statut text, erreur text, nouveau_compte_id uuid, rang integer)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.compte_id, d.poster_id,
         coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
         (select coalesce(nullif(btrim(concat_ws(' ', h.prenom, h.nom)), ''), h.email) from public.profiles h where h.id = pr.manager_id),
         c.pays, c.langue, c.handle_tiktok,
         (select string_agg(l.nom, ', ') from public.compte_labels cl join public.labels l on l.id = cl.label_id where cl.compte_id = c.id),
         (select a.nom from public.applications a where a.id = c.application_id),
         pr.canal_paie,
         d.star, d.vues_med, d.viraux, d.bons, d.posts, d.meilleur_url, d.meilleur_vues, d.label_propose_id,
         (select l.nom from public.labels l where l.id = d.label_propose_id),
         d.label_choisi_id, d.decision, d.statut, d.erreur, d.nouveau_compte_id, d.rang
    from public.doubles_jeudi d
    join public.comptes c on c.id = d.compte_id
    join public.profiles pr on pr.id = d.poster_id
   where public.is_admin() and d.jeudi = p_jeudi and not (d.statut = 'annule' and d.decision is null)
   order by d.rang nulls last, d.vues_med desc nulls last;
$$;
