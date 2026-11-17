-- 0740 : paie Ruul — semaines « à vérifier » et historique des paiements Ruul (Max, 17/11).
-- Max a annulé le lot #67262968 (165 $) sur Ruul : on ne paie que la semaine du 09/11 ; les semaines du 26/10
-- et du 02/11 des 6 premiers posteurs restent hors paiement, « à vérifier » (un paiement manuel Ruul du 2/11,
-- #61138248, net 116,58 $, couvre peut-être la semaine du 26/10).
-- 1. ruul_paiements.verif_raison : une ligne à vérifier n'entre dans aucun lot (ruul_lot_preparer l'ignore)
--    tant que Max n'a pas tranché (ruul_verif_decider : « payer » la remet dans le prochain lot, « déjà payé »
--    l'annule avec la référence Ruul).
-- 2. ruul_lots.ruul_annules : les paiements Ruul annulés (historique).
-- 3. ruul_transactions : l'historique Ruul (GET /ruul-api/transactions), une ligne par posteur payé
--    (les paiements groupés sont dépliés) ; ruul_verif_liste croise ce qui est dû et ce que Ruul a déjà payé.
-- Additif : colonnes, tables, fonctions ; ruul_lot_preparer patché en place.

alter table public.ruul_lots add column if not exists ruul_annules jsonb not null default '[]'::jsonb;
alter table public.ruul_paiements add column if not exists verif_raison text;

do $p$
declare
  d text := pg_get_functiondef('public.ruul_lot_preparer(date)'::regprocedure);
  avant text := $a$   where pr.id = rp.poster_id and rp.statut = 'reporte' and rp.semaine < v_semaine and rp.lot_id is null$a$;
begin
  if position('0740' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0740 : ruul_lot_preparer ne correspond pas'; end if;
  execute replace(d, avant, avant || $a$
     and rp.verif_raison is null /* 0740 : à vérifier par Max, jamais payé d'office */$a$);
end
$p$;

create table if not exists public.ruul_transactions (
  id bigint primary key,
  parent_id bigint,
  tno text,
  email text,
  contractor_id bigint,
  nom text,
  description text,
  tx_statut text,
  statut text,
  montant numeric,
  devise text,
  issue_date timestamptz,
  sent_at timestamptz,
  corps jsonb not null,
  lu_at timestamptz not null default now()
);
create index if not exists ruul_transactions_email on public.ruul_transactions (lower(email));
alter table public.ruul_transactions enable row level security;
drop policy if exists ruul_transactions_admin on public.ruul_transactions;
create policy ruul_transactions_admin on public.ruul_transactions for select using (public.is_admin());

-- Une page de GET /transactions : chaque transaction, ou chacun de ses enfants pour un paiement groupé.
create or replace function public.ruul_transactions_importer(p_data jsonb)
returns int
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t jsonb;
  c jsonb;
  n int := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'réservé au serveur'; end if;
  for t in select * from jsonb_array_elements(coalesce(p_data, '[]'::jsonb)) loop
    for c in select * from jsonb_array_elements(
               case when jsonb_typeof(t->'children') = 'array' and jsonb_array_length(t->'children') > 0 then t->'children'
                    else jsonb_build_array(t) end) loop
      insert into public.ruul_transactions as x (id, parent_id, tno, email, contractor_id, nom, description, tx_statut, statut,
                                                 montant, devise, issue_date, sent_at, corps, lu_at)
      values ((c->>'id')::bigint,
              case when (c->>'id') is distinct from (t->>'id') then (t->>'id')::bigint end,
              coalesce(c->>'tNo', t->>'tNo'),
              lower(btrim(c#>>'{contractor,email}')),
              nullif(c#>>'{contractor,id}', '')::bigint,
              c#>>'{contractor,name}',
              coalesce(c->>'description', t->>'description'),
              coalesce(c->>'status', t->>'status'),
              coalesce(c#>>'{payout,status}', t#>>'{payout,status}'),
              nullif(c#>>'{payout,payoutAmount}', '')::numeric,
              coalesce(c#>>'{payout,currencyCode}', t#>>'{payout,currencyCode}'),
              nullif(coalesce(c->>'issueDate', t->>'issueDate'), '')::timestamptz,
              nullif(c#>>'{payout,sentAt}', '')::timestamptz,
              c, now())
      on conflict (id) do update
         set parent_id = excluded.parent_id, tno = excluded.tno, email = excluded.email, contractor_id = excluded.contractor_id,
             nom = excluded.nom, description = excluded.description, tx_statut = excluded.tx_statut, statut = excluded.statut,
             montant = excluded.montant, devise = excluded.devise, issue_date = excluded.issue_date, sent_at = excluded.sent_at,
             corps = excluded.corps, lu_at = now();
      n := n + 1;
    end loop;
  end loop;
  return n;
end;
$function$;

-- Ce qui reste dû aux posteurs Ruul (lignes reportées, à vérifier ou à payer) face à ce que Ruul a déjà versé.
create or replace function public.ruul_verif_liste()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(x order by x->>'nom'), '[]'::jsonb) from (
    select jsonb_build_object(
      'poster_id', pr.id,
      'nom', coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
      'ruul_email', pr.ruul_email,
      'ruul_onboarding', pr.ruul_onboarding,
      'du', (select jsonb_agg(jsonb_build_object('semaine', rp.semaine, 'montant', rp.montant + rp.bonus, 'faits', rp.faits,
                                                 'statut', rp.statut, 'verif', rp.verif_raison) order by rp.semaine)
               from public.ruul_paiements rp
              where rp.poster_id = pr.id and rp.statut in ('reporte', 'a_payer') and rp.montant + rp.bonus > 0),
      'total_du', (select sum(rp.montant + rp.bonus) from public.ruul_paiements rp
                    where rp.poster_id = pr.id and rp.statut in ('reporte', 'a_payer') and rp.montant + rp.bonus > 0),
      'a_verifier', (select sum(rp.montant + rp.bonus) from public.ruul_paiements rp
                      where rp.poster_id = pr.id and rp.verif_raison is not null and rp.statut = 'reporte'),
      'ruul', (select jsonb_agg(jsonb_build_object('tno', t.tno, 'date', coalesce(t.sent_at, t.issue_date), 'montant', t.montant,
                                                   'devise', t.devise, 'statut', t.statut, 'description', t.description)
                                order by coalesce(t.sent_at, t.issue_date))
                 from public.ruul_transactions t where t.email = lower(btrim(pr.ruul_email))),
      'ruul_paye', (select sum(t.montant) from public.ruul_transactions t
                     where t.email = lower(btrim(pr.ruul_email)) and t.statut = 'PAID')) x
      from public.profiles pr
     where public.is_admin() and pr.canal_paie = 'ruul'
       and (exists (select 1 from public.ruul_paiements rp where rp.poster_id = pr.id and rp.statut in ('reporte', 'a_payer') and rp.montant + rp.bonus > 0)
            or exists (select 1 from public.ruul_transactions t where t.email = lower(btrim(pr.ruul_email))))) s;
$$;

-- La décision de Max sur une semaine à vérifier : « payer » (prochain lot) ou « deja_paye » (annulée, avec la référence).
create or replace function public.ruul_verif_decider(p_poster uuid, p_semaine date, p_decision text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  n int;
begin
  if not public.is_admin() then raise exception 'réservé à l''admin'; end if;
  if p_decision not in ('payer', 'deja_paye') then raise exception 'décision inconnue'; end if;
  update public.ruul_paiements
     set verif_raison = null,
         statut = case when p_decision = 'deja_paye' then 'annule' else statut end,
         raison_report = case when p_decision = 'deja_paye'
                              then 'déjà payé sur Ruul' || coalesce(' (' || nullif(btrim(p_note), '') || ')', '') || ' — Max, ' || to_char(now() at time zone 'Europe/Paris', 'DD/MM')
                              else 'à payer au prochain lot (Max)' end,
         maj_at = now()
   where poster_id = p_poster and semaine = p_semaine and statut = 'reporte' and verif_raison is not null;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n > 0, 'lignes', n);
end;
$function$;

revoke all on function public.ruul_transactions_importer(jsonb) from public, anon, authenticated;
revoke all on function public.ruul_verif_liste() from public, anon;
revoke all on function public.ruul_verif_decider(uuid, date, text, text) from public, anon;
grant execute on function public.ruul_transactions_importer(jsonb) to service_role;
grant execute on function public.ruul_verif_liste() to authenticated;
grant execute on function public.ruul_verif_decider(uuid, date, text, text) to authenticated;
