-- 0698 (Réparer Ruul, point 4) : le bot règle seul les problèmes Ruul simples, et la vérification
-- d'identité Ruul arrive par l'import de Ruul Bot. Additif : 6 colonnes, 3 fonctions nouvelles,
-- 2 fonctions redéfinies (mêmes signatures). Le bot ne touche jamais au montant, à la zone, à la paie
-- ni à la date de début.

alter table public.profiles add column if not exists ruul_email_historique jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists ruul_etiquette text;
alter table public.profiles add column if not exists ruul_renvois integer not null default 0;
alter table public.profiles add column if not exists ruul_identite text;
alter table public.profiles add column if not exists ruul_identite_refus integer not null default 0;
alter table public.profiles add column if not exists ruul_identite_at timestamptz;

/*
 * Nouvelle adresse Ruul (Help ou message privé) : valide, pas déjà prise par une autre fiche ; l'ancienne
 * va dans l'historique ; la fiche passe « à réinviter » (étiquette « nouvelle adresse »). Serveur seulement.
 * Rend { ok, texte } ; texte = ce qui est noté sur la fiche (« fait par le bot »).
 */
create or replace function public.ruul_bot_nouvelle_adresse(p_poster uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_ancien text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('ok', false, 'raison', 'invalide');
  end if;
  if exists (select 1 from public.profiles q where q.id <> p_poster and lower(btrim(q.ruul_email)) = v_email) then
    return jsonb_build_object('ok', false, 'raison', 'deja_prise');
  end if;
  select ruul_email into v_ancien from public.profiles where id = p_poster and canal_paie = 'ruul';
  if not found then return jsonb_build_object('ok', false, 'raison', 'pas_ruul'); end if;
  if lower(btrim(coalesce(v_ancien, ''))) = v_email then return jsonb_build_object('ok', false, 'raison', 'meme_adresse'); end if;
  update public.profiles
     set ruul_email_historique = ruul_email_historique || jsonb_build_object('email', v_ancien, 'jusqu_au', now(), 'par', 'bot'),
         ruul_email = v_email, ruul_compte = null, ruul_ajoute_at = null, ruul_email_a_at = null, ruul_email_b_at = null,
         ruul_statut = case when ruul_statut in ('pret', 'paye_1x') then ruul_statut else 'a_ajouter' end,
         ruul_etiquette = 'nouvelle adresse'
   where id = p_poster;
  perform public.recrue_evenement_noter(p_poster, null, 'ruul_bot', now(),
    'Fait par le bot : adresse Ruul changée (' || coalesce(v_ancien, '?') || ' → ' || v_email || '), à réinviter', 'ruul_bot_adresse:' || v_email);
  return jsonb_build_object('ok', true, 'texte', 'adresse Ruul changée : ' || coalesce(v_ancien, '?') || ' → ' || v_email || ' ; à réinviter');
end;
$$;
revoke execute on function public.ruul_bot_nouvelle_adresse(uuid, text) from public, anon, authenticated;

/*
 * « Je n'ai pas reçu l'invitation Ruul » : moins de 24 h → regarder les spams ; plus de 24 h → à réinviter
 * (étiquette « renvoyer l'invitation »), 2 renvois au plus ; ensuite Adrien. Serveur seulement.
 * Rend { ok, cas: spam | reinvite | adrien | pas_invite, adresse }.
 */
create or replace function public.ruul_bot_invitation(p_poster uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  select id, ruul_email, ruul_ajoute_at, ruul_renvois, ruul_statut into p from public.profiles where id = p_poster and canal_paie = 'ruul';
  if not found then return jsonb_build_object('ok', false, 'cas', 'pas_ruul'); end if;
  if p.ruul_statut in ('pret', 'paye_1x') then return jsonb_build_object('ok', true, 'cas', 'deja_pret', 'adresse', p.ruul_email); end if;
  if p.ruul_ajoute_at is null then return jsonb_build_object('ok', true, 'cas', 'pas_invite', 'adresse', p.ruul_email); end if;
  if p.ruul_ajoute_at > now() - interval '24 hours' then return jsonb_build_object('ok', true, 'cas', 'spam', 'adresse', p.ruul_email); end if;
  if p.ruul_renvois >= 2 then return jsonb_build_object('ok', true, 'cas', 'adrien', 'adresse', p.ruul_email); end if;
  update public.profiles
     set ruul_renvois = ruul_renvois + 1, ruul_ajoute_at = null, ruul_compte = null, ruul_statut = 'a_ajouter',
         ruul_etiquette = 'renvoyer l''invitation'
   where id = p_poster;
  perform public.recrue_evenement_noter(p_poster, null, 'ruul_bot', now(),
    'Fait par le bot : invitation Ruul pas reçue, à réinviter (renvoi ' || (p.ruul_renvois + 1) || '/2)', 'ruul_bot_renvoi:' || (p.ruul_renvois + 1));
  return jsonb_build_object('ok', true, 'cas', 'reinvite', 'adresse', p.ruul_email, 'renvoi', p.ruul_renvois + 1);
end;
$$;
revoke execute on function public.ruul_bot_invitation(uuid) from public, anon, authenticated;

/* La vérification d'identité Ruul de chaque posteur actif (lue par le moteur du parcours). */
create or replace function public.ruul_parcours_identite()
returns table (poster_id uuid, identite text, refus integer)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.ruul_identite, p.ruul_identite_refus from public.profiles p
   where p.canal_paie = 'ruul' and p.is_active and p.ruul_identite is not null;
$$;
revoke execute on function public.ruul_parcours_identite() from public, anon, authenticated;
grant execute on function public.ruul_parcours_identite() to service_role;

/*
 * L'import de Ruul Bot lit aussi la vérification d'identité (facultative sur chaque ligne) :
 * « email ; Active ; Approved », « email ; Invited ; Not started », … (Not started / Pending / Approved / Declined).
 * Un nouveau « Declined » compte un refus (le 1er : email pour refaire ; le 2e : fin de collaboration).
 */
create or replace function public.ruul_agent_importer_statuts(p_texte text, p_simuler boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lignes jsonb := '[]'::jsonb;
  v_ligne text;
  v_email text;
  v_statut text;
  v_identite text;
  v_illisibles jsonb := '[]'::jsonb;
  v_res jsonb;
begin
  if not public.is_admin() then raise exception 'réservé à l''admin' using errcode = '42501'; end if;
  foreach v_ligne in array regexp_split_to_array(coalesce(p_texte, ''), '\r?\n') loop
    continue when btrim(v_ligne) = '';
    v_email := lower((regexp_match(v_ligne, '([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})'))[1]);
    v_statut := case when v_ligne ~* '\mactive\M' then 'active' when v_ligne ~* '\minvited\M' then 'invited' end;
    v_identite := case when v_ligne ~* '\mnot\s+started\M' then 'not_started' when v_ligne ~* '\mpending\M' then 'pending'
                       when v_ligne ~* '\mapproved\M' then 'approved' when v_ligne ~* '\mdeclined\M' then 'declined' end;
    if v_email is null or v_statut is null then
      v_illisibles := v_illisibles || to_jsonb(btrim(v_ligne));
    else
      v_lignes := v_lignes || jsonb_build_object('email', v_email, 'statut', v_statut, 'identite', v_identite);
    end if;
  end loop;
  if jsonb_array_length(v_lignes) = 0 then raise exception 'aucune ligne « email ; Active » ou « email ; Invited » lisible'; end if;

  with l as (
    select distinct on (x->>'email') x->>'email' email, x->>'statut' statut, x->>'identite' identite
      from jsonb_array_elements(v_lignes) x
  ), m as (
    select l.email, l.statut, l.identite, p.id, p.ruul_compte, p.ruul_statut, p.ruul_email_a_at, p.ruul_email_b_at, p.ruul_identite
      from l left join public.profiles p on p.canal_paie = 'ruul' and lower(btrim(p.ruul_email)) = l.email
  )
  select jsonb_build_object(
    'lignes', (select count(*) from m),
    'trouves', (select count(*) from m where id is not null),
    'changes', (select count(*) from m where id is not null and ruul_compte is distinct from statut),
    'a_envoyer_a', (select count(*) from m where id is not null and statut = 'invited' and ruul_compte is distinct from 'active'
                      and ruul_email_a_at is null and coalesce(ruul_statut, '') not in ('pret', 'paye_1x')),
    'a_envoyer_b', (select count(*) from m where id is not null and statut = 'active'
                      and ruul_email_b_at is null and coalesce(ruul_statut, '') not in ('pret', 'paye_1x')),
    'nouveaux_invited', (select count(*) from m where id is not null and statut = 'invited' and ruul_compte is distinct from 'invited'),
    'nouveaux_active', (select count(*) from m where id is not null and statut = 'active' and ruul_compte is distinct from 'active'),
    'identite_lue', (select count(*) from m where id is not null and identite is not null),
    'nouveaux_refus', (select count(*) from m where id is not null and identite = 'declined' and ruul_identite is distinct from 'declined'),
    'introuvables', (select coalesce(jsonb_agg(email), '[]'::jsonb) from m where id is null),
    'illisibles', v_illisibles)
    into v_res;

  if coalesce(p_simuler, false) then return v_res || jsonb_build_object('simulation', true); end if;

  with l as (
    select distinct on (x->>'email') x->>'email' email, x->>'statut' statut, x->>'identite' identite from jsonb_array_elements(v_lignes) x
  )
  update public.profiles p
     set ruul_compte_at = case when p.ruul_compte is distinct from l.statut then now() else p.ruul_compte_at end,
         ruul_compte = l.statut,
         ruul_compte_vu_at = now(),
         ruul_ajoute_at = coalesce(p.ruul_ajoute_at, now()),
         ruul_statut = case when p.ruul_statut in ('pret', 'paye_1x', 'invite') then p.ruul_statut else 'invite' end,
         ruul_etiquette = null,
         ruul_identite_refus = p.ruul_identite_refus
           + case when l.identite = 'declined' and p.ruul_identite is distinct from 'declined' then 1 else 0 end,
         ruul_identite_at = case when l.identite is not null and p.ruul_identite is distinct from l.identite then now() else p.ruul_identite_at end,
         ruul_identite = coalesce(l.identite, p.ruul_identite)
    from l
   where p.canal_paie = 'ruul' and lower(btrim(p.ruul_email)) = l.email;

  insert into public.ruul_imports (type, par, lignes, appliques, nouveaux_invited, nouveaux_active, introuvables, detail)
  values ('statuts', auth.uid(), (v_res->>'lignes')::int, (v_res->>'trouves')::int, (v_res->>'nouveaux_invited')::int,
          (v_res->>'nouveaux_active')::int, v_res->'introuvables', v_res);
  return v_res;
end;
$$;

/* « À inviter dans Ruul » : nom, email, pays (candidature signée), étiquette (nouvelle adresse / renvoyer l'invitation). */
create or replace function public.ruul_agent_a_inviter()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('poster_id', x.id, 'nom', x.nom, 'email_ruul', x.ruul_email, 'pays', x.pays, 'etiquette', x.ruul_etiquette) order by x.nom), '[]'::jsonb)
    from (
      select p.id, btrim(concat_ws(' ', p.prenom, p.nom)) nom, lower(btrim(p.ruul_email)) ruul_email, public.ruul_pays_posteur(p.id) pays, p.ruul_etiquette
        from public.profiles p
       where p.canal_paie = 'ruul' and p.is_active and p.ruul_ajoute_at is null
         and nullif(btrim(coalesce(p.ruul_email, '')), '') is not null
         and p.ruul_ne_pas_inviter is null
    ) x
   where public.is_admin()
     and not exists (select 1 from public.parrainage_pays pp where pp.pays = x.pays and not pp.recrutement_ouvert);
$$;
