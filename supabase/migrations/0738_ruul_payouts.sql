-- 0738 : API Ruul, phase 3 — « Créer le paiement Ruul » (Max, 17/11).
-- L'OS crée le paiement chez Ruul (POST /payouts, Idempotency-Key) ; Ruul renvoie les instructions de virement
-- (montant dû en EUR, comptes, référence) et Max vire l'argent depuis Qonto. Rien ne part sans le clic de Max.
-- 1. ruul_lots : la clé d'idempotence, le corps envoyé, le résultat (inconnu / refusé / créé), le batch Ruul,
--    les instructions de virement et le statut.
-- 2. ruul_paiements : la transaction Ruul de chaque ligne, son statut chez Ruul, l'échec éventuel.
-- 3. Garde-fous : un seul paiement par lot ; un envoi au résultat inconnu (coupure, 5xx) est renvoyé à
--    l'identique avec la même clé (Ruul rend alors le paiement déjà créé, jamais un deuxième) ; un nouvel
--    essai avec une nouvelle clé seulement après un refus net de Ruul.
-- 4. ruul_mes_paiements : le posteur voit ses semaines (montant, détail, statut) sur sa page Payments.
-- Additif : colonnes, fonctions et le réglage `payeurs` (qui peut cliquer). Aucune donnée existante modifiée.

alter table public.ruul_lots
  add column if not exists ruul_envoi jsonb,
  add column if not exists ruul_batch_id bigint,
  add column if not exists ruul_env text,
  add column if not exists ruul_statut text,
  add column if not exists ruul_funding jsonb,
  add column if not exists ruul_paiement jsonb,
  add column if not exists ruul_resume jsonb,
  add column if not exists ruul_cree_at timestamptz,
  add column if not exists ruul_cree_par uuid references auth.users(id),
  add column if not exists ruul_lu_at timestamptz;

alter table public.ruul_paiements
  add column if not exists ruul_transaction_id bigint,
  add column if not exists ruul_statut text,
  add column if not exists ruul_echec text,
  add column if not exists ruul_maj_at timestamptz;

create index if not exists ruul_paiements_transaction_idx on public.ruul_paiements (ruul_transaction_id) where ruul_transaction_id is not null;

-- Seul Max crée un paiement (réglage ruul_api.payeurs).
update public.reglages
   set valeur = valeur || '{"payeurs": ["dde5916a-89b8-4fc3-897b-dc7f0d88e20e"]}'::jsonb
 where cle = 'ruul_api' and not (valeur ? 'payeurs');

-- Un envoi au résultat inconnu gèle le lot : pas de recalcul ni de validation tant que Max n'a pas relancé l'envoi.
do $p$
declare
  d text := pg_get_functiondef('public.ruul_lot_preparer(date)'::regprocedure);
  avant text := $a$  if v_lot.statut <> 'prepare' then
    return jsonb_build_object('ok', false, 'erreur', 'lot ' || v_lot.statut || ' : verrouillé');
  end if;$a$;
begin
  if position('0738' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0738 : ruul_lot_preparer ne correspond pas'; end if;
  execute replace(d, avant, avant || $a$
  if v_lot.ruul_envoi->>'resultat' = 'inconnu' then /* 0738 */
    return jsonb_build_object('ok', false, 'erreur', 'paiement Ruul envoyé sans réponse claire : clique à nouveau « Créer le paiement Ruul » (même envoi, sans doublon)');
  end if;$a$);
end
$p$;

-- Avant l'appel : la clé et le corps à envoyer. Renvoie { deja } si le lot a déjà son paiement Ruul,
-- l'envoi précédent à l'identique s'il est resté sans réponse claire, sinon un envoi neuf.
create or replace function public.ruul_lot_envoi_preparer(p_semaine date, p_user uuid, p_env text, p_corps jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lot public.ruul_lots;
  v_envoi jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'réservé au serveur'; end if;
  select * into v_lot from public.ruul_lots where semaine = p_semaine for update;
  if v_lot.id is null then return jsonb_build_object('ok', false, 'erreur', 'lot introuvable'); end if;
  if v_lot.ruul_batch_id is not null then
    return jsonb_build_object('ok', true, 'deja', v_lot.ruul_batch_id);
  end if;
  if v_lot.statut <> 'prepare' then return jsonb_build_object('ok', false, 'erreur', 'lot déjà ' || v_lot.statut); end if;
  if v_lot.ruul_envoi is not null and v_lot.ruul_envoi->>'resultat' = 'inconnu' then
    -- Le dernier envoi n'a pas eu de réponse claire : on renvoie EXACTEMENT le même (même clé, même corps).
    v_envoi := v_lot.ruul_envoi || jsonb_build_object('essais', coalesce((v_lot.ruul_envoi->>'essais')::int, 1) + 1, 'tente_at', now());
  else
    v_envoi := jsonb_build_object('cle', gen_random_uuid()::text, 'corps', p_corps, 'env', p_env, 'par', p_user,
                                  'resultat', 'inconnu', 'essais', 1, 'tente_at', now());
  end if;
  update public.ruul_lots set ruul_envoi = v_envoi where id = v_lot.id;
  return jsonb_build_object('ok', true, 'cle', v_envoi->>'cle', 'corps', v_envoi->'corps', 'env', v_envoi->>'env',
                            'renvoi', (v_envoi->>'essais')::int > 1);
end;
$function$;

-- Une réponse de Ruul (création ou relecture d'un batch) : statut du lot, virement à faire, statut de chaque ligne.
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
       set ruul_transaction_id = (r->>'transactionId')::bigint,
           ruul_statut = r->>'status',
           ruul_echec = r#>>'{payout,failureReason}',
           ruul_maj_at = now(),
           maj_at = now()
      from public.profiles pr
     where pr.id = rp.poster_id and rp.lot_id = v_lot.id and rp.statut in ('a_payer', 'paye')
       and lower(btrim(pr.ruul_email)) = lower(btrim(r->>'email'));
    if found then n := n + 1; else inconnus := inconnus || (r->>'transactionId'); end if;
  end loop;
  return jsonb_build_object('ok', true, 'batch', (p_batch->>'batchId')::bigint, 'lignes', n, 'sans_ligne', inconnus);
end;
$function$;

-- Un refus net de Ruul (4xx hors « requête en cours ») : le prochain clic repartira d'une clé neuve.
create or replace function public.ruul_lot_envoi_refuse(p_semaine date, p_http int, p_erreur text)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.ruul_lots
     set ruul_envoi = ruul_envoi || jsonb_build_object('resultat', 'refuse', 'http', p_http, 'erreur', left(p_erreur, 500), 'refuse_at', now())
   where semaine = p_semaine and ruul_batch_id is null and ruul_envoi is not null
     and coalesce(auth.role(), '') = 'service_role';
$$;

-- Le posteur : ses semaines payées par Ruul (montant, détail, statut), les plus récentes d'abord.
create or replace function public.ruul_mes_paiements()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'semaine', rp.semaine, 'montant', rp.montant, 'bonus', rp.bonus, 'total', rp.montant + rp.bonus,
           'faits', rp.faits, 'prevus', rp.prevus, 'nb_comptes', rp.nb_comptes, 'tarif', rp.tarif, 'retenue', rp.retenue,
           'statut', case
             when rp.statut = 'paye' then 'paid'
             when rp.ruul_statut = 'PAID' then 'paid'
             when rp.ruul_statut in ('FAILED', 'RETURNED') then 'problem'
             when rp.ruul_statut = 'AWAITING_RECIPIENT' then 'waiting_setup'
             when rp.ruul_statut is not null then 'processing'
             when rp.statut = 'a_payer' then 'scheduled'
             when rp.statut = 'reporte' and pr.ruul_onboarding is distinct from 'READY' then 'waiting_setup'
             when rp.statut = 'reporte' then 'scheduled'
             else 'none' end,
           'paye_at', rp.paye_at) order by rp.semaine desc), '[]'::jsonb)
    from public.ruul_paiements rp
    join public.profiles pr on pr.id = rp.poster_id
   where rp.poster_id = auth.uid()
     and (rp.statut <> 'annule' or rp.raison_report like '0 post%')
     and not (rp.statut = 'annule' and rp.raison_report like 'déjà payé%');
$$;

revoke all on function public.ruul_lot_envoi_preparer(date, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.ruul_lot_batch_noter(date, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.ruul_lot_envoi_refuse(date, int, text) from public, anon, authenticated;
revoke all on function public.ruul_mes_paiements() from public, anon;
grant execute on function public.ruul_lot_envoi_preparer(date, uuid, text, jsonb) to service_role;
grant execute on function public.ruul_lot_batch_noter(date, jsonb, uuid) to service_role;
grant execute on function public.ruul_lot_envoi_refuse(date, int, text) to service_role;
grant execute on function public.ruul_mes_paiements() to authenticated;
