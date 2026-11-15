-- 0553 : parrainage détecté automatiquement, bonus de 10 $ payé le lundi.
--
-- 1. Le filleul est retrouvé tout seul :
--    a. les déclarations de l'ancien onglet « Refer a friend » (creator_referrals
--       en attente) : le prénom + nom déclaré est rapproché des posteurs arrivés
--       depuis (sans accents ni majuscules, fautes tolérées, même langue) ;
--    b. les messages Upwork, Slack et DM : « referred by X », « my friend X »,
--       « X referred me » (la recrue cite son parrain), « I referred X »,
--       « I recommended X » (le parrain cite son filleul), « X referred Y »
--       (une HM).
--    Un seul candidat sûr : relié automatiquement. Ambigu : une carte
--    « Parrainage à confirmer » dans Weekly decisions (À décider maintenant),
--    un bouton par candidat + « Aucun ».
-- 2. Chaque lundi, le parrain dont le filleul a fait 2 semaines actives (au
--    moins 12 posts avec lien chacune) reçoit une ligne bonus de 10 $ (une
--    seule fois par filleul), payée par la fonction upwork (bonus Upwork,
--    sendCustomPayment) depuis le compte de Max, VIk Studios seulement, et
--    seulement une fois le test du bonus validé par Max. Échec : carte Paie.
-- 3. bonus_parrainage_actif = true ; montant du parrainage = 10 $.
--
-- Additif : une table, des colonnes, des fonctions, un trigger, deux crons ;
-- les déclarations reconnues passent « acceptées » avec leur filleul.

alter table public.bonus add column if not exists upwork_invoice text;
alter table public.bonus add column if not exists erreur text;
alter table public.bonus add column if not exists envoi_at timestamptz;

create table if not exists public.parrainages_detections (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_ref text not null unique,
  referral_id uuid,
  parrain_id uuid,
  recrue_id uuid,
  nom_cite text,
  sens text not null check (sens in ('filleul', 'parrain')),
  extrait text,
  candidats jsonb not null default '[]'::jsonb,
  statut text not null check (statut in ('relie', 'a_confirmer', 'sans_candidat', 'confirme', 'ignore')),
  probleme_id uuid,
  cree_at timestamptz not null default now(),
  maj_at timestamptz not null default now()
);
alter table public.parrainages_detections enable row level security;
revoke all on public.parrainages_detections from anon, authenticated;

-- Un nom sans accents, en minuscules, lettres seulement.
create or replace function public.nom_cle(p text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select regexp_replace(lower(extensions.unaccent(coalesce(p, ''))), '[^a-z]+', '', 'g');
$$;

-- Les posteurs qui peuvent correspondre au nom cité (score 0 à 1).
create or replace function public.parrainage_candidats(
  p_prenom text, p_nom text, p_langue text, p_exclure uuid, p_apres timestamptz, p_avant timestamptz
) returns table(poster_id uuid, nom text, score numeric, meme_langue boolean)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with c as (select public.nom_cle(p_prenom) fp, public.nom_cle(p_nom) fn),
  n as (
    select pr.id, concat_ws(' ', pr.prenom, pr.nom) as nom_aff, public.nom_cle(pr.prenom) pn, public.nom_cle(pr.nom) nn
      from public.profiles pr
     where exists (select 1 from public.user_roles ur where ur.user_id = pr.id and ur.role = 'poster')
       and pr.id is distinct from p_exclure
       and (p_apres is null or pr.created_at >= p_apres)
       and (p_avant is null or pr.created_at <= p_avant)
  ),
  s as (
    select n.id, n.nom_aff,
           case when c.fn <> '' and n.pn = c.fp and n.nn = c.fn then 1.0
                when c.fn <> '' and extensions.levenshtein(n.pn || n.nn, c.fp || c.fn) <= greatest(1, length(c.fp || c.fn) / 8) then 0.92
                when n.pn = c.fp and (c.fn = '' or (length(c.fn) <= 2 and n.nn like c.fn || '%') or extensions.levenshtein(n.nn, c.fn) <= 2) then 0.8
                when n.pn = c.fp then 0.5
                else 0 end::numeric as score,
           (p_langue is not null and exists (select 1 from public.comptes co where co.poster_id = n.id and co.langue = p_langue)) as meme_langue
      from n, c
     where c.fp <> ''
  )
  select s.id, s.nom_aff, s.score, s.meme_langue from s
   where s.score >= 0.8 or (s.score >= 0.5 and s.meme_langue)
   order by s.score desc, s.nom_aff;
$$;

-- La carte « Parrainage à confirmer » (À décider maintenant).
create or replace function public.parrainage_carte(p_detection uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.parrainages_detections;
  v_carte uuid;
  v_qui text;
  v_options jsonb;
begin
  select * into d from public.parrainages_detections where id = p_detection;
  if not found or d.probleme_id is not null then return d.probleme_id; end if;
  v_qui := coalesce((select concat_ws(' ', pr.prenom, pr.nom) from public.profiles pr
                      where pr.id = case when d.sens = 'filleul' then d.parrain_id else d.recrue_id end), '?');
  select coalesce(jsonb_agg(jsonb_build_object('libelle', c->>'nom', 'action', 'parrainage_choisir', 'poster_id', c->>'poster_id')
                            order by (c->>'score')::numeric desc), '[]'::jsonb)
         || jsonb_build_array(jsonb_build_object('libelle', 'Aucun', 'action', 'close'))
    into v_options
    from jsonb_array_elements(d.candidats) c;
  insert into public.problemes (cle_groupe, categorie, niveau, niveau_force, resume, proprietaire, sujet, destinataire, hm_nom,
                                question, options, diagnostic, diagnostic_par, journal)
  values ('parrainage:' || d.id, 'paie', 'urgent', true,
          'Parrainage à confirmer : ' || v_qui || ' · cité « ' || coalesce(d.nom_cite, '?') || ' »',
          'pay_bot', 'hm', 'hm', 'Parrainage à confirmer · ' || v_qui,
          case when d.sens = 'filleul'
               then 'Qui est le filleul de ' || v_qui || ' ? Nom cité : « ' || coalesce(d.nom_cite, '?') || ' ».'
               else 'Qui est le parrain de ' || v_qui || ' ? Nom cité : « ' || coalesce(d.nom_cite, '?') || ' ».' end
            || coalesce(E'\n« ' || left(d.extrait, 300) || ' »', ''),
          v_options,
          'Plusieurs posteurs peuvent correspondre : choisis le bon (10 $ au parrain après 2 semaines actives du filleul).',
          'os',
          jsonb_build_array(jsonb_build_object('at', now(), 'par', 'os', 'action', 'parrainage_a_confirmer', 'detection', d.id)))
  returning id into v_carte;
  update public.parrainages_detections set probleme_id = v_carte, maj_at = now() where id = d.id;
  return v_carte;
end;
$$;

-- Relier un parrain et son filleul (une déclaration existante, sinon une nouvelle ligne).
create or replace function public.parrainage_relier(p_referral uuid, p_parrain uuid, p_recrue uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_referral;
  v_langue text;
begin
  -- Un filleul n'a qu'un parrain.
  if exists (select 1 from public.creator_referrals f where f.recrue_id = p_recrue and f.statut = 'accepte' and f.id is distinct from p_referral) then
    return null;
  end if;
  if v_id is not null then
    update public.creator_referrals
       set recrue_id = p_recrue, statut = 'accepte', decide_at = now(), updated_at = now(),
           note_admin = concat_ws(' · ', nullif(note_admin, ''), p_note)
     where id = v_id;
  else
    select co.langue into v_langue from public.comptes co where co.poster_id = p_recrue order by co.created_at limit 1;
    insert into public.creator_referrals (referrer_id, prenom, nom, pays, confirme_present, confirme_fiable, confirme_majeur,
                                          statut, note_admin, decide_at, recrue_id)
    select p_parrain, coalesce(nullif(btrim(pr.prenom), ''), '?'), pr.nom, coalesce(v_langue, '?'), false, false, false,
           'accepte', p_note, now(), p_recrue
      from public.profiles pr where pr.id = p_recrue
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- La détection (à chaque passage horaire).
create or replace function public.parrainages_detecter()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  f record;
  m record;
  v_cands jsonb;
  v_surs jsonb;
  v_det uuid;
  v_ref uuid;
  v_relies integer := 0;
  v_cartes integer := 0;
  v_nom text;
  v_prenom text;
  v_nomfam text;
  v_auteur_cree timestamptz;
begin
  -- a. Les déclarations « Refer a friend » encore sans filleul.
  for f in
    select fr.* from public.creator_referrals fr
     where fr.statut = 'en_attente' and fr.recrue_id is null
       and not exists (select 1 from public.parrainages_detections d where d.source_ref = 'referral:' || fr.id)
  loop
    select coalesce(jsonb_agg(jsonb_build_object('poster_id', c.poster_id, 'nom', c.nom, 'score', c.score, 'meme_langue', c.meme_langue)), '[]'::jsonb)
      into v_cands
      from public.parrainage_candidats(f.prenom, f.nom, f.pays, f.referrer_id, f.created_at - interval '3 days', null) c
     where not exists (select 1 from public.creator_referrals x where x.recrue_id = c.poster_id and x.statut = 'accepte');
    select coalesce(jsonb_agg(c), '[]'::jsonb) into v_surs from jsonb_array_elements(v_cands) c where (c->>'score')::numeric >= 0.92;
    if jsonb_array_length(v_cands) = 0 then
      -- Pas (encore) recruté : on regardera au prochain passage, sans rien noter.
      continue;
    end if;
    insert into public.parrainages_detections (source, source_ref, referral_id, parrain_id, nom_cite, sens, extrait, candidats, statut)
    values ('declaration', 'referral:' || f.id, f.id, f.referrer_id, btrim(concat_ws(' ', f.prenom, f.nom)), 'filleul',
            'Déclaré dans « Refer a friend » le ' || to_char(f.created_at, 'DD/MM') || ' (' || f.pays || ')', v_cands,
            case when jsonb_array_length(v_surs) = 1 then 'relie' else 'a_confirmer' end)
    returning id into v_det;
    if jsonb_array_length(v_surs) = 1 then
      v_ref := public.parrainage_relier(f.id, f.referrer_id, (v_surs->0->>'poster_id')::uuid, 'auto 6/11 : nom déclaré rapproché');
      update public.parrainages_detections set recrue_id = (v_surs->0->>'poster_id')::uuid, referral_id = coalesce(v_ref, referral_id),
             statut = case when v_ref is null then 'a_confirmer' else 'relie' end where id = v_det;
      if v_ref is not null then v_relies := v_relies + 1; else perform public.parrainage_carte(v_det); v_cartes := v_cartes + 1; end if;
    else
      perform public.parrainage_carte(v_det);
      v_cartes := v_cartes + 1;
    end if;
  end loop;

  -- b. Les messages qui citent un nom (60 derniers jours).
  for m in
    with msgs as (
      select 'upwork:' || um.id as ref, um.poster_id as auteur, um.at, um.texte from public.upwork_messages um
       where um.role = 'posteur' and um.at > now() - interval '60 days'
      union all
      select 'slack:' || sm.canal || ':' || sm.ts, pr.id, sm.at, sm.texte from public.slack_messages sm
        join public.profiles pr on pr.slack_user_id = sm.slack_user
       where sm.at > now() - interval '60 days'
      union all
      select 'dm:' || r.id, r.poster_id, r.recu_at, r.texte from public.posteur_reponses r
       where r.canal in ('slack', 'bouton') and r.recu_at > now() - interval '60 days'
    )
    select msgs.*, x[1] as motcle, x[2] as cite
      from msgs,
           lateral regexp_matches(msgs.texte,
             $re$((?:[Rr]eferred|[Rr]ecommended|[Ii]nvited|[Ss]ent) (?:me )?by|[Mm]y (?:friend|girlfriend|boyfriend|sister|brother|cousin|colleague|wife|husband)|[Ii] (?:have )?(?:referred|recommended|invited))[ ,:]+([A-ZÀ-Ý][a-zà-ÿ'-]+(?: [A-ZÀ-Ý][a-zà-ÿ'-]+)?)$re$, 'g') x
     where msgs.auteur is not null
       and not exists (select 1 from public.parrainages_detections d where d.source_ref = msgs.ref || ':' || x[2])
  loop
    v_nom := m.cite;
    v_prenom := split_part(v_nom, ' ', 1);
    v_nomfam := nullif(split_part(v_nom, ' ', 2), '');
    select pr.created_at into v_auteur_cree from public.profiles pr where pr.id = m.auteur;
    if m.motcle ~* '^i ' or (m.motcle ~* '^my ' and exists (
         -- « my friend X » : X est le filleul si X est arrivé après l'auteur.
         select 1 from public.parrainage_candidats(v_prenom, v_nomfam, null, m.auteur, v_auteur_cree, null) c limit 1)) then
      -- L'auteur est le parrain, le nom cité est le filleul (arrivé après lui).
      select coalesce(jsonb_agg(jsonb_build_object('poster_id', c.poster_id, 'nom', c.nom, 'score', c.score)), '[]'::jsonb) into v_cands
        from public.parrainage_candidats(v_prenom, v_nomfam, null, m.auteur, v_auteur_cree, null) c
       where not exists (select 1 from public.creator_referrals x where x.recrue_id = c.poster_id and x.statut = 'accepte');
      if jsonb_array_length(v_cands) = 0 then continue; end if;
      select coalesce(jsonb_agg(c), '[]'::jsonb) into v_surs from jsonb_array_elements(v_cands) c where (c->>'score')::numeric >= 0.92;
      insert into public.parrainages_detections (source, source_ref, parrain_id, nom_cite, sens, extrait, candidats, statut)
      values (split_part(m.ref, ':', 1), m.ref || ':' || v_nom, m.auteur, v_nom, 'filleul', left(m.texte, 500), v_cands, 'a_confirmer')
      returning id into v_det;
      if jsonb_array_length(v_surs) = 1 then
        v_ref := public.parrainage_relier(null, m.auteur, (v_surs->0->>'poster_id')::uuid, 'auto 6/11 : cité dans un message');
        if v_ref is not null then
          update public.parrainages_detections set statut = 'relie', recrue_id = (v_surs->0->>'poster_id')::uuid, referral_id = v_ref where id = v_det;
          v_relies := v_relies + 1;
          continue;
        end if;
      end if;
      perform public.parrainage_carte(v_det);
      v_cartes := v_cartes + 1;
    else
      -- La recrue cite son parrain (arrivé avant elle).
      if exists (select 1 from public.creator_referrals x where x.recrue_id = m.auteur and x.statut = 'accepte') then continue; end if;
      select coalesce(jsonb_agg(jsonb_build_object('poster_id', c.poster_id, 'nom', c.nom, 'score', c.score)), '[]'::jsonb) into v_cands
        from public.parrainage_candidats(v_prenom, v_nomfam, null, m.auteur, null, v_auteur_cree) c;
      if jsonb_array_length(v_cands) = 0 then continue; end if;
      select coalesce(jsonb_agg(c), '[]'::jsonb) into v_surs from jsonb_array_elements(v_cands) c where (c->>'score')::numeric >= 0.92;
      insert into public.parrainages_detections (source, source_ref, recrue_id, nom_cite, sens, extrait, candidats, statut)
      values (split_part(m.ref, ':', 1), m.ref || ':' || v_nom, m.auteur, v_nom, 'parrain', left(m.texte, 500), v_cands, 'a_confirmer')
      returning id into v_det;
      if jsonb_array_length(v_surs) = 1 then
        v_ref := public.parrainage_relier(null, (v_surs->0->>'poster_id')::uuid, m.auteur, 'auto 6/11 : parrain cité par la recrue');
        if v_ref is not null then
          update public.parrainages_detections set statut = 'relie', parrain_id = (v_surs->0->>'poster_id')::uuid, referral_id = v_ref where id = v_det;
          v_relies := v_relies + 1;
          continue;
        end if;
      end if;
      perform public.parrainage_carte(v_det);
      v_cartes := v_cartes + 1;
    end if;
  end loop;
  return jsonb_build_object('relies', v_relies, 'a_confirmer', v_cartes);
end;
$$;

-- Le choix de Max sur la carte « Parrainage à confirmer ».
create or replace function public.parrainage_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.parrainages_detections;
  o jsonb;
  v_choisi uuid;
  v_ref uuid;
begin
  if new.decision_choisie is null or old.decision_choisie is not distinct from new.decision_choisie then return new; end if;
  if coalesce(new.cle_groupe, '') not like 'parrainage:%' then return new; end if;
  select * into d from public.parrainages_detections where probleme_id = new.id and statut = 'a_confirmer';
  if not found then return new; end if;
  o := new.options -> new.decision_choisie;
  v_choisi := nullif(o->>'poster_id', '')::uuid;
  if v_choisi is null then
    update public.parrainages_detections set statut = 'ignore', maj_at = now() where id = d.id;
    return new;
  end if;
  if d.sens = 'filleul' then
    v_ref := public.parrainage_relier(d.referral_id, d.parrain_id, v_choisi, 'confirmé par Max');
    update public.parrainages_detections set statut = 'confirme', recrue_id = v_choisi, referral_id = coalesce(v_ref, referral_id), maj_at = now() where id = d.id;
  else
    v_ref := public.parrainage_relier(null, v_choisi, d.recrue_id, 'confirmé par Max');
    update public.parrainages_detections set statut = 'confirme', parrain_id = v_choisi, referral_id = v_ref, maj_at = now() where id = d.id;
  end if;
  return new;
end;
$$;

create or replace trigger problemes_parrainage_decision
  after update of decision_choisie on public.problemes
  for each row execute function public.parrainage_decision();

-- Le bonus de la semaine : 10 $ au parrain dont le filleul a fait 2 semaines actives (12 posts avec lien chacune).
create or replace function public.parrainage_bonus_lundi(p_lundi date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lundi date := coalesce(p_lundi, date_trunc('week', (now() at time zone 'Europe/Paris'))::date);
  r jsonb := public.bonus_reglages();
  n integer;
begin
  if not public.bonus_parrainage_actif() or coalesce((r->>'parrainage_montant')::numeric, 0) <= 0 then return 0; end if;
  insert into public.bonus (poster_id, type, referral_id, recrue_id, lundi_bonus, periode_debut, periode_fin, detail, quantite, montant, statut)
  select f.referrer_id, 'parrainage', f.id, f.recrue_id, v_lundi, f.created_at::date, v_lundi - 1,
         format('parrainage de %s, %s semaines actives', coalesce(nullif(btrim(concat_ws(' ', rp.prenom, rp.nom)), ''), 'filleul'), s.n),
         s.n, (r->>'parrainage_montant')::numeric, 'a_payer'
    from public.creator_referrals f
    join public.profiles rp on rp.id = f.recrue_id
    cross join lateral (select public.bonus_semaines_completes(f.recrue_id, v_lundi - 1, coalesce((r->>'parrainage_posts_min_semaine')::int, 12)) as n) s
   where f.statut = 'accepte' and f.recrue_id is not null
     and s.n >= coalesce((r->>'parrainage_semaines_min')::int, 2)
     and not exists (select 1 from public.bonus b where b.referral_id = f.id)
  on conflict (referral_id) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.parrainage_candidats(text, text, text, uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.parrainage_carte(uuid) from public, anon, authenticated;
revoke execute on function public.parrainage_relier(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.parrainages_detecter() from public, anon, authenticated;
revoke execute on function public.parrainage_decision() from public, anon, authenticated;
revoke execute on function public.parrainage_bonus_lundi(date) from public, anon, authenticated;

-- 3. Le montant (10 $) et l'interrupteur.
update public.reglages set valeur = valeur || jsonb_build_object('parrainage_montant', 10) where cle = 'bonus';
update public.reglages set valeur = 'true'::jsonb where cle = 'bonus_parrainage_actif';

-- Les crons : détection toutes les heures ; le lundi 8 h 15 à Paris, la ligne bonus puis le paiement.
select cron.schedule('parrainages-detecter', '23 * * * *', $c$select public.parrainages_detecter()$c$);
select cron.schedule('parrainage-bonus-lundi', '15 7 * * 1', $c$
  select public.parrainage_bonus_lundi();
  select net.http_post(
    url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/upwork',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
    body := jsonb_build_object('action', 'bonus_parrainage_payer'),
    timeout_milliseconds := 120000);
$c$);

-- La reprise : les déclarations passées et les messages, tout de suite.
select public.parrainages_detecter();
