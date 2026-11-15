-- 0715 : Pay BOT (refonte du support, Phases 4 et 6 ; Max, 13/11).
-- Pay BOT (Grok) finance les milestones de la liste OS « à financer » (paie_a_financer) :
--   - liste : chaque milestone dit s'il peut la financer seul (ok) ou s'il doit attendre l'OK de Max (raison) ;
--     seul : Pay BOT en « agir » (page Contrôle), montant du barème (7, 10, 14, 20, 28 $), sous le plafond par
--     milestone et sous le plafond du jour. En « proposer » : seulement ce que Max a validé.
--   - finance : il marque une milestone financée (revérifiée ici) ; noté au journal avec le montant.
--   - attente : il demande l'OK de Max (une proposition dans Contrôle ; « Faire » = OK).
-- Le bot n'écrit jamais aux posteurs. Additif : trois colonnes, trois fonctions (service_role seulement).

alter table public.paie_a_financer add column if not exists ok_max_at timestamptz;
alter table public.paie_a_financer add column if not exists ok_max_par uuid;
alter table public.paie_a_financer add column if not exists finance_par text;

create or replace function public.pay_bot_verdict(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  f public.paie_a_financer;
  c jsonb := coalesce((select valeur from public.reglages where cle = 'controle'), '{}'::jsonb);
  v_mode text := case when coalesce((c->>'stop')::boolean, false) then 'eteint' else coalesce(c#>>'{agents,pay_bot}', 'proposer') end;
  v_ms numeric := coalesce((c#>>'{pay,plafond_milestone}')::numeric, 30);
  v_jour numeric := coalesce((c#>>'{pay,plafond_jour}')::numeric, 300);
  v_debut timestamptz := (date_trunc('day', now() at time zone 'Europe/Paris')) at time zone 'Europe/Paris';
  v_deja numeric;
begin
  select * into f from public.paie_a_financer where id = p_id;
  if not found or f.finance_at is not null or f.retire_at is not null then return jsonb_build_object('ok', false, 'raison', 'pas à financer'); end if;
  if v_mode = 'eteint' then return jsonb_build_object('ok', false, 'raison', 'Pay BOT éteint'); end if;
  if f.ok_max_at is not null then return jsonb_build_object('ok', true, 'raison', 'validé par Max'); end if;
  if v_mode <> 'agir' then return jsonb_build_object('ok', false, 'raison', 'mode proposer : attendre l''OK de Max'); end if;
  if f.montant is null or f.montant not in (7, 10, 14, 20, 28) then return jsonb_build_object('ok', false, 'raison', 'montant hors barème'); end if;
  if f.montant > v_ms then return jsonb_build_object('ok', false, 'raison', 'au-dessus du plafond par milestone'); end if;
  select coalesce(sum(montant), 0) into v_deja from public.journal_auto
   where qui = 'pay_bot' and quoi = 'financer' and mode = 'agir' and annule_at is null and at >= v_debut;
  if v_deja + f.montant > v_jour then return jsonb_build_object('ok', false, 'raison', 'plafond du jour atteint'); end if;
  return jsonb_build_object('ok', true, 'raison', 'barème');
end;
$$;

create or replace function public.pay_bot_liste()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('ok', true, 'consigne',
      'Fund on Upwork ONLY the milestones with ok = true, then call finance with their id. For the others, call attente with the id and the reason, and do nothing else. Never write to posters.',
      'milestones', coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id, 'contrat_id', f.contrat_id, 'jalon_id', f.jalon_id, 'nom', f.nom, 'montant', f.montant, 'semaine', f.semaine,
        'lien', 'https://www.upwork.com/nx/wm/workroom/' || f.contrat_id || '/overview',
        'ok', (public.pay_bot_verdict(f.id)->>'ok')::boolean, 'raison', public.pay_bot_verdict(f.id)->>'raison') order by f.cree_at), '[]'::jsonb))
    from public.paie_a_financer f
   where f.finance_at is null and f.retire_at is null;
$$;

create or replace function public.pay_bot_finance(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb := public.pay_bot_verdict(p_id);
  f public.paie_a_financer;
begin
  if not (v->>'ok')::boolean then
    insert into public.journal_auto (qui, quoi, mode, resultat, details) values ('pay_bot', 'financer', 'bloque', 'refusé : ' || (v->>'raison'), jsonb_build_object('id', p_id));
    return jsonb_build_object('ok', false, 'error', v->>'raison');
  end if;
  update public.paie_a_financer set finance_at = now(), finance_par = 'pay_bot' where id = p_id returning * into f;
  insert into public.journal_auto (qui, quoi, mode, poster_id, canal, montant, resultat, details)
  values ('pay_bot', 'financer', 'agir', f.poster_id, 'upwork', f.montant, coalesce(f.nom, 'milestone') || ' financée (contrat ' || f.contrat_id || ')',
          jsonb_build_object('id', f.id, 'contrat_id', f.contrat_id, 'jalon_id', f.jalon_id));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pay_bot_attente(p_id uuid, p_raison text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.paie_a_financer;
begin
  select * into f from public.paie_a_financer where id = p_id and finance_at is null and retire_at is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'pas à financer'); end if;
  if exists (select 1 from public.journal_auto where mode = 'proposer' and quoi = 'pay_ok' and details->>'valeur' = p_id::text and annule_at is null and details->>'fait' is null) then
    return jsonb_build_object('ok', true, 'deja', true);
  end if;
  insert into public.journal_auto (qui, quoi, mode, poster_id, canal, montant, resultat, details)
  values ('pay_bot', 'pay_ok', 'proposer', f.poster_id, 'upwork', f.montant,
          left(coalesce(f.nom, 'milestone') || ' (contrat ' || f.contrat_id || ') : ' || coalesce(nullif(btrim(p_raison), ''), 'OK de Max demandé'), 500),
          jsonb_build_object('action', 'pay_ok', 'valeur', f.id::text));
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.pay_bot_verdict(uuid) from public, anon, authenticated;
revoke execute on function public.pay_bot_liste() from public, anon, authenticated;
revoke execute on function public.pay_bot_finance(uuid) from public, anon, authenticated;
revoke execute on function public.pay_bot_attente(uuid, text) from public, anon, authenticated;
grant execute on function public.pay_bot_verdict(uuid) to service_role;
grant execute on function public.pay_bot_liste() to service_role;
grant execute on function public.pay_bot_finance(uuid) to service_role;
grant execute on function public.pay_bot_attente(uuid, text) to service_role;
