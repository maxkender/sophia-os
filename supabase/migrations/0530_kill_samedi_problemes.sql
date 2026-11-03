-- 0530 — Kill = toujours le samedi (03/11). Partie 1 de « synchroniser Problèmes
-- avec jeudi, samedi, dimanche et la paie du lundi ».
--
-- « Kill samedi » sur une carte Problèmes n'exécute rien : il prépare la
-- décision du samedi suivant dans la table des décisions du samedi
-- (samedi_brouillons, 0484 : « Kill » pré-coché pour chaque compte actif du
-- posteur, raison.source = « problemes », la date et qui). La page samedi la
-- montre « Kill · décidé le 3/11 dans Problèmes » ; Validate l'exécute comme
-- les autres Kill du samedi (ckd_decider → ckd_arreter_comptes : désactivation,
-- fin de contrat Upwork le lundi, récupération du milestone financé non payé,
-- aucun message). Max peut changer d'avis samedi, ou « Annuler » sur la carte.
-- (Pas de ckd_propositions décidée tout de suite : ckd_decider sur une
-- proposition du samedi arrête le compte immédiatement.)
--
-- STOP (catégorie stop, message « STOP… », ou demande d'arrêt déjà ouverte) : le kill reste le
-- samedi, mais dès le clic la demande d'arrêt est ouverte (recrues-check ne
-- relance plus, le moteur n'assigne plus de posts) et les relances en file
-- passent « bloque ».
--
-- Paie du lundi : un Kill préparé pour le samedi (Problèmes ou fiche Posters)
-- = rien à financer pour la semaine suivante (paie_suivante_calc), avec la
-- source lisible (paie_decisions_sources).
--
-- Le choix est noté dans bot_feedback (juste si le bot proposait le kill).
--
-- Additif : 3 colonnes, des fonctions ; paie_suivante_calc patchée en place.

alter table public.problemes add column if not exists kill_samedi_lundi date;
alter table public.problemes add column if not exists kill_samedi_at timestamptz;
alter table public.problemes add column if not exists kill_samedi_par uuid;
alter table public.bot_feedback add column if not exists choix text;

-- Le lundi de la semaine du prochain samedi (Paris) ; le dimanche : la semaine suivante.
create or replace function public.lundi_du_prochain_samedi(p_jour date default (now() at time zone 'Europe/Paris')::date)
returns date
language sql
immutable
as $$
  select p_jour - (extract(isodow from p_jour)::int - 1) + case when extract(isodow from p_jour) = 7 then 7 else 0 end;
$$;

create or replace function public.probleme_kill_samedi(p_id uuid, p_annuler boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.problemes;
  v_lundi date := public.lundi_du_prochain_samedi();
  v_auj date := (now() at time zone 'Europe/Paris')::date;
  v_stop boolean;
  v_comptes int := 0;
  v_relances int := 0;
  v_bot text;
  v_demande boolean := false;
begin
  if not public.is_admin() then
    raise exception 'probleme_kill_samedi : réservé à l''admin' using errcode = '42501';
  end if;
  select * into p from public.problemes where id = p_id for update;
  if not found then raise exception 'problème introuvable'; end if;
  if p.poster_id is null then raise exception 'pas de posteur sur cette carte'; end if;

  if p_annuler then
    -- Max change d'avis : la décision préparée repasse à Keep (la trace reste dans la raison).
    update public.samedi_brouillons b
       set choix = 'keep', par = auth.uid(), maj_at = now(),
           raison = coalesce(b.raison, '{}'::jsonb) || jsonb_build_object('annule_le', v_auj)
     where b.lundi = coalesce(p.kill_samedi_lundi, v_lundi)
       and b.raison->>'source' = 'problemes' and b.raison->>'probleme_id' = p.id::text;
    get diagnostics v_comptes = row_count;
    -- La demande d'arrêt ouverte par ce clic (pas une vraie demande du posteur) est classée « garder ».
    update public.demandes_arret d
       set decision = 'garder', decide_at = now(), decide_par = auth.uid()
     where d.poster_id = p.poster_id and d.decision is null and d.source = 'manuel'
       and d.raison like 'Kill samedi (Problèmes)%';
    update public.problemes
       set kill_samedi_lundi = null, kill_samedi_at = null, kill_samedi_par = null, maj_at = now(),
           journal = journal || jsonb_build_object('at', now(), 'par', auth.uid(), 'action', 'kill_samedi_annule')
     where id = p.id;
    return jsonb_build_object('annule', true, 'comptes', v_comptes);
  end if;

  -- STOP : catégorie stop, un message qui commence par « STOP », ou une demande d'arrêt ouverte.
  v_stop := p.categorie = 'stop' or p.resume ~* '^\s*stop\M'
            or exists (select 1 from public.demandes_arret d where d.poster_id = p.poster_id and d.decision is null);

  insert into public.samedi_brouillons (lundi, compte_id, choix, raison, par, maj_at)
  select v_lundi, c.id, 'kill',
         jsonb_build_object('source', 'problemes', 'probleme_id', p.id, 'decide_le', v_auj,
                            'note', 'Kill samedi décidé dans Problèmes le ' || to_char(v_auj, 'DD/MM')),
         auth.uid(), now()
    from public.comptes c
   where c.poster_id = p.poster_id and c.is_active
  on conflict (lundi, compte_id) do update
    set choix = 'kill', par = excluded.par, maj_at = now(),
        raison = (coalesce(samedi_brouillons.raison, '{}'::jsonb) || excluded.raison) - 'annule_le';
  get diagnostics v_comptes = row_count;
  if v_comptes = 0 then raise exception 'aucun compte actif : rien à tuer samedi'; end if;

  if v_stop then
    -- On n'écrit plus à quelqu'un qui a dit STOP : demande d'arrêt ouverte (relances, nudges, posts coupés).
    if not exists (select 1 from public.demandes_arret d where d.poster_id = p.poster_id and d.decision is null) then
      v_demande := public.demande_arret_noter(p.poster_id, 'manuel', 'Kill samedi (Problèmes) : ' || left(p.resume, 200), null);
    end if;
    update public.relances_prevues r
       set statut = 'bloque', raison = 'STOP : kill prévu samedi ' || to_char(v_lundi + 5, 'DD/MM'), maj_at = now()
     where r.poster_id = p.poster_id and r.statut = 'prevu';
    get diagnostics v_relances = row_count;
  end if;

  update public.problemes
     set kill_samedi_lundi = v_lundi, kill_samedi_at = now(), kill_samedi_par = auth.uid(), maj_at = now(),
         journal = journal || jsonb_build_object('at', now(), 'par', auth.uid(), 'action', 'kill_samedi',
                                                 'samedi', v_lundi + 5, 'stop', v_stop, 'relances_bloquees', v_relances)
   where id = p.id;

  -- Pour que les bots apprennent : le choix de Max contre la proposition du bot.
  v_bot := case when p.propose_par in ('new_cohort_bot', 'control_bot', 'pay_bot') then p.propose_par else p.proprietaire end;
  if v_bot in ('new_cohort_bot', 'control_bot', 'pay_bot') then
    insert into public.bot_feedback (probleme_id, bot, categorie, groupe, verdict, raison, diagnostic_du_bot, action_du_bot, donne_par, choix)
    values (p.id, v_bot, p.categorie, p.groupe,
            case when p.proposition_action = 'kill' or p.categorie = 'stop' then 'juste' else 'mauvaise_action' end,
            case when p.proposition_action = 'kill' or p.categorie = 'stop' then null
                 else 'Max a choisi « Kill samedi » au lieu de « ' || coalesce(p.proposition_action, 'rien') || ' »' end,
            case when p.diagnostic_par = p.propose_par then p.diagnostic end,
            p.proposition_action, auth.uid(), 'kill_samedi');
  end if;

  return jsonb_build_object('lundi', v_lundi, 'samedi', v_lundi + 5, 'comptes', v_comptes, 'stop', v_stop,
                            'demande_ouverte', v_demande, 'relances_bloquees', v_relances);
end;
$$;
revoke all on function public.probleme_kill_samedi(uuid, boolean) from public, anon;
grant execute on function public.probleme_kill_samedi(uuid, boolean) to authenticated;

-- La carte montre « Kill prévu samedi JJ/MM ».
do $p$
declare
  v_def text := pg_get_functiondef('public.problemes_liste(text)'::regprocedure);
  v_a text := $q$'destinataire', coalesce(p.destinataire, 'posteur'),$q$;
begin
  if position(v_a in v_def) = 0 then raise exception '0530 : problemes_liste ne correspond pas'; end if;
  execute replace(v_def, v_a, v_a || $q$
             'kill_samedi_lundi', p.kill_samedi_lundi, 'kill_samedi_at', p.kill_samedi_at,$q$);
end;
$p$;

-- Paie du lundi : un Kill préparé pour ce samedi = rien à financer la semaine suivante.
do $p$
declare
  v_def text := pg_get_functiondef('public.paie_suivante_calc(date,jsonb)'::regprocedure);
  r text;
  v_a1 text := $q$as recree
      from lignes l$q$;
  v_a2 text := $q$when not e.is_active then 'ne_pas_financer'$q$;
  v_a3 text := $q$when not e.is_active then 'desactive'$q$;
begin
  if position(v_a1 in v_def) = 0 or position(v_a2 in v_def) = 0 or position(v_a3 in v_def) = 0 then
    raise exception '0530 : paie_suivante_calc ne correspond pas';
  end if;
  r := replace(v_def, v_a1, $q$as recree,
           -- 0530 : Kill préparé pour le samedi de cette semaine (Problèmes, fiche Posters ou samedi).
           exists (select 1 from public.samedi_brouillons sb join public.comptes sc on sc.id = sb.compte_id
                    where sc.poster_id = l.poster_id and sb.lundi = p_lundi and sb.choix in ('kill', 'kill_np')) as kill_prevu
      from lignes l$q$);
  r := replace(r, v_a2, $q$when e.kill_prevu then 'ne_pas_financer'
             $q$ || v_a2);
  r := replace(r, v_a3, $q$when e.kill_prevu then 'kill_samedi'
             $q$ || v_a3);
  execute r;
end;
$p$;

-- La source de chaque décision qui touche la paie d'une semaine (affichée sur la ligne).
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
  select distinct on (c.poster_id) c.poster_id, b.choix,
         'Kill samedi ' || to_char(b.lundi + 5, 'DD/MM')
           || case when b.raison->>'source' = 'problemes'
                   then ' (décidé dans Problèmes le ' || to_char((b.raison->>'decide_le')::date, 'DD/MM') || ')'
                   when b.raison->>'note' is not null then ' (préparé le ' || to_char(b.maj_at at time zone 'Europe/Paris', 'DD/MM') || ')'
                   else '' end,
         b.maj_at
    from public.samedi_brouillons b
    join public.comptes c on c.id = b.compte_id
   where b.lundi = p_lundi and b.choix in ('kill', 'kill_np')
   order by c.poster_id, b.maj_at;
end;
$$;
revoke all on function public.paie_decisions_sources(date) from public, anon;
grant execute on function public.paie_decisions_sources(date) to authenticated;

notify pgrst, 'reload schema';
