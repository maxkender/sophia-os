-- 0529 — Décision « Vérifier samedi » (03/11) : la carte n'est pas fermée,
-- elle revient samedi (niveau samedi, forcé) sans la question ; le choix est
-- noté (decision_choisie, journal, bot_feedback) comme les autres options.
--
-- Additif : remplace probleme_decider (0528).

create or replace function public.probleme_decider(p_id uuid, p_index int, p_envoye boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.problemes;
  v_opt jsonb;
  v_reco jsonb;
  v_bot text;
  v_samedi boolean;
  v_mode text := coalesce((select valeur #>> '{}' from public.reglages where cle = 'problemes_mode'), 'test');
begin
  if not public.is_admin() then
    raise exception 'probleme_decider : réservé à l''admin' using errcode = '42501';
  end if;
  select * into p from public.problemes where id = p_id for update;
  if not found then raise exception 'problème introuvable'; end if;
  if p.statut <> 'ouvert' then raise exception 'problème déjà fermé (%)', p.statut; end if;
  if p.options is null or p_index < 0 or p_index >= jsonb_array_length(p.options) then raise exception 'option inconnue'; end if;
  v_opt := p.options->p_index;
  v_reco := p.options->0;
  v_samedi := (v_opt->>'action') = 'saturday';
  if v_samedi then
    -- La carte revient samedi, sans la question (la décision est dans le journal).
    update public.problemes
       set niveau = 'samedi', niveau_force = true, question = null, proposition_action = null,
           decision_choisie = p_index, decision_at = now(), decision_par = auth.uid(),
           diagnostic = left('Décision : « ' || (v_opt->>'libelle') || ' ». ' || coalesce(p.diagnostic, ''), 300),
           maj_at = now(),
           journal = journal || jsonb_build_object('at', now(), 'par', auth.uid(), 'action', 'decision', 'index', p_index,
                                                   'libelle', v_opt->>'libelle', 'question', p.question, 'options', p.options,
                                                   'envoye', p_envoye, 'mode', v_mode)
     where id = p_id;
  else
    update public.problemes
       set statut = 'valide', decision_choisie = p_index, decision_at = now(), decision_par = auth.uid(),
           ferme_raison = 'décision : « ' || (v_opt->>'libelle') || ' »'
                          || case when coalesce((v_opt->>'paie')::boolean, false) then ' (paie : à faire sur Upwork, l''OS ne paie pas)'
                                  when p_envoye then ' · envoyé' else ' (mode ' || v_mode || ' : rien envoyé)' end,
           ferme_at = now(), ferme_par = auth.uid(), maj_at = now(),
           journal = journal || jsonb_build_object('at', now(), 'par', auth.uid(), 'action', 'decision', 'index', p_index,
                                                   'libelle', v_opt->>'libelle', 'envoye', p_envoye, 'mode', v_mode)
     where id = p_id;
  end if;
  -- Pour que les bots apprennent : le choix de Max contre la recommandation.
  v_bot := case when p.propose_par in ('new_cohort_bot', 'control_bot', 'pay_bot') then p.propose_par else p.proprietaire end;
  insert into public.bot_feedback (probleme_id, bot, categorie, groupe, verdict, raison, diagnostic_du_bot, action_du_bot, donne_par, choix)
  values (p.id, v_bot, p.categorie, p.groupe,
          case when p_index = 0 then 'juste' else 'mauvaise_action' end,
          case when p_index = 0 then null
               else 'Max a choisi « ' || (v_opt->>'libelle') || ' » au lieu de « ' || (v_reco->>'libelle') || ' » (recommandé)' end,
          case when p.diagnostic_par = p.propose_par then p.diagnostic end,
          left(coalesce(v_reco->>'action', v_reco->>'libelle'), 300), auth.uid(), v_opt->>'libelle');
  return v_opt || jsonb_build_object('samedi', v_samedi);
end;
$$;
revoke all on function public.probleme_decider(uuid, int, boolean) from public, anon;
grant execute on function public.probleme_decider(uuid, int, boolean) to authenticated;
notify pgrst, 'reload schema';
