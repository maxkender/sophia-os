-- 0706 : « escalations → aux bots d'abord » (Max, 13/11, « ok pour tout »).
-- 1. support_demandes gagne le bot responsable et le suivi de ses passages (colonnes nouvelles seulement) :
--    bot_responsable (new_cohort_bot | control_bot | pay_bot | ruul_bot | os_tickets | max), rempli à la
--    création et quand la catégorie / le niveau / le risque changent (même règle que _shared/routage_bots.ts),
--    et aussi pour les demandes déjà là (nouvelle colonne seulement, accord de Max).
-- 2. support_bot(bot, action, args) : la file « À traiter » de chaque bot (Help, Slack, email) :
--      lire     : ses demandes ouvertes (avec fiche et fil) ; chaque lecture compte un passage (au plus 1 par heure) ;
--                 au 3e passage sans rien faire, la demande remonte chez Max (« rien fait après 2 passages de X ») ;
--      regler   : sa réponse au posteur et ce qu'il a fait (la fonction bot_propositions l'envoie : chat Help + email) ;
--      remonter : pourquoi il ne peut pas régler → chez Max.
--    Jamais de paiement : toute demande de payer est refusée ici.
-- 3. Les tickets techniques (os_tickets) partent seuls, par le bouton existant (cron support-tickets).
-- Additif : colonnes, fonctions, trigger, un réglage, un cron. Aucune donnée existante modifiée hors des
-- nouvelles colonnes.

alter table public.support_demandes
  add column if not exists bot_responsable text,
  add column if not exists bot_passages integer not null default 0,
  add column if not exists bot_vu_at timestamptz,
  add column if not exists regle_par_bot text,
  add column if not exists regle_at timestamptz,
  add column if not exists remonte_par text,
  add column if not exists remonte_at timestamptz,
  add column if not exists remonte_pourquoi text;

create index if not exists support_demandes_bot_responsable_idx on public.support_demandes (bot_responsable) where statut = 'ouvert';

-- Le bot responsable (même table que routage_bots.ts).
create or replace function public.support_bot_responsable(p_categorie text, p_risque text[], p_niveau text, p_poster uuid, p_plateforme text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_niveau = 'max' or coalesce(p_risque, '{}'::text[]) && array['argent_tiers', 'multi_comptes', 'hors_plateforme', 'fraude', 'litige'] then 'max'
    when lower(coalesce(p_categorie, '')) = 'compte' and p_plateforme = 'ruul' then 'ruul_bot'
    when lower(coalesce(p_categorie, '')) in ('connexion', 'login', 'compte', 'upwork', 'slack', 'onboarding', 'statut', 'contrat', 'bienvenue') then 'new_cohort_bot'
    when lower(coalesce(p_categorie, '')) in ('posting', 'posts', 'tiktok', 'warmup', 'retard', 'arret', 'stop', 'lien', 'pause') then 'control_bot'
    when lower(coalesce(p_categorie, '')) in ('paiement', 'paie', 'milestone', 'bonus', 'parrainage') then 'pay_bot'
    when lower(coalesce(p_categorie, '')) in ('ruul', 'invitation_ruul', 'email_ruul', 'identite') then 'ruul_bot'
    when lower(coalesce(p_categorie, '')) in ('bug', 'technique') then 'os_tickets'
    when lower(coalesce(p_categorie, '')) in ('fraude', 'litige', 'dispute') then 'max'
    when p_poster is not null and exists (
      select 1 from public.passages pa join public.comptes c on c.id = pa.compte_id
       where c.poster_id = p_poster and pa.publie_url is not null) then 'control_bot'
    else 'new_cohort_bot' end;
$$;
revoke execute on function public.support_bot_responsable(text, text[], text, uuid, text) from public, anon;
grant execute on function public.support_bot_responsable(text, text[], text, uuid, text) to authenticated, service_role;

create or replace function public.support_demandes_bot_responsable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.regle_at is null and new.remonte_at is null then
    new.bot_responsable := public.support_bot_responsable(new.categorie, new.risque, new.niveau, new.poster_id, new.plateforme);
  end if;
  return new;
end;
$$;

drop trigger if exists support_demandes_bot_responsable on public.support_demandes;
create trigger support_demandes_bot_responsable
  before insert or update of categorie, niveau, risque on public.support_demandes
  for each row execute function public.support_demandes_bot_responsable();

-- Les demandes déjà là : la nouvelle colonne seulement.
update public.support_demandes d
   set bot_responsable = public.support_bot_responsable(d.categorie, d.risque, d.niveau, d.poster_id, d.plateforme)
 where d.bot_responsable is null;

-- Les tickets techniques automatiques : seulement les demandes créées à partir de maintenant.
insert into public.reglages (cle, valeur)
values ('support_tickets_auto', jsonb_build_object('depuis', now()))
on conflict (cle) do nothing;

-- La file « À traiter » d'un bot (appelée par la fonction bot_propositions, service_role).
create or replace function public.support_bot(p_bot text, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jour timestamptz := (date_trunc('day', now() at time zone 'Europe/Paris')) at time zone 'Europe/Paris';
  v_id uuid;
  v_d public.support_demandes;
  v_reponse text := nullif(left(btrim(coalesce(p_args->>'reponse', '')), 4000), '');
  v_fait text := nullif(left(btrim(coalesce(p_args->>'fait', '')), 500), '');
  v_pourquoi text := nullif(left(btrim(coalesce(p_args->>'pourquoi', '')), 500), '');
  v_remontees integer := 0;
  v_liste jsonb;
  r record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'support_bot : réservé à la fonction bot_propositions' using errcode = '42501';
  end if;
  if p_bot not in ('new_cohort_bot', 'control_bot', 'pay_bot', 'ruul_bot') then
    return jsonb_build_object('ok', false, 'error', 'bot inconnu');
  end if;
  -- 200 appels par jour et par bot (comme probleme_bot).
  if (select count(*) from public.bot_appels where bot = p_bot and at >= v_jour) >= 200 then
    return jsonb_build_object('ok', false, 'error', 'quota : 200 appels par jour');
  end if;
  -- Rien ne paie jamais depuis un bot.
  if p_args ? 'payer' or lower(coalesce(p_args->>'action', '')) in ('payer', 'pay', 'paiement', 'approve', 'approve_milestone', 'fund')
     or lower(coalesce(p_action, '')) in ('payer', 'pay') then
    insert into public.bot_appels (bot, action, ok, erreur, args) values (p_bot, 'support_' || coalesce(p_action, '?'), false, 'paiement refusé', p_args);
    return jsonb_build_object('ok', false, 'error', 'un bot ne paie jamais : Max ou Adrien clique Payer');
  end if;

  if p_action = 'lire' then
    -- 1. Au 3e passage sans rien faire : chez Max.
    for r in
      select d.id from public.support_demandes d
       where d.bot_responsable = p_bot and d.statut = 'ouvert' and d.regle_at is null and d.remonte_at is null
         and d.bot_passages >= 2 and (d.bot_vu_at is null or d.bot_vu_at < now() - interval '1 hour')
    loop
      update public.support_demandes
         set remonte_at = now(), remonte_par = p_bot, bot_responsable = 'max', niveau = 'max',
             remonte_pourquoi = 'rien fait après 2 passages de ' || p_bot, escalade_at = coalesce(escalade_at, now()), maj_at = now()
       where id = r.id;
      v_remontees := v_remontees + 1;
    end loop;
    -- 2. Un passage de plus (au plus 1 par heure) sur chaque demande de la file.
    update public.support_demandes d
       set bot_passages = d.bot_passages + 1, bot_vu_at = now()
     where d.bot_responsable = p_bot and d.statut = 'ouvert' and d.regle_at is null and d.remonte_at is null
       and (d.bot_vu_at is null or d.bot_vu_at < now() - interval '1 hour');
    -- 3. La file, avec la fiche et les 10 derniers messages.
    select coalesce(jsonb_agg(jsonb_build_object(
             'demande_id', d.id, 'poster_id', d.poster_id, 'type', d.type, 'categorie', d.categorie, 'plateforme', d.plateforme,
             'source', d.source, 'texte', d.texte, 'cree_at', d.cree_at, 'passages', d.bot_passages,
             'reponse_bot_faq', d.bot_reponse, 'brouillon', d.brouillon, 'verdict', d.verdict_texte, 'action_faite', d.action_faite,
             'fiche', case when d.poster_id is null then null else public.support_fiche(d.poster_id) end,
             'messages', (select coalesce(jsonb_agg(jsonb_build_object('auteur', m.auteur, 'texte', m.texte, 'at', m.cree_at) order by m.cree_at), '[]'::jsonb)
                            from (select * from public.support_messages m where m.demande_id = d.id order by m.cree_at desc limit 10) m)
           ) order by d.cree_at), '[]'::jsonb)
      into v_liste
      from public.support_demandes d
     where d.bot_responsable = p_bot and d.statut = 'ouvert' and d.regle_at is null and d.remonte_at is null;
    insert into public.bot_appels (bot, action, ok, args) values (p_bot, 'support_lire', true, jsonb_build_object('n', jsonb_array_length(v_liste), 'remontees', v_remontees));
    return jsonb_build_object('ok', true, 'demandes', v_liste, 'remontees_chez_max', v_remontees,
      'consigne', 'Pour chaque demande : regler (reponse au posteur en anglais, sans jamais parler de bot, + fait = ce que tu as fait) ou remonter (pourquoi). Sans rien faire, elle part chez Max au 3e passage. Tu ne paies jamais.');
  end if;

  if p_action not in ('regler', 'remonter') then
    return jsonb_build_object('ok', false, 'error', 'action : lire, regler ou remonter');
  end if;
  begin
    v_id := (p_args->>'demande_id')::uuid;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'demande_id (uuid) obligatoire');
  end;
  select * into v_d from public.support_demandes where id = v_id;
  if not found or v_d.bot_responsable is distinct from p_bot then
    insert into public.bot_appels (bot, action, ok, erreur, args) values (p_bot, 'support_' || p_action, false, 'pas dans sa file', p_args);
    return jsonb_build_object('ok', false, 'error', 'demande introuvable ou pas dans ta file');
  end if;
  if v_d.statut <> 'ouvert' or v_d.regle_at is not null or v_d.remonte_at is not null then
    return jsonb_build_object('ok', false, 'error', 'demande déjà traitée');
  end if;

  if p_action = 'regler' then
    if v_reponse is null or length(v_reponse) < 5 then return jsonb_build_object('ok', false, 'error', 'reponse (au posteur) obligatoire'); end if;
    if v_reponse ~* '\m(bot|AI|automated|automatic)\M' then
      return jsonb_build_object('ok', false, 'error', 'la réponse au posteur ne doit jamais parler de bot ni d''automatisation');
    end if;
    update public.support_demandes
       set regle_at = now(), regle_par_bot = p_bot,
           action_faite = left('Réglé par ' || p_bot || coalesce(' : ' || v_fait, ''), 500), maj_at = now()
     where id = v_id;
    insert into public.bot_appels (bot, action, ok, args) values (p_bot, 'support_regler', true, jsonb_build_object('demande_id', v_id, 'fait', v_fait));
    return jsonb_build_object('ok', true, 'demande_id', v_id, 'reponse', v_reponse);
  end if;

  -- remonter
  if v_pourquoi is null or length(v_pourquoi) < 5 then return jsonb_build_object('ok', false, 'error', 'pourquoi obligatoire'); end if;
  update public.support_demandes
     set remonte_at = now(), remonte_par = p_bot, remonte_pourquoi = v_pourquoi, bot_responsable = 'max', niveau = 'max',
         escalade_at = coalesce(escalade_at, now()), maj_at = now()
   where id = v_id;
  insert into public.bot_appels (bot, action, ok, args) values (p_bot, 'support_remonter', true, jsonb_build_object('demande_id', v_id, 'pourquoi', v_pourquoi));
  return jsonb_build_object('ok', true, 'demande_id', v_id);
end;
$$;
revoke execute on function public.support_bot(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.support_bot(text, text, jsonb) to service_role;

-- Les tickets techniques automatiques (le bouton existant, appelé par l'OS).
do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'support-tickets') then
    perform cron.schedule('support-tickets', '4-59/15 * * * *', $cmd$
      select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/support',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"tickets_auto"}'::jsonb, timeout_milliseconds := 60000)
    $cmd$);
  end if;
end
$c$;
