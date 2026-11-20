-- 0802 : paie automatique, partie 1 (Max, 21/11). Additif.
-- 1. Le doublement du jeudi passe par l'accord du posteur : le OUI de Max envoie une proposition (Upwork : message dans
--    la conversation du contrat ; Ruul : email + bandeau), le posteur accepte (dashboard, ou « yes » sur Upwork / par
--    email) avant dimanche 23:59 (Paris). Sinon la proposition expire et rien ne change.
--    Un 2e compte déjà créé dont le warm-up est lancé vaut accord (les doublements créés avant cette règle).
-- 2. Paie : un 2e compte du jeudi compte pour 2 dès le lundi qui suit l'accord (et plus dès la création).
-- 3. Le message de démarrage (« From Monday … you manage 2 accounts … »), une fois, le lundi du démarrage.
-- 4. Plafond : 60 $ par posteur et par ligne de paie (au-delà : à vérifier), Upwork et Ruul.

-- 1.
alter table public.doubles_jeudi add column if not exists reponse text;
alter table public.doubles_jeudi add column if not exists repondu_at timestamptz;
alter table public.doubles_jeudi add column if not exists repondu_via text;
alter table public.doubles_jeudi add column if not exists offre_envoyee_at timestamptz;
alter table public.doubles_jeudi add column if not exists offre_canaux text[];
alter table public.doubles_jeudi add column if not exists offre_erreur text;
alter table public.doubles_jeudi add column if not exists demarrage_message_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'doubles_jeudi_reponse_check') then
    alter table public.doubles_jeudi add constraint doubles_jeudi_reponse_check check (reponse in ('oui', 'non', 'expire'));
  end if;
end $$;

-- La fin de la proposition : le dimanche qui suit le jeudi, 23:59 (Paris).
create or replace function public.double_jeudi_limite(p_jeudi date)
returns timestamptz language sql immutable as $$
  select ((p_jeudi + 4)::timestamp at time zone 'Europe/Paris');
$$;

-- Le lundi où le 2e compte compte : le lundi qui suit l'accord (heure de Paris).
create or replace function public.double_jeudi_lundi(p_repondu timestamptz)
returns date language sql immutable as $$
  select (date_trunc('week', (p_repondu at time zone 'Europe/Paris')) + interval '7 days')::date;
$$;

-- Les doublements déjà créés dont le 2e compte a lancé son warm-up : accord (repondu_at = lancement du warm-up).
update public.doubles_jeudi dj
   set reponse = 'oui', repondu_at = c.warmup_started_at, repondu_via = 'warmup'
  from public.comptes c
 where c.id = dj.nouveau_compte_id and dj.reponse is null and dj.statut = 'cree' and c.warmup_started_at is not null;

-- Le warm-up lancé sur un 2e compte du jeudi vaut accord.
create or replace function public.double_jeudi_warmup_tg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.warmup_started_at is not null and old.warmup_started_at is null then
    update public.doubles_jeudi set reponse = 'oui', repondu_at = now(), repondu_via = 'warmup'
     where nouveau_compte_id = new.id and reponse is null and statut = 'cree' and now() < public.double_jeudi_limite(jeudi);
  end if;
  return null;
end;
$$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'double_jeudi_warmup' and tgrelid = 'public.comptes'::regclass) then
    create trigger double_jeudi_warmup after update of warmup_started_at on public.comptes
      for each row execute function public.double_jeudi_warmup_tg();
  end if;
end $$;

-- Le tarif d'une semaine (un compte) d'un posteur.
create or replace function public.posteur_tarif_semaine(p_poster uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(case when pr.canal_paie = 'ruul' then pr.ruul_tarif_semaine end,
                  public.paie_tarif_contrat(p_poster), public.paie_tarif_zone(p_poster), pr.tarif_hebdo)
    from public.profiles pr where pr.id = p_poster;
$$;
revoke execute on function public.posteur_tarif_semaine(uuid) from public, anon, authenticated;
grant execute on function public.posteur_tarif_semaine(uuid) to service_role;

-- Les propositions à envoyer (le OUI de Max, pas encore envoyées, pas encore expirées).
create or replace function public.doubles_offres_a_envoyer()
returns table (id uuid, poster_id uuid, prenom text, canal_paie text, pays text, handle text, label text, lundi date, tarif numeric)
language sql stable security definer set search_path = public as $$
  select dj.id, dj.poster_id, pr.prenom, coalesce(pr.canal_paie, 'upwork'), c.pays, c.handle_tiktok,
         (select l.nom from public.labels l where l.id = coalesce(dj.label_choisi_id, dj.label_propose_id)),
         dj.jeudi + 4 + 0, public.posteur_tarif_semaine(dj.poster_id)
    from public.doubles_jeudi dj
    join public.profiles pr on pr.id = dj.poster_id
    join public.comptes c on c.id = dj.compte_id
   where dj.decision = 'oui' and dj.statut in ('a_creer', 'cree') and dj.reponse is null and dj.offre_envoyee_at is null
     and now() < public.double_jeudi_limite(dj.jeudi) and pr.is_active
     and not public.ne_plus_contacter_bloque(dj.poster_id);
$$;
revoke execute on function public.doubles_offres_a_envoyer() from public, anon, authenticated;
grant execute on function public.doubles_offres_a_envoyer() to service_role;

create or replace function public.double_offre_noter(p_id uuid, p_canaux text[], p_erreur text)
returns void language sql security definer set search_path = public as $$
  update public.doubles_jeudi
     set offre_envoyee_at = case when coalesce(array_length(p_canaux, 1), 0) > 0 then now() end,
         offre_canaux = p_canaux, offre_erreur = p_erreur
   where id = p_id;
$$;
revoke execute on function public.double_offre_noter(uuid, text[], text) from public, anon, authenticated;
grant execute on function public.double_offre_noter(uuid, text[], text) to service_role;

-- La proposition en cours du posteur connecté (pop-up du dashboard).
create or replace function public.mon_double_jeudi()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', dj.id, 'handle', c.handle_tiktok, 'lundi', dj.jeudi + 4,
           'limite', public.double_jeudi_limite(dj.jeudi), 'tarif', public.posteur_tarif_semaine(dj.poster_id),
           'texte', coalesce(t.texte, t.texte_en))
    from public.doubles_jeudi dj
    join public.comptes c on c.id = dj.compte_id
    left join public.posteur_textes t on t.poster_id = dj.poster_id and t.cle = 'double_offre:' || dj.id
   where dj.poster_id = auth.uid() and dj.decision = 'oui' and dj.statut in ('a_creer', 'cree') and dj.reponse is null
     and dj.offre_envoyee_at is not null and now() < public.double_jeudi_limite(dj.jeudi)
   order by dj.jeudi desc limit 1;
$$;
revoke execute on function public.mon_double_jeudi() from public, anon;
grant execute on function public.mon_double_jeudi() to authenticated;

-- La réponse : le posteur (dashboard) ou le support (« yes » sur Upwork / par email). Un OUI sur une proposition dont
-- le 2e compte n'est pas encore créé lance sa création (fonction ckd, action double_jeudi).
create or replace function public.double_jeudi_repondre_interne(p_id uuid, p_oui boolean, p_via text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d public.doubles_jeudi;
begin
  select * into d from public.doubles_jeudi where id = p_id for update;
  if d.id is null then return jsonb_build_object('ok', false, 'raison', 'proposition introuvable'); end if;
  if d.reponse is not null then return jsonb_build_object('ok', true, 'deja', d.reponse, 'lundi', public.double_jeudi_lundi(d.repondu_at)); end if;
  if now() >= public.double_jeudi_limite(d.jeudi) then return jsonb_build_object('ok', false, 'raison', 'proposition expirée'); end if;
  update public.doubles_jeudi set reponse = case when p_oui then 'oui' else 'non' end, repondu_at = now(), repondu_via = p_via where id = p_id;
  if p_oui and d.statut = 'a_creer' and d.nouveau_compte_id is null then
    perform net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/ckd',
      headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
      body := jsonb_build_object('action', 'double_jeudi', 'id', p_id), timeout_milliseconds := 120000);
  end if;
  return jsonb_build_object('ok', true, 'reponse', case when p_oui then 'oui' else 'non' end, 'lundi', public.double_jeudi_lundi(now()));
end;
$$;
revoke execute on function public.double_jeudi_repondre_interne(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.double_jeudi_repondre_interne(uuid, boolean, text) to service_role;

create or replace function public.double_jeudi_repondre(p_id uuid, p_oui boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.doubles_jeudi where id = p_id and poster_id = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.double_jeudi_repondre_interne(p_id, p_oui, 'dashboard');
end;
$$;
revoke execute on function public.double_jeudi_repondre(uuid, boolean) from public, anon;
grant execute on function public.double_jeudi_repondre(uuid, boolean) to authenticated;

-- La proposition en cours d'un posteur (pour le support : « yes » / « no » sur Upwork ou par email).
create or replace function public.double_jeudi_en_cours(p_poster uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select dj.id from public.doubles_jeudi dj
   where dj.poster_id = p_poster and dj.decision = 'oui' and dj.statut in ('a_creer', 'cree') and dj.reponse is null
     and dj.offre_envoyee_at is not null and now() < public.double_jeudi_limite(dj.jeudi)
   order by dj.jeudi desc limit 1;
$$;
revoke execute on function public.double_jeudi_en_cours(uuid) from public, anon, authenticated;
grant execute on function public.double_jeudi_en_cours(uuid) to service_role;

-- Sans réponse le dimanche 23:59 : la proposition expire (rien ne change).
create or replace function public.doubles_jeudi_expirer()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.doubles_jeudi set reponse = 'expire', repondu_at = now(), repondu_via = 'expiration'
   where decision = 'oui' and statut in ('a_creer', 'cree') and reponse is null and now() >= public.double_jeudi_limite(jeudi);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.doubles_jeudi_expirer() from public, anon, authenticated;
grant execute on function public.doubles_jeudi_expirer() to service_role;

-- 3. Les messages de démarrage dus (le lundi qui suit l'accord, 2e compte créé).
create or replace function public.doubles_demarrages_a_envoyer()
returns table (id uuid, poster_id uuid, prenom text, canal_paie text, pays text, handle1 text, handle2 text, lundi date, tarif numeric)
language sql stable security definer set search_path = public as $$
  select dj.id, dj.poster_id, pr.prenom, coalesce(pr.canal_paie, 'upwork'), c1.pays, c1.handle_tiktok, c2.handle_tiktok,
         public.double_jeudi_lundi(dj.repondu_at), public.posteur_tarif_semaine(dj.poster_id)
    from public.doubles_jeudi dj
    join public.profiles pr on pr.id = dj.poster_id
    join public.comptes c1 on c1.id = dj.compte_id
    join public.comptes c2 on c2.id = dj.nouveau_compte_id
   where dj.reponse = 'oui' and dj.demarrage_message_at is null and c2.is_active and c1.is_active and pr.is_active
     and public.double_jeudi_lundi(dj.repondu_at) <= (now() at time zone 'Europe/Paris')::date
     and public.double_jeudi_lundi(dj.repondu_at) >= (now() at time zone 'Europe/Paris')::date - 6
     and not public.ne_plus_contacter_bloque(dj.poster_id);
$$;
revoke execute on function public.doubles_demarrages_a_envoyer() from public, anon, authenticated;
grant execute on function public.doubles_demarrages_a_envoyer() to service_role;

create or replace function public.double_demarrage_noter(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.doubles_jeudi set demarrage_message_at = now() where id = p_id;
$$;
revoke execute on function public.double_demarrage_noter(uuid) from public, anon, authenticated;
grant execute on function public.double_demarrage_noter(uuid) to service_role;

-- 2. Paie : le 2e compte du jeudi compte dès le lundi qui suit l'accord (plus dès la création).
do $$
declare
  d text := pg_get_functiondef('public.paie_suivante_calc(date,jsonb)'::regprocedure);
  a1 text := 'dj.statut = ''cree''
                              and dj.decide_at <= b2.coupure and dj.decide_at >= b2.coupure - interval ''21 days''';
  a2 text := 'coalesce((select pj.premier_jour - (extract(isodow from pj.premier_jour)::int - 1)';
begin
  if position('0802' in d) > 0 then return; end if;
  if position(a1 in d) = 0 or position(a2 in d) = 0 then raise exception '0802 : paie_suivante_calc a changé'; end if;
  d := replace(d, a1, 'dj.statut = ''cree'' and dj.reponse = ''oui'' /* 0802 : accord du posteur */
                              and dj.repondu_at <= b2.coupure - interval ''10 hours'' and dj.repondu_at >= b2.coupure - interval ''21 days''');
  d := replace(d, a2, 'coalesce((select public.double_jeudi_lundi(dj3.repondu_at) from public.doubles_jeudi dj3
                        where dj3.nouveau_compte_id = c.id and dj3.reponse = ''oui'' limit 1),
                    (select pj.premier_jour - (extract(isodow from pj.premier_jour)::int - 1)');
  execute d;
end $$;

-- 4. Plafond par posteur et par semaine.
update public.reglages set valeur = to_jsonb(60) where cle = 'paie_plafond_ligne';

-- La réponse des posteurs (page Weekly decisions, onglet Jeudi).
create or replace function public.jeudi_doubles_reponses(p_jeudi date)
returns table (id uuid, reponse text, repondu_at timestamptz, repondu_via text, offre_envoyee_at timestamptz, offre_canaux text[], offre_erreur text, demarrage_message_at timestamptz)
language sql stable security definer set search_path = public as $$
  select dj.id, dj.reponse, dj.repondu_at, dj.repondu_via, dj.offre_envoyee_at, dj.offre_canaux, dj.offre_erreur, dj.demarrage_message_at
    from public.doubles_jeudi dj
   where dj.jeudi = p_jeudi and dj.decision = 'oui' and public.is_admin();
$$;
revoke execute on function public.jeudi_doubles_reponses(date) from public, anon;
grant execute on function public.jeudi_doubles_reponses(date) to authenticated;

-- Le dimanche soir : ce que la paie du lundi financera pour la semaine qui commence (contrats Upwork actifs), avec le
-- même calcul (paie_suivante_calc) : action, nombre de comptes, montant.
create or replace function public.paie_alignement_attendu(p_lundi date)
returns table (poster_id uuid, prenom text, contrat_id text, organisation_id text, action text, comptes integer, montant numeric)
language plpgsql stable security definer set search_path = public as $$
declare l jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('poster_id', pr.id, 'prevus', 14, 'faits', 14,
           'tarif', public.posteur_tarif_semaine(pr.id), 'action', 'payer')), '[]'::jsonb) into l
    from public.profiles pr
    join public.user_roles ur on ur.user_id = pr.id and ur.role = 'poster'
   where pr.is_active and coalesce(pr.canal_paie, 'upwork') = 'upwork' and coalesce(pr.upwork_contract_id, '') <> '';
  return query
  select s.poster_id, pr.prenom, pr.upwork_contract_id, uc.organisation_id, s.action, s.comptes, s.montant
    from public.paie_suivante_calc(p_lundi - 7, l) s
    join public.profiles pr on pr.id = s.poster_id
    left join public.upwork_contrats uc on uc.contrat_id = pr.upwork_contract_id;
end;
$$;
revoke execute on function public.paie_alignement_attendu(date) from public, anon, authenticated;
grant execute on function public.paie_alignement_attendu(date) to service_role;

-- Les tâches planifiées (heure de Paris, hiver : UTC+1).
do $$
begin
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname in ('doubles-offres', 'doubles-expirer', 'doubles-demarrages', 'jalons-aligner');
  -- La proposition part dans le quart d'heure qui suit le OUI de Max.
  perform cron.schedule('doubles-offres', '*/15 * * * *',
    $c$select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/support',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"doubles_offres"}'::jsonb, timeout_milliseconds := 120000)$c$);
  -- Lundi 00:05 (Paris) : les propositions sans réponse expirent.
  perform cron.schedule('doubles-expirer', '5 23 * * 0', $c$select public.doubles_jeudi_expirer()$c$);
  -- Lundi 9:20 (Paris) : le message de démarrage (2 comptes, nouvelle paie).
  perform cron.schedule('doubles-demarrages', '20 8 * * 1',
    $c$select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/support',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"doubles_demarrages"}'::jsonb, timeout_milliseconds := 120000)$c$);
  -- Dimanche 20:13 (Paris) : les milestones de la semaine qui commence, au bon nom et au bon montant.
  perform cron.schedule('jalons-aligner', '13 19 * * 0',
    $c$select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/upwork',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"jalons_aligner"}'::jsonb, timeout_milliseconds := 280000)$c$);
end $$;

-- Le bonus questionnaire Upwork, dès que le questionnaire est fini (toutes les heures).
do $$
begin
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'bonus-questionnaire';
  perform cron.schedule('bonus-questionnaire', '37 * * * *',
    $c$select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/upwork',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"bonus_auto"}'::jsonb, timeout_milliseconds := 120000)$c$);
end $$;

-- Le message de paie Ruul : envoyé le lundi, arrivé en 1 à 2 jours ouvrés (validation bancaire).
update public.reglages
   set valeur = valeur || jsonb_build_object(
     'paye_texte', 'Hi {prenom}, your payment of ${montant} for the week of {semaine} was sent on Monday. It usually arrives within 1 to 2 business days (by {mercredi}).',
     'paye_objet', 'Your payment of ${montant} is on its way')
 where cle = 'ruul_textes';

-- La réponse officielle « When am I paid? » (Ruul) : le délai de la validation bancaire.
update public.reponses_officielles
   set reponse = 'Every Monday, for the week of posts that just ended (Monday → Sunday), through Ruul. Nothing to submit. Because of bank validation, the money usually reaches your account 1 to 2 business days later (Tuesday or Wednesday). Your first payment is the Monday after your first week of posts.'
 where id = 'd8155c2a-385e-4ebc-8c25-856c347ccd5c' and reponse not ilike '%business days%';

-- La page Pay : le détail de la paie de chaque posteur (base + 2e compte + bonus = total), pour la semaine payée le
-- lundi qui suit. Les bonus sont ceux de ce lundi (parrainage, Comment Master, questionnaire, manuel).
create or replace function public.paie_detail_semaine(p_semaine date default null)
returns table (poster_id uuid, nom text, plateforme text, comptes integer, tarif numeric, base numeric, deuxieme numeric,
               retenue numeric, bonus jsonb, bonus_total numeric, total numeric, au_dessus_plafond boolean)
language sql stable security definer set search_path = public as $$
  with s as (select coalesce(p_semaine, (select max(semaine) from public.paie_semaines)) as semaine),
  plafond as (select coalesce((select (valeur #>> '{}')::numeric from public.reglages where cle = 'paie_plafond_ligne'), 60) as v),
  b as (
    select x.poster_id, jsonb_agg(jsonb_build_object('type', x.type, 'montant', x.montant, 'statut', x.statut) order by x.type) as detail,
           sum(x.montant) as total
      from public.bonus x, s
     where x.lundi_bonus = s.semaine + 7 and x.statut <> 'retire' and x.montant > 0
     group by x.poster_id)
  select ps.poster_id, trim(coalesce(pr.prenom, '') || ' ' || coalesce(pr.nom, '')), coalesce(pr.canal_paie, 'upwork'),
         greatest(coalesce(ps.comptes_payes, ps.nb_comptes, 1), 1), ps.tarif,
         coalesce(ps.tarif, 0), coalesce(ps.tarif, 0) * greatest(coalesce(ps.comptes_payes, ps.nb_comptes, 1) - 1, 0),
         coalesce(ps.retenue, 0), coalesce(b.detail, '[]'::jsonb), coalesce(b.total, 0),
         coalesce(ps.montant_corrige, ps.montant, 0) + coalesce(b.total, 0),
         coalesce(ps.montant_corrige, ps.montant, 0) + coalesce(b.total, 0) > (select v from plafond)
    from public.paie_semaines ps
    join s on ps.semaine = s.semaine
    join public.profiles pr on pr.id = ps.poster_id
    left join b on b.poster_id = ps.poster_id
   where not coalesce(ps.exclu, false) and (public.is_admin() or coalesce(auth.role(), '') = 'service_role');
$$;
revoke execute on function public.paie_detail_semaine(date) from public, anon;
grant execute on function public.paie_detail_semaine(date) to authenticated, service_role;
