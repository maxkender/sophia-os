-- 0711 : Support, Phase 0 « Contrôle » (Max, 13/11 : « tout doit être contrôlable par moi »).
-- 1. Réglage `controle` : STOP général ; mode de chaque agent et de chaque action (eteint | proposer | agir) ;
--    réponse du bot par canal (help, slack, email, upwork) ; plafonds de Pay BOT.
--    Ce qui agit déjà aujourd'hui garde « agir » (rien ne casse) ; tout ce qui est nouveau démarre en « proposer ».
--    Le STOP général coupe le support et les bots, pas l'onboarding (automation_pause garde ce rôle).
-- 2. journal_auto : chaque réponse et action (qui, quoi, posteur, canal, montant, résultat), annulable si possible.
-- 3. RPC : controle_lire (réglages + compteurs du jour + journal), controle_regler, journal_annuler.
-- Additif : un réglage, une table, des fonctions. Rien n'est envoyé ici.

insert into public.reglages (cle, valeur)
select 'controle', jsonb_build_object(
  'stop', false,
  'agents', jsonb_build_object(
    'cerveau_support', 'agir',
    'new_cohort_bot', case when (select valeur #>> '{}' from public.reglages where cle = 'autonomie_bots') = 'on' then 'agir' else 'proposer' end,
    'control_bot', case when (select valeur #>> '{}' from public.reglages where cle = 'autonomie_bots') = 'on' then 'agir' else 'proposer' end,
    'pay_bot', 'proposer',
    'ruul_bot', 'proposer'),
  'canaux', jsonb_build_object('help', true, 'slack', true, 'email', true, 'upwork', true),
  'actions', jsonb_build_object(
    'lien_mot_de_passe', 'agir', 'lien_slack', 'agir', 'pseudo_tiktok', 'agir', 'email_ruul', 'agir',
    'invitation_ruul', 'agir', 'arret', 'agir', 'renvoi_parrainage', 'agir', 'prevenir_max', 'agir',
    'ticket_os', 'proposer', 'ticket_regle_prevenir', 'proposer'),
  'pay', jsonb_build_object('plafond_milestone', 30, 'plafond_jour', 300))
where not exists (select 1 from public.reglages where cle = 'controle');

-- Les actions qu'avait éteintes la page « Actions possibles » (0707) restent éteintes.
update public.reglages c
   set valeur = jsonb_set(c.valeur, '{actions}', (c.valeur->'actions') || coalesce((
         select jsonb_object_agg(k, 'eteint') from jsonb_each_text((select valeur from public.reglages where cle = 'bot_actions_actives')) e(k, v)
          where v = 'false'), '{}'::jsonb))
 where c.cle = 'controle';

create table if not exists public.journal_auto (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  qui text not null,
  quoi text not null,
  mode text not null default 'agir' check (mode in ('agir', 'proposer', 'bloque')),
  poster_id uuid references public.profiles(id),
  canal text,
  montant numeric,
  resultat text,
  details jsonb not null default '{}'::jsonb,
  annulable boolean not null default false,
  annule_at timestamptz,
  annule_par uuid,
  demande_id uuid
);
create index if not exists journal_auto_at_idx on public.journal_auto (at desc);
alter table public.journal_auto enable row level security;
drop policy if exists journal_auto_admin on public.journal_auto;
create policy journal_auto_admin on public.journal_auto for select to authenticated using (public.is_admin());

create or replace function public.controle_lire()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_jour timestamptz := (date_trunc('day', now() at time zone 'Europe/Paris')) at time zone 'Europe/Paris';
begin
  if not public.is_admin() then raise exception 'réservé à l''admin' using errcode = '42501'; end if;
  return jsonb_build_object(
    'reglage', (select valeur from public.reglages where cle = 'controle'),
    'compteurs', coalesce((select jsonb_object_agg(quoi, n) from (
        select quoi, count(*) n from public.journal_auto where at >= v_jour and mode = 'agir' and annule_at is null group by 1) x), '{}'::jsonb),
    'propositions', coalesce((select jsonb_object_agg(quoi, n) from (
        select quoi, count(*) n from public.journal_auto where at >= v_jour and mode = 'proposer' group by 1) x), '{}'::jsonb),
    'journal', coalesce((select jsonb_agg(x order by x->>'at' desc) from (
        select jsonb_build_object('id', j.id, 'at', j.at, 'qui', j.qui, 'quoi', j.quoi, 'mode', j.mode, 'poster_id', j.poster_id,
                 'nom', nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), 'canal', j.canal, 'montant', j.montant, 'resultat', j.resultat,
                 'annulable', j.annulable and j.annule_at is null, 'annule_at', j.annule_at, 'source', 'journal') x
          from public.journal_auto j left join public.profiles p on p.id = j.poster_id
         where j.at > now() - interval '3 days'
        union all
        -- Les actions des bots Grok (bot_actions), dans le même journal.
        select jsonb_build_object('id', b.id, 'at', b.at, 'qui', b.bot, 'quoi', b.action, 'mode', case when b.statut = 'refuse' then 'bloque' else 'agir' end,
                 'poster_id', b.poster_id, 'nom', nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), 'canal', b.canal, 'montant', null,
                 'resultat', b.statut || coalesce(' : ' || b.raison, ''), 'annulable', b.statut = 'prevu' and b.annule_at is null,
                 'annule_at', b.annule_at, 'source', 'bot_actions')
          from public.bot_actions b left join public.profiles p on p.id = b.poster_id
         where b.at > now() - interval '3 days'
      ) t), '[]'::jsonb));
end;
$$;
revoke execute on function public.controle_lire() from public, anon;
grant execute on function public.controle_lire() to authenticated;

-- Un réglage de la page : chemin (ex. {agents,pay_bot}) et valeur, vérifiés.
create or replace function public.controle_regler(p_chemin text[], p_valeur jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_racine text := p_chemin[1];
begin
  if not public.is_admin() then raise exception 'réservé à l''admin' using errcode = '42501'; end if;
  if v_racine = 'stop' and array_length(p_chemin, 1) = 1 and jsonb_typeof(p_valeur) = 'boolean' then null;
  elsif v_racine in ('agents', 'actions') and array_length(p_chemin, 1) = 2 and p_valeur #>> '{}' in ('eteint', 'proposer', 'agir') then null;
  elsif v_racine = 'canaux' and array_length(p_chemin, 1) = 2 and p_chemin[2] in ('help', 'slack', 'email', 'upwork') and jsonb_typeof(p_valeur) = 'boolean' then null;
  elsif v_racine = 'pay' and array_length(p_chemin, 1) = 2 and p_chemin[2] in ('plafond_milestone', 'plafond_jour')
        and jsonb_typeof(p_valeur) = 'number' and (p_valeur #>> '{}')::numeric between 0 and 100000 then null;
  else
    return jsonb_build_object('ok', false, 'error', 'réglage refusé');
  end if;
  update public.reglages set valeur = jsonb_set(valeur, p_chemin, p_valeur, true), updated_at = now(), updated_by = auth.uid()
   where cle = 'controle';
  insert into public.journal_auto (qui, quoi, mode, resultat, details)
  values ('Max', 'reglage', 'agir', array_to_string(p_chemin, '.') || ' = ' || (p_valeur #>> '{}'), jsonb_build_object('chemin', p_chemin, 'valeur', p_valeur));
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.controle_regler(text[], jsonb) from public, anon;
grant execute on function public.controle_regler(text[], jsonb) to authenticated;

-- Annuler : un changement de @ TikTok ou d'email Ruul (valeur d'avant gardée), ou une action de bot encore prévue.
create or replace function public.journal_annuler(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.journal_auto;
begin
  if not public.is_admin() then raise exception 'réservé à l''admin' using errcode = '42501'; end if;
  select * into j from public.journal_auto where id = p_id;
  if not found then
    -- Une action de bot (bot_actions) encore « prévue » : annulée par la fonction existante.
    if exists (select 1 from public.bot_actions where id = p_id) then
      perform public.bot_action_annuler(p_id);
      return jsonb_build_object('ok', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'introuvable');
  end if;
  if not j.annulable or j.annule_at is not null then return jsonb_build_object('ok', false, 'error', 'pas annulable'); end if;
  if j.quoi = 'pseudo_tiktok' and j.details ? 'compte_id' and j.details ? 'avant' then
    update public.comptes set handle_tiktok = nullif(j.details->>'avant', '') where id = (j.details->>'compte_id')::uuid;
  elsif j.quoi = 'email_ruul' and j.details ? 'avant' then
    update public.profiles set ruul_email = nullif(j.details->>'avant', '') where id = j.poster_id;
  else
    return jsonb_build_object('ok', false, 'error', 'pas annulable');
  end if;
  update public.journal_auto set annule_at = now(), annule_par = auth.uid() where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.journal_annuler(uuid) from public, anon;
grant execute on function public.journal_annuler(uuid) to authenticated;
