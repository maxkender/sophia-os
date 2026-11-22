-- 0806 : la Boîte ne montre que ce qui a vraiment besoin de Max (21/11). Additif.
-- 1. problemes_deja_regles(p_poster) : les problèmes ouverts déjà réglés, avec la règle et ce qui a été fait :
--    R1 une demande du support résolue (ou une action faite) après le problème, une tâche faite, ou les faits
--       (connecté, posté, warm-up lancé, contrat ou Slack relié depuis) ;
--    R2 « mark_read » proposé par un bot avec son diagnostic (le posteur a eu sa réponse) ;
--    R3 l'arrêt est fait, ou le posteur est désactivé.
--    Une carte à plusieurs sujets qui touche l'argent, un arrêt ou un 2e compte n'est fermée que par R3.
-- 2. problemes_nettoyer(p_poster, p_simuler) : les ferme (statut ferme_auto, ferme_raison = ce qui a été fait).
-- 3. Déclencheurs : une demande résolue (ou une action faite) et un arrêt fait ferment les problèmes du posteur ;
--    un arrêt en erreur ouvre une carte urgente « arret_echec » (la seule raison pour qu'un STOP remonte à Max).
-- 4. aujourdhui_details : la colonne du @ TikTok est handle_tiktok (le panneau de droite était en erreur).

create or replace function public.problemes_deja_regles(p_poster uuid default null)
returns table (id uuid, regle text, raison text)
language sql stable security definer set search_path = public as $$
  with p as (
    select p.id, p.poster_id, p.categorie, p.created_at, p.resume, p.proposition_action, p.propose_par, p.diagnostic,
           p.sources, coalesce(p.sujets, '[]'::jsonb) as sujets,
           pr.is_active as actif, pr.premiere_connexion_at, pr.upwork_contract_id, pr.canal_paie, pr.slack_user_id,
           u.last_sign_in_at
      from public.problemes p
      left join public.profiles pr on pr.id = p.poster_id
      left join auth.users u on u.id = p.poster_id
     where p.statut = 'ouvert' and (p_poster is null or p.poster_id = p_poster)
  ), f as (
    select p.*,
           exists (select 1 from jsonb_array_elements(p.sujets) s
                    where s->>'categorie' in ('paie', 'stop', 'stop_doute', 'demande_2e_compte', 'deuxieme_contrat')
                      and s->>'categorie' <> p.categorie) as sujet_sensible,
           dem.resolu_at as dem_at, dem.action_faite as dem_action,
           (select a.fait_at from public.a_faire a
             where p.sources->0->>'ref' like 'afaire:%' and a.id::text = substr(p.sources->0->>'ref', 8)) as tache_faite,
           (select min(pa.publie_at) from public.passages pa join public.comptes c on c.id = pa.compte_id
             where c.poster_id = p.poster_id and pa.publie_url is not null and pa.publie_at >= p.created_at) as poste_at,
           (select min(c.warmup_started_at) from public.comptes c
             where c.poster_id = p.poster_id and c.warmup_started_at is not null) as warmup_at,
           (select max(a.maj_at) from public.arrets a
             where a.poster_id = p.poster_id and a.statut = 'fait' and a.annule_at is null) as arret_at
      from p
      left join lateral (
        select coalesce(d.resolu_at, d.maj_at) as resolu_at, d.action_faite
          from public.support_demandes d
         where p.poster_id is not null and d.poster_id = p.poster_id and d.statut = 'resolu'
           and coalesce(d.resolu_at, d.maj_at) >= p.created_at
           and (d.probleme_id = p.id
                or p.categorie in ('question_bloquante', 'hors_plateforme')
                or (p.categorie = 'login' and (d.categorie in ('login', 'connexion') or d.action_faite ilike 'lien de mot de passe%'))
                or (p.categorie = 'tiktok_setup' and d.categorie in ('tiktok', 'warmup'))
                or (p.categorie = 'slack' and (d.categorie = 'slack' or d.action_faite ilike 'lien Slack%')))
         order by d.resolu_at limit 1
      ) dem on true
  ), r as (
    select f.id, f.categorie, f.sujet_sensible,
      case
        when f.poster_id is not null and f.actif is false then 'R3'
        when f.categorie in ('stop', 'stop_doute') and f.arret_at is not null then 'R3'
        when f.dem_at is not null then 'R1'
        when f.tache_faite is not null then 'R1'
        when f.proposition_action = 'mark_read' and coalesce(f.propose_par, 'os') <> 'os' and f.diagnostic is not null then 'R2'
        when f.categorie = 'login' and greatest(f.premiere_connexion_at, f.last_sign_in_at) >= f.created_at then 'R1'
        when f.categorie in ('tiktok_setup', 'zero_post', 'relance_echec') and f.poste_at is not null then 'R1'
        when f.categorie in ('tiktok_setup', 'relance_echec') and f.warmup_at is not null and f.resume !~* 'reach anymore' then 'R1'
        when f.categorie = 'relance_echec' and f.resume ilike '%contrat_non_relie%'
             and (f.upwork_contract_id is not null or f.canal_paie = 'ruul') then 'R1'
        when f.categorie = 'slack' and f.slack_user_id is not null then 'R1'
      end as regle,
      case
        when f.poster_id is not null and f.actif is false then 'Réglé : posteur arrêté (désactivé), plus rien à faire.'
        when f.categorie in ('stop', 'stop_doute') and f.arret_at is not null
          then 'Réglé : arrêt fait le ' || to_char(f.arret_at at time zone 'Europe/Paris', 'DD/MM') || ' (posteur et comptes désactivés).'
        when f.dem_at is not null
          then 'Réglé par le support le ' || to_char(f.dem_at at time zone 'Europe/Paris', 'DD/MM') || ' : '
               || coalesce(nullif(btrim(f.dem_action), ''), 'réponse envoyée au posteur') || '.'
        when f.tache_faite is not null then 'Réglé : tâche faite le ' || to_char(f.tache_faite at time zone 'Europe/Paris', 'DD/MM') || '.'
        when f.proposition_action = 'mark_read' and coalesce(f.propose_par, 'os') <> 'os' and f.diagnostic is not null
          then 'Lu (' || f.propose_par || ') : ' || left(f.diagnostic, 240)
        when f.categorie = 'login' and greatest(f.premiere_connexion_at, f.last_sign_in_at) >= f.created_at
          then 'Réglé : le posteur s''est connecté le '
               || to_char(greatest(f.premiere_connexion_at, f.last_sign_in_at) at time zone 'Europe/Paris', 'DD/MM') || '.'
        when f.categorie in ('tiktok_setup', 'zero_post', 'relance_echec') and f.poste_at is not null
          then 'Réglé : post avec lien le ' || to_char(f.poste_at at time zone 'Europe/Paris', 'DD/MM') || '.'
        when f.categorie in ('tiktok_setup', 'relance_echec') and f.warmup_at is not null and f.resume !~* 'reach anymore'
          then 'Réglé : warm-up lancé le ' || to_char(f.warmup_at at time zone 'Europe/Paris', 'DD/MM') || '.'
        when f.categorie = 'relance_echec' and f.resume ilike '%contrat_non_relie%'
             and (f.upwork_contract_id is not null or f.canal_paie = 'ruul') then 'Réglé : contrat relié depuis.'
        when f.categorie = 'slack' and f.slack_user_id is not null then 'Réglé : Slack relié depuis.'
      end as raison
    from f
  )
  select r.id, r.regle, r.raison from r
   where r.regle is not null and (r.regle = 'R3' or not r.sujet_sensible);
$$;
revoke execute on function public.problemes_deja_regles(uuid) from public, anon, authenticated;
grant execute on function public.problemes_deja_regles(uuid) to service_role;

-- 2. La fermeture (sans aucun message au posteur).
create or replace function public.problemes_nettoyer_interne(p_poster uuid, p_simuler boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_par_regle jsonb;
  v_n integer;
begin
  select coalesce(jsonb_object_agg(regle, n), '{}'::jsonb), coalesce(sum(n), 0)::int into v_par_regle, v_n
    from (select regle, count(*) as n from public.problemes_deja_regles(p_poster) group by 1) x;
  if not p_simuler and v_n > 0 then
    update public.problemes p
       set statut = 'ferme_auto', ferme_raison = d.raison, ferme_at = now(), maj_at = now(),
           journal = coalesce(p.journal, '[]'::jsonb)
                     || jsonb_build_array(jsonb_build_object('at', now(), 'par', 'os', 'action', 'ferme_auto', 'regle', d.regle, 'raison', d.raison))
      from public.problemes_deja_regles(p_poster) d
     where p.id = d.id and p.statut = 'ouvert';
  end if;
  return jsonb_build_object('fermes', v_n, 'par_regle', v_par_regle, 'simule', p_simuler);
end;
$$;
revoke execute on function public.problemes_nettoyer_interne(uuid, boolean) from public, anon, authenticated;
grant execute on function public.problemes_nettoyer_interne(uuid, boolean) to service_role;

create or replace function public.problemes_nettoyer(p_simuler boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.problemes_nettoyer_interne(null, p_simuler);
end;
$$;
revoke execute on function public.problemes_nettoyer(boolean) from public, anon;
grant execute on function public.problemes_nettoyer(boolean) to authenticated, service_role;

-- 3a. Une demande résolue, ou une action faite : les problèmes du posteur déjà réglés se ferment.
create or replace function public.support_demandes_ferme_problemes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.poster_id is not null and (new.statut = 'resolu' or new.action_faite is not null) then
    begin
      perform public.problemes_nettoyer_interne(new.poster_id, false);
    exception when others then
      raise warning 'support_demandes_ferme_problemes : %', sqlerrm;
    end;
  end if;
  return null;
end;
$$;

-- 3b. Un arrêt fait ferme les problèmes du posteur ; un arrêt en erreur ouvre une carte urgente pour Max.
create or replace function public.arrets_ferme_problemes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_nom text;
begin
  begin
    if new.statut = 'fait' and new.annule_at is null then
      perform public.problemes_nettoyer_interne(new.poster_id, false);
    end if;
    if (new.statut = 'erreur' or new.erreur is not null)
       and (tg_op = 'INSERT' or old.statut is distinct from new.statut or old.erreur is distinct from new.erreur) then
      select coalesce(nullif(btrim(concat_ws(' ', prenom, nom)), ''), 'Ce posteur') into v_nom from public.profiles where id = new.poster_id;
      v_id := public.probleme_ajouter('arret_echec', new.id::text || ':' || coalesce(md5(new.erreur), 'statut'), new.poster_id, null,
        'arret_echec', 'L''arrêt automatique a échoué', coalesce(new.erreur, 'arrêt en erreur'), now(), '/admin/auto/rapport-kills', 'os', null);
      if v_id is not null then
        update public.problemes
           set niveau = 'urgent', niveau_force = true,
               question = 'L''arrêt de ' || v_nom || ' a échoué (' || left(coalesce(new.erreur, 'erreur'), 160) || ') : termine-le à la main.'
         where id = v_id and statut = 'ouvert';
      end if;
    end if;
  exception when others then
    raise warning 'arrets_ferme_problemes : %', sqlerrm;
  end;
  return null;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'support_demandes_ferme_problemes') then
    create trigger support_demandes_ferme_problemes
      after insert or update of statut, action_faite on public.support_demandes
      for each row execute function public.support_demandes_ferme_problemes();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'arrets_ferme_problemes') then
    create trigger arrets_ferme_problemes
      after insert or update of statut, erreur on public.arrets
      for each row execute function public.arrets_ferme_problemes();
  end if;
end $$;

-- 3c. R2 et R3 à l'arrivée : un « mark_read » d'un bot avec son diagnostic, ou un STOP dont l'arrêt est déjà fait,
--     ne restent pas ouverts.
create or replace function public.problemes_ferme_a_l_arrivee()
returns trigger language plpgsql as $$
begin
  if new.statut = 'ouvert' then
    if new.proposition_action = 'mark_read' and coalesce(new.propose_par, 'os') <> 'os' and new.diagnostic is not null then
      new.statut := 'ferme_auto';
      new.ferme_raison := 'Lu (' || new.propose_par || ') : ' || left(new.diagnostic, 240);
      new.ferme_at := now();
    elsif new.categorie in ('stop', 'stop_doute') and new.poster_id is not null
          and exists (select 1 from public.arrets a where a.poster_id = new.poster_id and a.statut = 'fait' and a.annule_at is null) then
      new.statut := 'ferme_auto';
      new.ferme_raison := 'Réglé : arrêt déjà fait (posteur et comptes désactivés).';
      new.ferme_at := now();
    end if;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'problemes_zzz_ferme_a_l_arrivee') then
    create trigger problemes_zzz_ferme_a_l_arrivee
      before insert or update of proposition_action, diagnostic, propose_par on public.problemes
      for each row execute function public.problemes_ferme_a_l_arrivee();
  end if;
end $$;

-- 3d. Les STOP qui arrivent par une carte (bouton « I want to stop », message Upwork) partent au support, qui fait
--     l'arrêt immédiat avec la confirmation ; seulement ceux arrivés après cette migration (l'arriéré attend Max).
insert into public.reglages (cle, valeur) values ('stops_cartes_depuis', to_jsonb(now()))
on conflict (cle) do nothing;

-- 4.
create or replace function public.aujourdhui_details(p_posteurs uuid[], p_demandes uuid[] default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'posteurs', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'nom', coalesce(nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), p.email),
        'email', p.email, 'plateforme', coalesce(p.canal_paie, 'upwork'),
        'handles', (select coalesce(jsonb_agg(distinct c.handle_tiktok) filter (where c.handle_tiktok is not null), '[]'::jsonb)
                      from public.comptes c where c.poster_id = p.id))), '[]'::jsonb)
        from public.profiles p where p.id = any(coalesce(p_posteurs, '{}'))),
    'demandes', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'poster_id', d.poster_id, 'source', d.source, 'categorie', d.categorie, 'plateforme', d.plateforme,
        'cree_at', d.cree_at, 'statut', d.statut, 'texte', left(d.texte, 2000),
        'proposition', coalesce(nullif(d.brouillon, ''), nullif(d.bot_reponse, ''))) order by d.cree_at), '[]'::jsonb)
        from public.support_demandes d
       where d.id = any(coalesce(p_demandes, '{}'))
          or (p_demandes is null and d.poster_id = any(coalesce(p_posteurs, '{}')) and d.statut <> 'resolu')));
end;
$$;
revoke execute on function public.aujourdhui_details(uuid[], uuid[]) from public, anon;
grant execute on function public.aujourdhui_details(uuid[], uuid[]) to authenticated, service_role;
