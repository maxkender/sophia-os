-- 0481 — « OS corrections » (Recruitment Automation) : les erreurs des HM.
--
-- Chaque jour (et sur « Re-scan »), corrections_detecter() relève, sur
-- l'organisation VIk Studios seulement :
--   autre_equipe       offre envoyée depuis une autre équipe que VIk Studios ;
--   annonce_generique  offre depuis une annonce sans pays (générique), ou sans pays du tout ;
--   tarif              milestones non financées hors grille (14 / 10 / 7 $ selon la zone,
--                      force_tarif respecté), dont les anciennes à +1 $ ;
--   jalon_nom          milestone pas « Week n », ou échéance pas un dimanche ;
--   profil_double      2 profils actifs sur un contrat, ou profil en double fusionné cette semaine ;
--   contrat_ferme      contrat fermé par nous sur Upwork, hors de l'OS ;
--   ancien_message     ancien message d'onboarding de la HM après l'acceptation.
-- Une ligne par erreur (cle unique) : jamais rien n'est appliqué ni envoyé sans
-- un clic (Fix / Dismiss, puis « Tell the HM » : un seul DM par erreur).
--
-- Additive : 1 table, 6 fonctions, 1 cron (SQL seul). Aucune donnée existante modifiée
-- (sauf par correction_appliquer_os, sur clic : pays de l'accueil, profil en double désactivé).

create table if not exists public.corrections_hm (
  cle text primary key,
  type text not null,
  hm_id uuid,
  poster_id uuid,
  contrat_id text,
  detail text not null,
  proposition text,
  mode text not null default 'rien' check (mode in ('api', 'os', 'main', 'rien')),
  etapes text,
  donnees jsonb not null default '{}'::jsonb,
  detecte_at timestamptz not null default now(),
  statut text not null default 'ouverte' check (statut in ('ouverte', 'corrigee', 'a_la_main', 'ignoree', 'disparue')),
  fix_at timestamptz,
  fix_par uuid,
  fix_resultat text,
  hm_message_at timestamptz,
  hm_message_par uuid,
  hm_message_texte text,
  hm_message_erreur text
);
alter table public.corrections_hm enable row level security;
create index if not exists corrections_hm_statut on public.corrections_hm (statut, detecte_at);

create or replace function public.corrections_acces()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or coalesce(auth.role(), '') = 'service_role' or session_user in ('postgres', 'supabase_admin')
      or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'head_of_ops');
$$;

create or replace function public.corrections_detecter()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vik text := '2074065383597823773';
  v_equipe text;
  n int := 0;
  m int;
begin
  if not public.corrections_acces() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Le posteur actif et la HM de chaque contrat VIk.
  create temp table if not exists _c (contrat_id text primary key, poster_id uuid, hm_id uuid, pays text, debut_at timestamptz) on commit drop;
  truncate _c;
  insert into _c
  select u.contrat_id,
         (select pr.id from profiles pr where pr.is_active and pr.upwork_contract_id = u.contrat_id order by pr.created_at limit 1),
         null, null, u.debut_at
    from upwork_contrats u
   where u.organisation_id = v_vik and u.actif and u.contrat_id is not null
  on conflict do nothing;
  update _c set hm_id = coalesce(
      (select pr.manager_id from profiles pr where pr.id = _c.poster_id),
      (select a.hm_id from accueils a where a.contrat_id = _c.contrat_id),
      (select h.hm_id from accueils a join hm_upwork h on h.upwork_id = a.hm_upwork_id where a.contrat_id = _c.contrat_id)),
    pays = coalesce(
      (select a.pays from accueils a where a.contrat_id = _c.contrat_id),
      (select c.pays from comptes c where c.poster_id = _c.poster_id and c.is_active and c.pays is not null order by c.created_at limit 1));

  -- 1. Offre envoyée depuis une autre équipe (l'équipe principale = la plus fréquente).
  select u.equipe_id into v_equipe from upwork_contrats u where u.organisation_id = v_vik and u.equipe_id is not null
   group by 1 order by count(*) desc limit 1;
  insert into corrections_hm (cle, type, hm_id, poster_id, contrat_id, detail, proposition, mode, etapes)
  select 'autre_equipe:' || u.contrat_id, 'autre_equipe', c.hm_id, c.poster_id, u.contrat_id,
         format('The offer was sent from the team « %s » instead of VIk Studios.', btrim(coalesce(u.equipe_nom, '?'))),
         'Send a new offer from the VIk Studios job post of the country.', 'main',
         '1. Send a new offer to the same freelancer from the VIk Studios job post of their country, at the grid rate. 2. Once accepted, the OS links the new contract. 3. Do not end the old contract before the new one is accepted (Lucia ends it).'
    from upwork_contrats u join _c c on c.contrat_id = u.contrat_id
   where u.organisation_id = v_vik and u.actif and v_equipe is not null and u.equipe_id is distinct from v_equipe
     and u.debut_at > now() - interval '30 days'
  on conflict (cle) do nothing;
  get diagnostics m = row_count; n := n + m;

  -- 2. Annonce générique (sans pays) ou sans pays du tout (recrues des 3 dernières semaines).
  insert into corrections_hm (cle, type, hm_id, poster_id, contrat_id, detail, proposition, mode, etapes, donnees)
  select 'annonce_generique:' || a.contrat_id, 'annonce_generique',
         coalesce(a.hm_id, (select h.hm_id from hm_upwork h where h.upwork_id = a.hm_upwork_id)), a.poster_id, a.contrat_id,
         case when a.pays is null
              then format('Offer from a job post with no country (« %s »), and the country is still unknown.', left(coalesce(a.job_titre, '?'), 80))
              else format('Offer from a generic job post with no country (« %s »): the OS took %s from the freelancer.', left(coalesce(a.job_titre, '?'), 80), a.pays) end,
         case when a.pays is null and a.freelance_pays is not null then format('Set the country to %s (where the freelancer lives).', a.freelance_pays)
              when a.pays is null then 'Set the country on the « Contract to link » card.'
              else 'Nothing to change: the country is already set.' end,
         case when a.pays is null and a.freelance_pays is not null then 'os' when a.pays is null then 'main' else 'rien' end,
         case when a.pays is null and a.freelance_pays is null then '1. Open Needs you → « Contract to link ». 2. Pick the country with the HM. 3. Create the poster.' end,
         jsonb_build_object('pays', a.freelance_pays)
    from accueils a
   where coalesce(a.organisation_id, v_vik) = v_vik
     and a.created_at > now() - interval '21 days'
     and a.statut <> 'doublon'
     and (a.pays is null or a.pays_source in ('freelance'))
  on conflict (cle) do nothing;
  get diagnostics m = row_count; n := n + m;

  -- 3. Tarif hors grille : milestones non financées dont le montant n'est pas le tarif attendu.
  insert into corrections_hm (cle, type, hm_id, poster_id, contrat_id, detail, proposition, mode, donnees)
  select 'tarif:' || x.contrat_id || ':' || x.ids, 'tarif', x.hm_id, x.poster_id, x.contrat_id,
         format('%s unfunded milestone(s) at %s instead of $%s%s%s.', x.nb, x.montants, x.attendu,
                case when x.zone is not null then format(' (zone %s)', x.zone) else '' end,
                case when x.plus_un then ', old +$1 first-week milestone' else '' end),
         format('Set them to $%s through the API (nothing is funded).', x.attendu), 'api',
         jsonb_build_object('attendu', x.attendu, 'jalons', x.jalons)
    from (
      select c.contrat_id, c.poster_id, c.hm_id, t.attendu, t.zone,
             count(*) as nb,
             string_agg(distinct '$' || (j->>'depot'), ' / ') as montants,
             bool_or((j->>'depot')::numeric = t.attendu + 1) as plus_un,
             string_agg(j->>'id', ',' order by j->>'id') as ids,
             jsonb_agg(jsonb_build_object('id', j->>'id', 'nom', j->>'nom', 'depot', (j->>'depot')::numeric)) as jalons
        from _c c
        join upwork_jalons uj on uj.contrat_id = c.contrat_id
        cross join lateral (
          select coalesce(ct.force_tarif, zp.tarif) as attendu, zpp.zone
            from (select 1) one
            left join contrats_tarifs ct on ct.contrat_id = c.contrat_id
            left join zones_paie_pays zpp on zpp.pays = c.pays
            left join zones_paie zp on zp.zone = zpp.zone
           where coalesce(ct.rythme, 'hebdo') = 'hebdo'
        ) t
        cross join lateral jsonb_array_elements(case when jsonb_typeof(uj.jalons) = 'array' then uj.jalons else '[]'::jsonb end) j
       where c.poster_id is not null and t.attendu is not null
         and j->>'etat' = 'NotFunded' and (j->>'depot') ~ '^[0-9.]+$' and (j->>'depot')::numeric <> t.attendu
       group by c.contrat_id, c.poster_id, c.hm_id, t.attendu, t.zone
    ) x
  on conflict (cle) do nothing;
  get diagnostics m = row_count; n := n + m;

  -- 4. Milestone mal nommée (pas « Week n ») ou échéance pas un dimanche (non payées).
  insert into corrections_hm (cle, type, hm_id, poster_id, contrat_id, detail, proposition, mode, donnees)
  select 'jalon_nom:' || x.contrat_id || ':' || x.ids, 'jalon_nom', x.hm_id, x.poster_id, x.contrat_id,
         format('%s milestone(s) not named « Week n » or not due on a Sunday: %s.', x.nb, x.noms),
         case when x.tous_n then 'Rename to « Week n » and set the due date to the Sunday of that week, through the API.'
              else 'Rename by hand: the week number cannot be read.' end,
         case when x.tous_n then 'api' else 'main' end,
         jsonb_build_object('jalons', x.jalons)
    from (
      select c.contrat_id, c.poster_id, c.hm_id, count(*) as nb,
             string_agg('« ' || left(j->>'nom', 60) || ' »', ', ') as noms,
             string_agg(j->>'id', ',' order by j->>'id') as ids,
             bool_and(w.n is not null) as tous_n,
             jsonb_agg(jsonb_build_object('id', j->>'id', 'nom', j->>'nom', 'semaine', w.n, 'echeance', j->>'echeance')) as jalons
        from _c c
        join upwork_jalons uj on uj.contrat_id = c.contrat_id
        cross join lateral jsonb_array_elements(case when jsonb_typeof(uj.jalons) = 'array' then uj.jalons else '[]'::jsonb end) j
        cross join lateral (
          select coalesce((substring(j->>'nom' from '(?i)week\s*([0-9]{1,2})'))::int,
                          case when (j->>'echeance') is not null then extract(week from (j->>'echeance')::timestamptz)::int end) as n
        ) w
       where c.poster_id is not null
         and j->>'etat' in ('NotFunded', 'Active')
         and (coalesce(j->>'nom', '') !~ '^Week [0-9]{1,2}$'
              or (j->>'echeance') is null
              or extract(isodow from ((j->>'echeance')::timestamptz at time zone 'UTC')) <> 7)
       group by c.contrat_id, c.poster_id, c.hm_id
    ) x
  on conflict (cle) do nothing;
  get diagnostics m = row_count; n := n + m;

  -- 5a. Deux profils actifs sur un contrat.
  insert into corrections_hm (cle, type, hm_id, poster_id, contrat_id, detail, proposition, mode, donnees)
  select 'profil_double:' || p.upwork_contract_id || ':' || string_agg(p.id::text, ',' order by p.created_at),
         'profil_double', (array_agg(p.manager_id order by p.created_at))[1], (array_agg(p.id order by p.created_at))[1], p.upwork_contract_id,
         format('%s active profiles on the same contract: %s.', count(*), string_agg(coalesce(p.email, '?'), ', ' order by p.created_at)),
         'Keep the first profile, deactivate the others (only if they have no post).', 'os',
         jsonb_build_object('profils', jsonb_agg(p.id order by p.created_at))
    from profiles p
   where p.is_active and p.upwork_contract_id is not null
     and exists (select 1 from user_roles ur where ur.user_id = p.id and ur.role = 'poster')
   group by p.upwork_contract_id
  having count(*) > 1
  on conflict (cle) do nothing;
  get diagnostics m = row_count; n := n + m;

  -- 5b. Profil en double déjà fusionné cette semaine (à dire à la HM).
  insert into corrections_hm (cle, type, hm_id, poster_id, contrat_id, detail, proposition, mode, statut, fix_at, fix_resultat)
  select 'profil_double:fusion:' || e.poster_id, 'profil_double',
         (select pr.manager_id from profiles pr where pr.id = e.poster_id), e.poster_id,
         (select pr2.upwork_contract_id from profiles pr2 where pr2.id::text = e.cle),
         'A second profile was created for the same poster: ' || coalesce((select pr.email from profiles pr where pr.id = e.poster_id), '?') || '.',
         'Already merged by the OS.', 'rien', 'corrigee', e.at,
         'Merged on ' || to_char(e.at at time zone 'Europe/Paris', 'DD/MM HH24:MI')
    from recrue_evenements e
   where e.type = 'profil_fusionne' and e.detail like 'Duplicate of%' and e.at > now() - interval '7 days'
  on conflict (cle) do nothing;
  get diagnostics m = row_count; n := n + m;

  -- 6. Contrat fermé par nous sur Upwork, hors de l'OS.
  insert into corrections_hm (cle, type, hm_id, poster_id, contrat_id, detail, proposition, mode)
  select 'contrat_ferme:' || a.id, 'contrat_ferme',
         (select pr.manager_id from profiles pr where pr.id = a.poster_id), a.poster_id,
         (select pr.upwork_contract_id from profiles pr where pr.id = a.poster_id),
         a.motif || ': the OS was not used (Kill on Saturday, or ask Lucia).',
         'Nothing to change: the OS already stopped the poster and took them out of the payroll.', 'rien'
    from arrets a
   where a.motif like 'Contract ended by us%' and a.created_at > now() - interval '14 days'
  on conflict (cle) do nothing;
  get diagnostics m = row_count; n := n + m;

  -- 7. Ancien message d'onboarding de la HM après l'acceptation (pas un texte de l'OS).
  insert into corrections_hm (cle, type, hm_id, poster_id, contrat_id, detail, proposition, mode, donnees)
  select 'ancien_message:' || x.contrat_id || ':' || x.mid, 'ancien_message', c.hm_id, coalesce(c.poster_id, x.poster_id), x.contrat_id,
         format('Sent the old onboarding message after the offer was accepted (%s): « %s… »',
                to_char(x.quand at time zone 'Europe/Paris', 'DD/MM HH24:MI'), left(regexp_replace(x.texte, '\s+', ' ', 'g'), 120)),
         'Nothing to change: the OS sends the welcome (login, password, Slack link).', 'rien',
         jsonb_build_object('message', left(x.texte, 600))
    from (
      select s.contrat_id, s.poster_id, m->>'id' as mid, (m->>'at')::timestamptz as quand, m->>'texte' as texte
        from upwork_salons s
        cross join lateral jsonb_array_elements(case when jsonb_typeof(s.messages) = 'array' then s.messages else '[]'::jsonb end) m
       where m->>'de' = 'nous' and (m->>'at')::timestamptz > now() - interval '14 days'
         and (m->>'texte') ~* '(thanks for signing the contract|everything happens on slack|join\.slack\.com|join with your full real name|message me on slack|@sophia\.com|password)'
         and (m->>'texte') !~* '^\s*(hi [^,]{1,40}, welcome to vik studios|your password is)'
    ) x
    join _c c on c.contrat_id = x.contrat_id
   where x.quand > coalesce(c.debut_at, '-infinity'::timestamptz)
     and not exists (select 1 from nudges nd where nd.poster_id = c.poster_id and left(nd.texte, 60) = left(x.texte, 60))
     and not exists (select 1 from relances_prevues rp where rp.poster_id = c.poster_id and left(rp.texte, 60) = left(x.texte, 60))
     and not exists (select 1 from accueils ac where ac.contrat_id = x.contrat_id and left(ac.message_texte, 60) = left(x.texte, 60))
  on conflict (cle) do nothing;
  get diagnostics m = row_count; n := n + m;

  -- Ce qui n'est plus vrai disparaît de la liste (milestones corrigées ailleurs, doublon réglé…).
  update corrections_hm h set statut = 'disparue'
   where h.statut = 'ouverte'
     and ((h.type = 'profil_double' and h.mode = 'os'
           and (select count(*) from profiles p where p.is_active and p.upwork_contract_id = h.contrat_id) < 2)
       or (h.type in ('tarif', 'jalon_nom') and not exists (
             select 1 from upwork_jalons uj
              cross join lateral jsonb_array_elements(case when jsonb_typeof(uj.jalons) = 'array' then uj.jalons else '[]'::jsonb end) j
              where uj.contrat_id = h.contrat_id
                and j->>'id' in (select jsonb_array_elements(h.donnees->'jalons')->>'id')
                and (h.type <> 'tarif' or ((j->>'etat') = 'NotFunded' and (j->>'depot')::numeric <> (h.donnees->>'attendu')::numeric))
                and (h.type <> 'jalon_nom' or coalesce(j->>'nom', '') !~ '^Week [0-9]{1,2}$'
                     or (j->>'echeance') is null or extract(isodow from ((j->>'echeance')::timestamptz at time zone 'UTC')) <> 7))));
  return n;
end;
$$;
revoke all on function public.corrections_detecter() from public, anon;
grant execute on function public.corrections_detecter() to authenticated, service_role;

create or replace function public.corrections_liste()
returns table (cle text, type text, hm_id uuid, hm_nom text, hm_slack boolean, poster_id uuid, poster_nom text, contrat_id text,
               detail text, proposition text, mode text, etapes text, donnees jsonb, detecte_at timestamptz, statut text,
               fix_at timestamptz, fix_par_nom text, fix_resultat text, hm_message_at timestamptz, hm_message_erreur text,
               conversation_url text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.corrections_acces() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select h.cle, h.type, h.hm_id,
         (select nullif(btrim(concat_ws(' ', m.prenom, m.nom)), '') from profiles m where m.id = h.hm_id),
         exists (select 1 from hm_slack hs where hs.profile_id = h.hm_id),
         h.poster_id,
         (select nullif(btrim(concat_ws(' ', p.prenom, p.nom)), '') from profiles p where p.id = h.poster_id),
         h.contrat_id, h.detail, h.proposition, h.mode, h.etapes, h.donnees, h.detecte_at, h.statut, h.fix_at,
         (select nullif(btrim(concat_ws(' ', f.prenom, f.nom)), '') from profiles f where f.id = h.fix_par),
         h.fix_resultat, h.hm_message_at, h.hm_message_erreur,
         (select 'https://www.upwork.com/ab/messages/rooms/' || s.room_id from upwork_salons s where s.contrat_id = h.contrat_id and s.room_id is not null limit 1)
    from corrections_hm h
   where h.statut in ('ouverte', 'a_la_main')
      or (h.statut in ('corrigee', 'ignoree') and (h.hm_message_at is null or h.fix_at > now() - interval '2 days'))
   order by case h.statut when 'ouverte' then 0 when 'a_la_main' then 1 else 2 end, h.detecte_at desc;
end;
$$;
revoke all on function public.corrections_liste() from public, anon;
grant execute on function public.corrections_liste() to authenticated;

-- Score de la semaine : erreurs détectées depuis lundi (Paris), par HM et par type (hors « disparue »).
create or replace function public.corrections_score()
returns table (hm_id uuid, hm_nom text, type text, n int)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.corrections_acces() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select h.hm_id, coalesce((select nullif(btrim(concat_ws(' ', m.prenom, m.nom)), '') from profiles m where m.id = h.hm_id), '?'),
         h.type, count(*)::int
    from corrections_hm h
   where h.statut <> 'disparue'
     and h.detecte_at >= (date_trunc('week', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')
   group by 1, 2, 3
   order by 2, 3;
end;
$$;
revoke all on function public.corrections_score() from public, anon;
grant execute on function public.corrections_score() to authenticated;

-- Dismiss, ou la fin d'un Fix (appelée par la fonction upwork après l'API).
create or replace function public.correction_noter(p_cle text, p_statut text, p_resultat text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.corrections_acces() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_statut not in ('corrigee', 'a_la_main', 'ignoree') then
    raise exception 'statut inconnu';
  end if;
  update corrections_hm set statut = p_statut, fix_at = now(), fix_par = coalesce(auth.uid(), fix_par),
         fix_resultat = nullif(btrim(coalesce(p_resultat, '')), '')
   where cle = p_cle;
end;
$$;
revoke all on function public.correction_noter(text, text, text) from public, anon;
grant execute on function public.correction_noter(text, text, text) to authenticated, service_role;

-- Les corrections faites dans l'OS (sans Upwork) : pays de l'accueil, profil en double, ou rien à changer.
create or replace function public.correction_appliquer_os(p_cle text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  h corrections_hm;
  v_garde uuid;
  v_autre uuid;
  v_res text := '';
begin
  if not public.corrections_acces() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into h from corrections_hm where cle = p_cle for update;
  if h.cle is null then raise exception 'correction introuvable'; end if;
  if h.statut <> 'ouverte' then return 'déjà traitée'; end if;

  if h.mode = 'rien' then
    v_res := coalesce(h.proposition, 'Nothing to change.');
  elsif h.type = 'annonce_generique' and h.mode = 'os' then
    update accueils set pays = h.donnees->>'pays', pays_source = 'freelance', updated_at = now()
     where contrat_id = h.contrat_id and pays is null;
    v_res := 'Country set to ' || (h.donnees->>'pays') || '.';
  elsif h.type = 'profil_double' and h.mode = 'os' then
    v_garde := (h.donnees->'profils'->>0)::uuid;
    for v_autre in select (x)::uuid from jsonb_array_elements_text(h.donnees->'profils') x offset 1 loop
      if exists (select 1 from passages pa join comptes c on c.id = pa.compte_id
                  where c.poster_id = v_autre and pa.publie_url is not null) then
        update corrections_hm set statut = 'a_la_main', fix_at = now(), fix_par = auth.uid(),
               etapes = '1. The other profile already has posts: compare both profiles. 2. Keep the one that posts, deactivate the other in Posters.',
               fix_resultat = 'Not merged: both profiles have posts.'
         where cle = p_cle;
        return 'à la main : les deux profils ont des posts';
      end if;
      update comptes set is_active = false where poster_id = v_autre and is_active;
      update relances_prevues set statut = 'ecarte', raison = 'profil_doublon', maj_at = now() where poster_id = v_autre and statut in ('prevu', 'main');
      update profiles set is_active = false, upwork_contract_id = null, upwork_contrat_url = null where id = v_autre;
      insert into recrue_evenements (poster_id, cle, type, at, detail)
      values (v_autre, v_garde::text, 'profil_fusionne', now(), 'Duplicate of ' || v_garde || ' (OS corrections): deactivated');
    end loop;
    v_res := 'Kept the first profile, deactivated the others.';
  else
    raise exception 'cette correction passe par l''API (Fix)';
  end if;
  update corrections_hm set statut = 'corrigee', fix_at = now(), fix_par = auth.uid(), fix_resultat = v_res where cle = p_cle;
  return v_res;
end;
$$;
revoke all on function public.correction_appliquer_os(text) from public, anon;
grant execute on function public.correction_appliquer_os(text) to authenticated;

-- « Tell the HM » : le DM noté (envoyé par la fonction ckd), un seul par erreur.
create or replace function public.correction_message_noter(p_cle text, p_texte text, p_erreur text, p_par uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update corrections_hm set hm_message_at = case when p_erreur is null then now() else hm_message_at end,
         hm_message_texte = p_texte, hm_message_erreur = p_erreur, hm_message_par = p_par
   where cle = p_cle;
$$;
revoke all on function public.correction_message_noter(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.correction_message_noter(text, text, text, uuid) to service_role;

do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'corrections-detecter') then
    perform cron.schedule('corrections-detecter', '17 5 * * *', 'select public.corrections_detecter()');
  end if;
end;
$c$;

notify pgrst, 'reload schema';
