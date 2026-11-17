-- 0739 : API Ruul, phase 4 — les webhooks de paiement (Max, 17/11).
-- Ruul appelle https://mbikecieskoobeizixig.supabase.co/functions/v1/ruul-webhook à chaque changement de statut
-- d'une ligne de paiement (signature HMAC vérifiée par la fonction). Ici :
-- 1. ruul_webhook_evenements : chaque événement une seule fois (Ruul renvoie le même id à chaque essai).
-- 2. ruul_ligne_statut : le statut d'une ligne Ruul, jamais en arrière (les événements arrivent dans le désordre) ;
--    PAID → la ligne est payée, le posteur est prévenu (message existant « You received … »), le bonus est payé ;
--    FAILED / RETURNED / CANCELLED → une carte dans Problèmes pour Max ; le lot passe « payé » quand tout est payé.
-- 3. ruul_lot_batch_noter (création et relecture du paiement) passe par la même règle.
-- 4. Filet : le cron « ruul-payout-relire » relit toutes les heures les paiements Ruul pas encore soldés.
-- Additif : une table, des fonctions, un cron. Aucune donnée existante modifiée ici.

create table if not exists public.ruul_webhook_evenements (
  id text primary key,
  env text not null,
  type text not null,
  transaction_id bigint,
  batch_id bigint,
  statut text,
  corps jsonb not null,
  resultat jsonb,
  recu_at timestamptz not null default now()
);
alter table public.ruul_webhook_evenements enable row level security;
drop policy if exists ruul_webhook_admin on public.ruul_webhook_evenements;
create policy ruul_webhook_admin on public.ruul_webhook_evenements for select using (public.is_admin());

create or replace function public.ruul_rang_statut(p text)
returns int language sql immutable as $$
  select case p
    when 'AWAITING_FUNDING' then 1
    when 'FUNDED' then 2
    when 'AWAITING_RECIPIENT' then 2
    when 'PARTIALLY_PAID' then 3
    when 'FAILED' then 3
    when 'PAID' then 4
    when 'RETURNED' then 5
    when 'CANCELLED' then 5
    else 0 end;
$$;

-- Le nouveau statut Ruul d'une transaction (= une ligne posteur, toutes ses semaines du lot).
create or replace function public.ruul_ligne_statut(p_transaction bigint, p_statut text, p_echec text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_avant text;
  v_poster uuid;
  v_lot uuid;
  v_semaine date;
  v_nom text;
  v_montant numeric;
  n int;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'réservé au serveur'; end if;
  select rp.ruul_statut, rp.poster_id, rp.lot_id into v_avant, v_poster, v_lot
    from public.ruul_paiements rp where rp.ruul_transaction_id = p_transaction
   order by public.ruul_rang_statut(rp.ruul_statut) desc limit 1;
  if v_poster is null then return jsonb_build_object('resultat', 'inconnu'); end if;
  if v_avant is not null and public.ruul_rang_statut(p_statut) < public.ruul_rang_statut(v_avant) then
    return jsonb_build_object('resultat', 'ignore', 'avant', v_avant);
  end if;
  update public.ruul_paiements
     set ruul_statut = p_statut, ruul_echec = p_echec, ruul_maj_at = now(), maj_at = now()
   where ruul_transaction_id = p_transaction;

  if p_statut = 'PAID' then
    update public.ruul_paiements
       set statut = 'paye', paye_at = coalesce(paye_at, now()), message_statut = 'a_envoyer', maj_at = now()
     where ruul_transaction_id = p_transaction and statut = 'a_payer';
    get diagnostics n = row_count;
    if n > 0 then
      update public.bonus b set statut = 'paye', paye_at = now(), raison = 'payé via Ruul'
       where b.canal_paie = 'ruul' and b.statut in ('a_valider', 'a_payer')
         and b.id in (select unnest(rp.bonus_ids) from public.ruul_paiements rp where rp.ruul_transaction_id = p_transaction);
      update public.profiles pr
         set ruul_premier_paiement_at = coalesce(pr.ruul_premier_paiement_at, now()),
             ruul_pret_at = coalesce(pr.ruul_pret_at, now()),
             ruul_statut = 'paye_1x'
       where pr.id = v_poster;
    end if;
    -- Le lot est payé quand plus aucune de ses lignes n'attend.
    update public.ruul_lots l
       set statut = 'paye', paye_at = coalesce(l.paye_at, now()),
           total = coalesce((select sum(montant + bonus) from public.ruul_paiements where lot_id = l.id and statut = 'paye'), 0)
     where l.id = v_lot and l.statut = 'saisi'
       and not exists (select 1 from public.ruul_paiements x where x.lot_id = l.id and x.statut = 'a_payer');
  elsif p_statut in ('FAILED', 'RETURNED', 'CANCELLED') then
    select l.semaine, coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
           (select sum(x.montant + x.bonus) from public.ruul_paiements x where x.ruul_transaction_id = p_transaction)
      into v_semaine, v_nom, v_montant
      from public.ruul_lots l, public.profiles pr where l.id = v_lot and pr.id = v_poster;
    perform public.probleme_ajouter('ruul_paiement', p_transaction::text || ':' || p_statut, v_poster, null, 'paie',
      'Ruul : paiement ' || case p_statut when 'FAILED' then 'en échec' when 'RETURNED' then 'revenu' else 'annulé' end,
      format('Lot Ruul du %s : %s, %s $ — statut %s%s. À voir sur Ruul (transaction %s).', v_semaine, v_nom, v_montant, p_statut,
             coalesce(' (' || p_echec || ')', ''), p_transaction),
      now(), null, 'os', null);
  end if;
  return jsonb_build_object('resultat', 'maj', 'avant', v_avant, 'apres', p_statut, 'poster', v_poster);
end;
$function$;

-- Un événement reçu (signature déjà vérifiée) : noté une fois, appliqué une fois.
create or replace function public.ruul_webhook_recevoir(p_id text, p_env text, p_type text, p_corps jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tx bigint := nullif(p_corps#>>'{data,transactionId}', '')::bigint;
  v_statut text := p_corps#>>'{data,status}';
  v_res jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'réservé au serveur'; end if;
  insert into public.ruul_webhook_evenements (id, env, type, transaction_id, batch_id, statut, corps)
  values (p_id, p_env, p_type, v_tx, nullif(p_corps#>>'{data,batchId}', '')::bigint, v_statut, p_corps)
  on conflict (id) do nothing;
  if not found then return jsonb_build_object('doublon', true); end if;
  if p_type like 'payout.%' and v_tx is not null and v_statut is not null then
    v_res := public.ruul_ligne_statut(v_tx, v_statut, p_corps#>>'{data,failureReason}');
  else
    v_res := jsonb_build_object('resultat', 'sans_effet');
  end if;
  update public.ruul_webhook_evenements set resultat = v_res where id = p_id;
  return v_res;
end;
$function$;

-- La création et la relecture du paiement passent par la même règle (ruul_ligne_statut).
create or replace function public.ruul_lot_batch_noter(p_semaine date, p_batch jsonb, p_user uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lot public.ruul_lots;
  r jsonb;
  n int := 0;
  inconnus text[] := '{}';
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'réservé au serveur'; end if;
  select * into v_lot from public.ruul_lots where semaine = p_semaine for update;
  if v_lot.id is null then return jsonb_build_object('ok', false, 'erreur', 'lot introuvable'); end if;
  if v_lot.ruul_batch_id is not null and v_lot.ruul_batch_id <> (p_batch->>'batchId')::bigint then
    return jsonb_build_object('ok', false, 'erreur', 'un autre paiement Ruul est déjà lié à ce lot');
  end if;
  update public.ruul_lots
     set ruul_batch_id = (p_batch->>'batchId')::bigint,
         ruul_env = coalesce(ruul_env, ruul_envoi->>'env'),
         ruul_statut = p_batch->>'status',
         ruul_funding = p_batch->'funding',
         ruul_paiement = coalesce(p_batch->'payment', ruul_paiement),
         ruul_resume = p_batch->'summary',
         ruul_cree_at = coalesce(ruul_cree_at, now()),
         ruul_cree_par = coalesce(ruul_cree_par, p_user),
         ruul_lu_at = now(),
         ruul_envoi = case when ruul_envoi is null then null else ruul_envoi || '{"resultat": "cree"}'::jsonb end,
         statut = case when statut = 'prepare' then 'saisi' else statut end,
         facture = coalesce(facture, 'Ruul ' || coalesce(p_batch->>'tNo', p_batch->>'batchId')),
         saisi_at = coalesce(saisi_at, now()),
         saisi_par = coalesce(saisi_par, p_user)
   where id = v_lot.id;
  for r in select * from jsonb_array_elements(coalesce(p_batch->'rows', '[]'::jsonb)) loop
    update public.ruul_paiements rp
       set ruul_transaction_id = (r->>'transactionId')::bigint, maj_at = now()
      from public.profiles pr
     where pr.id = rp.poster_id and rp.lot_id = v_lot.id and rp.statut in ('a_payer', 'paye')
       and lower(btrim(pr.ruul_email)) = lower(btrim(r->>'email'));
    if found then
      n := n + 1;
      perform public.ruul_ligne_statut((r->>'transactionId')::bigint, r->>'status', r#>>'{payout,failureReason}');
    else
      inconnus := inconnus || (r->>'transactionId');
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'batch', (p_batch->>'batchId')::bigint, 'lignes', n, 'sans_ligne', inconnus);
end;
$function$;

revoke all on function public.ruul_ligne_statut(bigint, text, text) from public, anon, authenticated;
revoke all on function public.ruul_webhook_recevoir(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.ruul_ligne_statut(bigint, text, text) to service_role;
grant execute on function public.ruul_webhook_recevoir(text, text, text, jsonb) to service_role;

-- Filet : relire toutes les heures les paiements Ruul créés et pas encore soldés (si un webhook s'est perdu).
do $c$
begin
  perform cron.unschedule('ruul-payout-relire') where exists (select 1 from cron.job where jobname = 'ruul-payout-relire');
  perform cron.schedule('ruul-payout-relire', '41 * * * *', $j$
    select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/ruul-api',
      headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
      body := '{"action": "relire_tous"}'::jsonb, timeout_milliseconds := 60000)
     where exists (select 1 from public.ruul_lots where ruul_batch_id is not null and statut = 'saisi');
  $j$);
end
$c$;
