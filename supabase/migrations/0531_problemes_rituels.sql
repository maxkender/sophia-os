-- 0531 — Synchroniser Problèmes avec jeudi, samedi, dimanche et la paie (03/11).
-- Parties 2 à 5 (la partie 1, Kill samedi, est 0530).
--
-- 2. Doubler / Recréer depuis Problèmes : le clic prépare la décision dans la
--    table du rituel concerné, rien n'est exécuté :
--      Doubler → samedi (samedi_brouillons, choix « double », source problemes) ;
--      Recréer → jeudi (jeudi_brouillons, nouvelle table jumelle de
--      samedi_brouillons, choix « recreate »).
--    Les pages jeudi / samedi la pré-cochent (« Décidé le JJ/MM dans
--    Problèmes ») ; pas de 2e proposition (samedi : la proposition de l'OS est
--    reprise si elle existe).
--    Inversement, une décision prise jeudi, samedi ou dimanche ferme les cartes
--    Problèmes du posteur sur le même sujet (« Décidé jeudi : recreate ») ;
--    « Kill Saturday » choisi jeudi met la carte en « Kill prévu samedi ».
-- 3. problemes_resume_posteurs : par posteur, le nombre de cartes ouvertes, le
--    diagnostic en une ligne, la carte, le Kill samedi prévu (badges des pages
--    jeudi, samedi, dimanche).
-- 4. Paie : paie_decisions_sources dit aussi Double, Recréer et Postpone.
-- 5. Chaque carte fermée par un rituel est notée dans bot_feedback (juste si
--    le bot proposait la même chose).
--
-- Les bots peuvent proposer « double ». Additif : 1 table, 3 colonnes, des
-- fonctions et des déclencheurs (qui ne bloquent jamais le rituel : une erreur
-- est seulement notée en avertissement). Aucune ligne existante supprimée.

create table if not exists public.jeudi_brouillons (
  lundi date not null,
  compte_id uuid not null references public.comptes(id),
  choix text not null check (choix in ('nudge', 'recreate', 'kill_samedi', 'rien')),
  raison jsonb,
  par uuid,
  maj_at timestamptz not null default now(),
  primary key (lundi, compte_id)
);
alter table public.jeudi_brouillons enable row level security;

alter table public.problemes add column if not exists rituel_choix text;
alter table public.problemes add column if not exists rituel_lundi date;
alter table public.problemes add column if not exists rituel_at timestamptz;

-- Le lundi de la semaine du prochain jeudi (Paris) ; du vendredi au dimanche : la semaine suivante.
create or replace function public.lundi_du_prochain_jeudi(p_jour date default (now() at time zone 'Europe/Paris')::date)
returns date
language sql
immutable
as $$
  select p_jour - (extract(isodow from p_jour)::int - 1) + case when extract(isodow from p_jour) > 4 then 7 else 0 end;
$$;

-- Doubler (samedi) ou Recréer (jeudi) depuis une carte : la décision est préparée, rien n'est exécuté.
create or replace function public.probleme_rituel(p_id uuid, p_choix text, p_annuler boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.problemes;
  v_auj date := (now() at time zone 'Europe/Paris')::date;
  v_lundi date;
  v_compte uuid;
  v_n int := 0;
  v_bot text;
  v_action text := case p_choix when 'double' then 'double' when 'recreate' then 'recreate' end;
begin
  if not public.is_admin() then
    raise exception 'probleme_rituel : réservé à l''admin' using errcode = '42501';
  end if;
  if p_choix not in ('double', 'recreate') then raise exception 'choix « % » refusé (double, recreate)', p_choix; end if;
  select * into p from public.problemes where id = p_id for update;
  if not found then raise exception 'problème introuvable'; end if;
  if p.poster_id is null then raise exception 'pas de posteur sur cette carte'; end if;

  if p_annuler then
    if p.rituel_choix = 'double' then
      update public.samedi_brouillons b set choix = 'keep', par = auth.uid(), maj_at = now(),
             raison = coalesce(b.raison, '{}'::jsonb) || jsonb_build_object('annule_le', v_auj)
       where b.lundi = p.rituel_lundi and b.raison->>'probleme_id' = p.id::text;
    elsif p.rituel_choix = 'recreate' then
      update public.jeudi_brouillons b set choix = 'rien', par = auth.uid(), maj_at = now(),
             raison = coalesce(b.raison, '{}'::jsonb) || jsonb_build_object('annule_le', v_auj)
       where b.lundi = p.rituel_lundi and b.raison->>'probleme_id' = p.id::text;
    end if;
    get diagnostics v_n = row_count;
    update public.problemes set rituel_choix = null, rituel_lundi = null, rituel_at = null, maj_at = now(),
           journal = journal || jsonb_build_object('at', now(), 'par', auth.uid(), 'action', 'rituel_annule', 'choix', p.rituel_choix)
     where id = p.id;
    return jsonb_build_object('annule', true, 'comptes', v_n);
  end if;

  -- Le compte : celui de la carte (1er compte perso actif), comme la ligne jeudi / samedi.
  select c.id into v_compte from public.comptes c
   where c.poster_id = p.poster_id and c.is_active and coalesce(c.type_compte, 'perso') = 'perso'
   order by c.created_at limit 1;
  if v_compte is null then raise exception 'aucun compte actif'; end if;

  if p_choix = 'double' then
    v_lundi := public.lundi_du_prochain_samedi(v_auj);
    insert into public.samedi_brouillons (lundi, compte_id, choix, raison, par, maj_at)
    values (v_lundi, v_compte, 'double',
            jsonb_build_object('source', 'problemes', 'probleme_id', p.id, 'decide_le', v_auj, 'choix_problemes', 'double',
                               'note', 'Double décidé dans Problèmes le ' || to_char(v_auj, 'DD/MM')),
            auth.uid(), now())
    on conflict (lundi, compte_id) do update
      set choix = 'double', par = excluded.par, maj_at = now(),
          raison = (coalesce(samedi_brouillons.raison, '{}'::jsonb) || excluded.raison) - 'annule_le';
  else
    v_lundi := public.lundi_du_prochain_jeudi(v_auj);
    insert into public.jeudi_brouillons (lundi, compte_id, choix, raison, par, maj_at)
    values (v_lundi, v_compte, 'recreate',
            jsonb_build_object('source', 'problemes', 'probleme_id', p.id, 'decide_le', v_auj),
            auth.uid(), now())
    on conflict (lundi, compte_id) do update
      set choix = 'recreate', par = excluded.par, maj_at = now(),
          raison = (coalesce(jeudi_brouillons.raison, '{}'::jsonb) || excluded.raison) - 'annule_le';
  end if;

  update public.problemes
     set rituel_choix = p_choix, rituel_lundi = v_lundi, rituel_at = now(), maj_at = now(),
         journal = journal || jsonb_build_object('at', now(), 'par', auth.uid(), 'action', 'rituel', 'choix', p_choix, 'lundi', v_lundi)
   where id = p.id;

  v_bot := case when p.propose_par in ('new_cohort_bot', 'control_bot', 'pay_bot') then p.propose_par else p.proprietaire end;
  if v_bot in ('new_cohort_bot', 'control_bot', 'pay_bot') then
    insert into public.bot_feedback (probleme_id, bot, categorie, groupe, verdict, raison, diagnostic_du_bot, action_du_bot, donne_par, choix)
    values (p.id, v_bot, p.categorie, p.groupe,
            case when p.proposition_action = v_action then 'juste' else 'mauvaise_action' end,
            case when p.proposition_action = v_action then null
                 else 'Max a choisi « ' || p_choix || ' » au lieu de « ' || coalesce(p.proposition_action, 'rien') || ' »' end,
            case when p.diagnostic_par = p.propose_par then p.diagnostic end,
            p.proposition_action, auth.uid(), p_choix);
  end if;
  return jsonb_build_object('choix', p_choix, 'lundi', v_lundi, 'jour', case when p_choix = 'double' then v_lundi + 5 else v_lundi + 3 end);
end;
$$;
revoke all on function public.probleme_rituel(uuid, text, boolean) from public, anon;
grant execute on function public.probleme_rituel(uuid, text, boolean) to authenticated;

create or replace function public.jeudi_brouillons_lire(p_lundi date)
returns table (compte_id uuid, choix text, raison jsonb, maj_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'jeudi_brouillons_lire : réservé à l''admin' using errcode = '42501';
  end if;
  return query select b.compte_id, b.choix, b.raison, b.maj_at from public.jeudi_brouillons b where b.lundi = p_lundi;
end;
$$;
revoke all on function public.jeudi_brouillons_lire(date) from public, anon;
grant execute on function public.jeudi_brouillons_lire(date) to authenticated;

-- 3. Les cartes ouvertes de chaque posteur (badge des pages jeudi, samedi, dimanche).
create or replace function public.problemes_resume_posteurs()
returns table (poster_id uuid, n integer, probleme_id uuid, diagnostic text, kill_samedi_lundi date, rituel_choix text, rituel_lundi date)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'problemes_resume_posteurs : réservé à l''admin' using errcode = '42501';
  end if;
  return query
  select x.poster_id, x.n, x.id, x.diag, x.kill, x.rc, x.rl
    from (
      select p.poster_id, p.id, left(coalesce(nullif(btrim(p.diagnostic), ''), p.question, p.resume), 160) as diag,
             count(*) over (partition by p.poster_id)::int as n,
             max(p.kill_samedi_lundi) over (partition by p.poster_id) as kill,
             max(p.rituel_choix) over (partition by p.poster_id) as rc,
             max(p.rituel_lundi) over (partition by p.poster_id) as rl,
             row_number() over (partition by p.poster_id
                                order by case p.niveau when 'urgent' then 0 when 'aujourdhui' then 1 else 2 end, p.created_at) as rang
        from public.problemes p
       where p.statut = 'ouvert' and p.poster_id is not null
    ) x
   where x.rang = 1;
end;
$$;
revoke all on function public.problemes_resume_posteurs() from public, anon;
grant execute on function public.problemes_resume_posteurs() to authenticated;

-- 2 (inverse) + 5 : une décision d'un rituel ferme les cartes du même sujet et le note pour les bots.
create or replace function public.problemes_fermer_par_rituel(
  p_poster uuid, p_rituel text, p_decision text, p_actions text[], p_categories text[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
  v_bot text;
  v_juste boolean;
begin
  for r in select * from public.problemes p
            where p.poster_id = p_poster and p.statut = 'ouvert' and p.question is null
              and p.categorie not in ('paie', 'kill_contrat')
              and (p.proposition_action = any (p_actions) or p.categorie = any (p_categories)
                   or (p_decision = 'kill' and p.kill_samedi_lundi is not null)
                   or p.rituel_choix = p_decision) loop
    update public.problemes
       set statut = 'valide', ferme_raison = 'Décidé ' || p_rituel || ' : ' || p_decision, ferme_at = now(), maj_at = now(),
           journal = journal || jsonb_build_object('at', now(), 'par', p_rituel, 'action', 'decide_' || p_rituel, 'decision', p_decision)
     where id = r.id;
    n := n + 1;
    v_bot := case when r.propose_par in ('new_cohort_bot', 'control_bot', 'pay_bot') then r.propose_par else r.proprietaire end;
    v_juste := r.proposition_action = p_decision or (p_decision = 'kill' and (r.proposition_action = 'kill' or r.categorie = 'stop'))
               or (p_decision = 'keep' and r.proposition_action is distinct from 'kill');
    if v_bot in ('new_cohort_bot', 'control_bot', 'pay_bot')
       and not exists (select 1 from public.bot_feedback f where f.probleme_id = r.id and f.choix = p_rituel || ':' || p_decision) then
      insert into public.bot_feedback (probleme_id, bot, categorie, groupe, verdict, raison, diagnostic_du_bot, action_du_bot, donne_par, choix)
      values (r.id, v_bot, r.categorie, r.groupe,
              case when v_juste then 'juste' else 'mauvaise_action' end,
              case when v_juste then null
                   else 'Décidé ' || p_rituel || ' : ' || p_decision || ' (le bot proposait « ' || coalesce(r.proposition_action, 'rien') || ' »)' end,
              case when r.diagnostic_par = r.propose_par then r.diagnostic end,
              r.proposition_action, auth.uid(), p_rituel || ':' || p_decision);
    end if;
  end loop;
  return n;
end;
$$;
revoke all on function public.problemes_fermer_par_rituel(uuid, text, text, text[], text[]) from public, anon, authenticated;

create or replace function public.problemes_sync_ckd()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.decision is null or new.decision is not distinct from old.decision then return new; end if;
  begin
    case new.decision
      when 'ne_pas_renouveler' then
        perform public.problemes_fermer_par_rituel(new.poster_id, new.type, 'kill', array['kill'], array['stop', 'zero_post', 'absence']);
      when 'doubler' then
        perform public.problemes_fermer_par_rituel(new.poster_id, new.type, 'double', array['double'], array['demande_2e_compte']);
      when 'recreer' then
        perform public.problemes_fermer_par_rituel(new.poster_id, new.type, 'recreate', array['recreate', 'reread_tiktok'], array['low_views']);
      when 'garder', 'pas_maintenant' then
        if new.type = 'samedi' then
          perform public.problemes_fermer_par_rituel(new.poster_id, new.type, 'keep', array['kill', 'double'], array['stop']);
        end if;
      else null;
    end case;
  exception when others then
    raise warning 'problemes_sync_ckd : %', sqlerrm;
  end;
  return new;
end;
$$;
create or replace trigger problemes_sync_ckd after update of decision on public.ckd_propositions
  for each row execute function public.problemes_sync_ckd();

create or replace function public.problemes_sync_dimanche()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if tg_table_name = 'debut_choix' then
      if new.choix = 'reporter' and (tg_op = 'INSERT' or old.choix is distinct from 'reporter') then
        perform public.problemes_fermer_par_rituel(new.poster_id, 'dimanche', 'postpone', array['postpone'], array['bloque_etape']);
      end if;
    elsif tg_table_name = 'dimanche_kills' then
      perform public.problemes_fermer_par_rituel(new.poster_id, 'dimanche', 'kill', array['kill'], array['stop', 'bloque_etape', 'zero_post']);
    elsif tg_table_name = 'ckd_recreations' then
      perform public.problemes_fermer_par_rituel(new.poster_id,
        case when extract(isodow from now() at time zone 'Europe/Paris') = 6 then 'samedi' else 'jeudi' end,
        'recreate', array['recreate', 'reread_tiktok'], array['low_views']);
    end if;
  exception when others then
    raise warning 'problemes_sync_dimanche : %', sqlerrm;
  end;
  return new;
end;
$$;
create or replace trigger problemes_sync_debut after insert or update of choix on public.debut_choix
  for each row execute function public.problemes_sync_dimanche();
create or replace trigger problemes_sync_dimanche_kill after insert on public.dimanche_kills
  for each row execute function public.problemes_sync_dimanche();
create or replace trigger problemes_sync_recreation after insert on public.ckd_recreations
  for each row execute function public.problemes_sync_dimanche();

-- « Kill Saturday » choisi jeudi : les cartes Kill / STOP du posteur passent « Kill prévu samedi » (et inversement).
create or replace function public.problemes_sync_jeudi_kill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if new.annule_at is null then
      update public.problemes p
         set kill_samedi_lundi = new.lundi, kill_samedi_at = coalesce(p.kill_samedi_at, now()), maj_at = now(),
             journal = journal || jsonb_build_object('at', now(), 'par', 'jeudi', 'action', 'kill_samedi', 'samedi', new.lundi + 5)
       where p.poster_id = new.poster_id and p.statut = 'ouvert' and p.kill_samedi_lundi is null
         and (p.proposition_action = 'kill' or p.categorie = 'stop');
    else
      update public.problemes p
         set kill_samedi_lundi = null, kill_samedi_at = null, maj_at = now()
       where p.poster_id = new.poster_id and p.statut = 'ouvert' and p.kill_samedi_lundi = new.lundi
         and p.kill_samedi_par is null;
    end if;
  exception when others then
    raise warning 'problemes_sync_jeudi_kill : %', sqlerrm;
  end;
  return new;
end;
$$;
create or replace trigger problemes_sync_jeudi_kill after insert or update of annule_at on public.jeudi_kills
  for each row execute function public.problemes_sync_jeudi_kill();

-- La carte montre « Doubler prévu samedi » / « Recréer prévu jeudi ».
do $p$
declare
  v_def text := pg_get_functiondef('public.problemes_liste(text)'::regprocedure);
  v_a text := $q$'kill_samedi_lundi', p.kill_samedi_lundi, 'kill_samedi_at', p.kill_samedi_at,$q$;
begin
  if position(v_a in v_def) = 0 then raise exception '0531 : problemes_liste ne correspond pas'; end if;
  execute replace(v_def, v_a, v_a || $q$ 'rituel_choix', p.rituel_choix, 'rituel_lundi', p.rituel_lundi,$q$);
end;
$p$;

-- Les bots peuvent proposer « double » (Doubler, décidé samedi).
do $p$
declare
  f text;
  v_def text;
  v_a text := $q$'saturday', 'close', 'none', 'decision'];$q$;
begin
  foreach f in array array['public.probleme_bot(text,text,jsonb)', 'public.probleme_decision_creer(jsonb)'] loop
    v_def := pg_get_functiondef(f::regprocedure);
    if position(v_a in v_def) = 0 then raise exception '0531 : % ne correspond pas', f; end if;
    execute replace(v_def, v_a, $q$'saturday', 'close', 'none', 'decision', 'double'];$q$);
  end loop;
end;
$p$;

-- 4. Paie : toutes les décisions qui touchent la semaine, avec leur source.
create or replace function public.paie_decisions_sources(p_lundi date)
returns table (poster_id uuid, decision text, texte text, decide_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'paie_decisions_sources : réservé à l''admin' using errcode = '42501';
  end if;
  return query
  with d as (
    -- Kill / Double préparés pour le samedi de la semaine (Problèmes, fiche Posters, samedi).
    select c.poster_id, b.choix as decision,
           case when b.choix in ('kill', 'kill_np') then 'Kill samedi ' else 'Double samedi ' end || to_char(b.lundi + 5, 'DD/MM')
             || case when b.raison->>'source' = 'problemes'
                     then ' (décidé dans Problèmes le ' || to_char((b.raison->>'decide_le')::date, 'DD/MM') || ')'
                     when b.raison->>'note' is not null then ' (préparé le ' || to_char(b.maj_at at time zone 'Europe/Paris', 'DD/MM') || ')'
                     else '' end
             || case when b.choix = 'double' then ' : +1 milestone (2e compte) dès son 1er post avec lien' else '' end as texte,
           b.maj_at as decide_at
      from public.samedi_brouillons b join public.comptes c on c.id = b.compte_id
     where b.lundi = p_lundi and b.choix in ('kill', 'kill_np', 'double')
    union all
    -- Recréer (jeudi) : la paie continue normalement.
    select c.poster_id, 'recreate',
           'Recréer jeudi ' || to_char(j.lundi + 3, 'DD/MM')
             || case when j.raison->>'source' = 'problemes' then ' (décidé dans Problèmes le ' || to_char((j.raison->>'decide_le')::date, 'DD/MM') || ')' else '' end
             || ' : paie normale',
           j.maj_at
      from public.jeudi_brouillons j join public.comptes c on c.id = j.compte_id
     where j.lundi = p_lundi and j.choix = 'recreate'
    union all
    -- Postpone (dimanche, Cohortes ou Problèmes) : pas de paie ni de financement avant la nouvelle date.
    select dc.poster_id, 'postpone',
           'Postpone au ' || to_char(dc.lundi + 7, 'DD/MM') || ' (' || case dc.source when 'manuel' then 'décidé à la main' else 'dimanche' end
             || ' le ' || to_char(dc.decide_at at time zone 'Europe/Paris', 'DD/MM') || ') : pas de paie ni de financement avant',
           dc.decide_at
      from public.debut_choix dc
     where dc.choix = 'reporter' and dc.lundi between p_lundi and p_lundi + 7
  )
  select d.poster_id, string_agg(distinct d.decision, ', '), string_agg(distinct d.texte, ' · '), max(d.decide_at)
    from d
   group by d.poster_id;
end;
$$;
revoke all on function public.paie_decisions_sources(date) from public, anon;
grant execute on function public.paie_decisions_sources(date) to authenticated;

notify pgrst, 'reload schema';
