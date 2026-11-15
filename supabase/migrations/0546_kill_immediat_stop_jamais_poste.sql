-- 0546 : un STOP qui n'a JAMAIS posté (0 post avec lien depuis le début) est
-- killé tout de suite, sans attendre samedi : rien à payer.
--
-- Le kill (fonction upwork, action kill_immediat, après le clic de Max) :
--   1. la réponse gentille proposée sur sa carte part si la personne attend
--      toujours une réponse (sinon rien : elle a déjà été envoyée) ;
--   2. compte(s) et profil désactivés, arrêt noté sans message ;
--   3. contrat Upwork fermé depuis le compte de Maximilien Kender (VIk
--      Studios), le milestone financé non payé revient (kill_lot) ;
--   4. si la fermeture échoue : carte Paie pour le Pay Bot (probleme_kill_a_la_main).
-- Les STOP qui ont déjà posté au moins une fois restent en Kill samedi.
--
-- Ajouts seulement : table kills_immediats, fonctions, trigger de la carte.

create table if not exists public.kills_immediats (
  id uuid primary key default gen_random_uuid(),
  contrats jsonb not null,
  statut text not null default 'a_confirmer' check (statut in ('a_confirmer', 'en_cours', 'fait', 'erreur', 'annule')),
  probleme_id uuid,
  resultat jsonb,
  cree_at timestamptz not null default now(),
  cree_par uuid,
  fait_at timestamptz
);
alter table public.kills_immediats enable row level security;
revoke all on public.kills_immediats from anon, authenticated;

-- Le nombre de posts avec lien d'un posteur depuis le début (tous ses comptes, passages et posts).
create or replace function public.posteur_posts_lien_total(p_poster uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*) from public.passages pa join public.comptes c on c.id = pa.compte_id
           where c.poster_id = p_poster and pa.publie_url is not null)::int
       + (select count(*) from public.posts po join public.comptes c on c.id = po.compte_id
           where c.poster_id = p_poster and po.publie_url is not null)::int;
$$;

-- p_lignes : [{poster_id, contrat_id, nom, montant}] — une carte décision [Killer les N maintenant] [Voir le détail].
create or replace function public.kill_immediat_preparer(p_lignes jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  l jsonb;
  v_id uuid;
  v_carte uuid;
  v_n integer := jsonb_array_length(coalesce(p_lignes, '[]'::jsonb));
  v_texte text := '';
  v_total numeric := 0;
  v_sujets jsonb := '[]'::jsonb;
  v_rep text;
begin
  if not public.is_admin() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'kill_immediat_preparer : réservé à l''admin' using errcode = '42501';
  end if;
  if v_n = 0 or v_n > 30 then raise exception '1 à 30 personnes'; end if;
  for l in select value from jsonb_array_elements(p_lignes) loop
    if public.posteur_posts_lien_total((l->>'poster_id')::uuid) > 0 then
      raise exception '% a déjà posté : Kill samedi (on paie d''abord la semaine faite), pas de kill immédiat', l->>'nom';
    end if;
    select regexp_replace(p.proposition_reponse, '\s+', ' ', 'g') into v_rep
      from public.problemes p where p.poster_id = (l->>'poster_id')::uuid and p.statut = 'ouvert'
       and nullif(btrim(coalesce(p.proposition_reponse, '')), '') is not null order by p.created_at limit 1;
    v_total := v_total + coalesce((l->>'montant')::numeric, 0);
    v_texte := v_texte || E'\n• ' || coalesce(l->>'nom', '?') || ' — contrat ' || coalesce(l->>'contrat_id', '?') || ' — '
               || case when coalesce((l->>'montant')::numeric, 0) > 0 then 'à récupérer ' || (l->>'montant') || ' $'
                       else coalesce(l->>'note', 'rien à récupérer') end;
    v_sujets := v_sujets || jsonb_build_array(jsonb_build_object(
      'categorie', 'stop', 'resume', coalesce(l->>'nom', '?') || ' · ' || coalesce(l->>'contrat_id', '?') || ' · ' || coalesce(l->>'montant', '0') || ' $',
      'diagnostic', 'Réponse si elle attend toujours : ' || coalesce(v_rep, '(aucune)')));
  end loop;
  insert into public.kills_immediats (contrats, cree_par) values (p_lignes, auth.uid()) returning id into v_id;
  insert into public.problemes (cle_groupe, categorie, niveau, niveau_force, resume, proprietaire, sujet, destinataire, hm_nom,
                                question, options, diagnostic, diagnostic_par, sujets, journal)
  values ('kill_immediat:' || v_id, 'kill_contrat', 'urgent', true,
          'Kill immédiat : ' || v_n || ' STOP jamais postés', 'pay_bot', 'hm', 'hm',
          'Kill immédiat · ' || v_n || ' STOP jamais postés',
          'Killer maintenant ces ' || v_n || ' STOP qui n''ont jamais posté (rien à payer) : compte désactivé, contrat Upwork fermé '
            || 'depuis le compte Maximilien Kender (VIk Studios), milestone financé récupéré, aucun autre message que la réponse '
            || 'gentille à ceux qui attendent encore une réponse.' || v_texte || E'\n\nTotal à récupérer : ' || v_total || ' $.',
          jsonb_build_array(
            jsonb_build_object('libelle', 'Killer les ' || v_n || ' maintenant', 'action', 'kill_immediat', 'recommande', true),
            jsonb_build_object('libelle', 'Voir le détail', 'action', 'voir_detail')),
          'STOP sans aucun post avec lien : kill tout de suite, rien à payer.', 'os', v_sujets,
          jsonb_build_array(jsonb_build_object('at', now(), 'par', auth.uid(), 'action', 'kill_immediat_prepare', 'lot', v_id)))
  returning id into v_carte;
  update public.kills_immediats set probleme_id = v_carte where id = v_id;
  return v_id;
end;
$$;

-- Le clic : option 0 → la fonction upwork tue le lot ; « Voir le détail » → la carte reste ouverte (le détail est dedans).
create or replace function public.kill_immediat_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k public.kills_immediats;
begin
  if new.decision_choisie is null or old.decision_choisie is not distinct from new.decision_choisie then return new; end if;
  select * into k from public.kills_immediats where probleme_id = new.id and statut = 'a_confirmer';
  if not found then return new; end if;
  if new.decision_choisie = 0 then
    update public.kills_immediats set statut = 'en_cours' where id = k.id;
    perform net.http_post(
      url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/upwork',
      headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
      body := jsonb_build_object('action', 'kill_immediat', 'id', k.id),
      timeout_milliseconds := 280000);
  else
    update public.problemes
       set statut = 'ouvert', decision_choisie = null, decision_at = null, decision_par = null,
           ferme_raison = null, ferme_at = null, ferme_par = null,
           journal = journal || jsonb_build_object('at', now(), 'action', 'voir_detail')
     where id = new.id;
  end if;
  return new;
end;
$$;

create or replace trigger problemes_kill_immediat
  after update of decision_choisie on public.problemes
  for each row execute function public.kill_immediat_decision();

-- Étape 2 (appelée par la fonction upwork) : désactiver, noter l'arrêt sans message, fermer leurs cartes.
create or replace function public.kill_immediat_desactiver(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  k public.kills_immediats;
  l jsonb;
  v_poster uuid;
  n integer := 0;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role') then
    raise exception 'kill_immediat_desactiver : réservé à la fonction upwork' using errcode = '42501';
  end if;
  select * into k from public.kills_immediats where id = p_id and statut = 'en_cours';
  if not found then raise exception 'lot introuvable ou pas confirmé'; end if;
  for l in select value from jsonb_array_elements(k.contrats) loop
    v_poster := (l->>'poster_id')::uuid;
    if public.posteur_posts_lien_total(v_poster) > 0 then continue; end if;
    update public.profiles set is_active = false where id = v_poster and is_active;
    update public.comptes set is_active = false where poster_id = v_poster and is_active;
    if not exists (select 1 from public.arrets a where a.poster_id = v_poster and a.statut in ('a_faire', 'en_cours') and a.annule_at is null) then
      insert into public.arrets (poster_id, source, motif, sans_message)
      values (v_poster, 'manuel', 'Kill immédiat : STOP jamais posté', true);
    end if;
    update public.problemes
       set statut = 'valide', ferme_raison = 'Killé tout de suite : STOP jamais posté (rien à payer)', ferme_at = now(), maj_at = now(),
           journal = journal || jsonb_build_object('at', now(), 'par', 'os', 'action', 'kill_immediat', 'lot', p_id)
     where poster_id = v_poster and statut = 'ouvert';
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.kill_immediat_preparer(jsonb) from public, anon;
grant execute on function public.kill_immediat_preparer(jsonb) to authenticated;
revoke execute on function public.kill_immediat_desactiver(uuid) from public, anon, authenticated;
revoke execute on function public.kill_immediat_decision() from public, anon, authenticated;
revoke execute on function public.posteur_posts_lien_total(uuid) from public, anon, authenticated;
