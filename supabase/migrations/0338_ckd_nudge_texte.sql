-- 0338 : Check, Kill or Double, le texte du nudge se modifie avant l'envoi
-- (demande d'Adrien, 22/10).
--
-- POURQUOI. Le nudge partait toujours avec le texte de Réglages (un paragraphe
-- par motif). Pour un posteur précis (ex. les 2 posts manquants sont ceux de
-- son premier jour), l'admin veut adapter ce que le posteur lira.
--
-- CE QUI CHANGE.
--   * `ckd_apercu_nudge(p_id)` : le titre et le texte que la proposition
--     enverrait, tels que Réglages les donnent. La page pré-remplit avec.
--   * `ckd_propositions.nudge_titre` / `nudge_corps` : le texte modifié pour
--     ce posteur, gardé sur la proposition (on voit ce qui est parti).
--   * `ckd_decider_nudge(p_id, p_titre, p_corps, p_note)` : note le texte sur
--     la proposition puis décide le Nudge (`ckd_decider`), dans la même
--     transaction : si la décision échoue, le texte n'est pas gardé.
--   * `ckd_decider` (même signature) : pour un Nudge, prend le texte de la
--     proposition s'il y en a un, sinon celui de Réglages. `{handle}` est
--     remplacé dans les deux cas. Le bouton « Envoyer les nudges » garde les
--     textes de Réglages.
--
-- Retour arrière : remettre `ckd_decider` de 0328, retirer `ckd_decider_nudge`,
-- `ckd_apercu_nudge` et les deux colonnes.

set lock_timeout = '10s';

alter table public.ckd_propositions
  add column if not exists nudge_titre text,
  add column if not exists nudge_corps text;

comment on column public.ckd_propositions.nudge_titre is
  'Titre du nudge modifié pour ce posteur (0338). Vide : celui de Réglages.';
comment on column public.ckd_propositions.nudge_corps is
  'Texte du nudge modifié pour ce posteur (0338). Vide : celui de Réglages.';

create or replace function public.ckd_decider(p_id uuid, p_decision text, p_note text default null,
                                              p_par uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_par uuid;
  p public.ckd_propositions%rowtype;
  v_prevu timestamptz;
  v_nudge record;
  v_motifs text[];
  v_handle text;
begin
  if not v_service and not public.is_admin() then
    raise exception 'ckd_decider : réservé à l''admin';
  end if;
  v_par := case when v_service then p_par else auth.uid() end;
  if p_decision in ('recreer', 'doubler') and not v_service then
    raise exception 'ckd_decider : % crée un compte et passe par la fonction ckd', p_decision;
  end if;

  select * into p from public.ckd_propositions where id = p_id for update;
  if not found then
    raise exception 'ckd_decider : proposition introuvable';
  end if;
  if p.decision is not null then
    raise exception 'ckd_decider : déjà décidé (%)', p.decision;
  end if;
  if not (p_decision = any(public.ckd_decisions_permises(p.regle))) then
    raise exception 'ckd_decider : % impossible pour la règle %', p_decision, p.regle;
  end if;

  update public.ckd_propositions
     set decision = p_decision, decision_par = v_par, decision_at = now(),
         note = nullif(btrim(coalesce(p_note, '')), ''), erreur = null
   where id = p_id;

  if p_decision = 'ne_pas_renouveler' then
    update public.comptes
       set non_renouveler = true, non_renouveler_at = now(), non_renouveler_par = v_par,
           non_renouveler_raison = 'ckd:' || p.regle
     where id = p.compte_id;
    v_prevu := public.ckd_prochain_arret(now(), true);
    insert into public.ckd_arrets as a (compte_id, proposition_id, raison, prevu_at, decide_par)
    values (p.compte_id, p_id, 'ne_pas_renouveler', v_prevu, v_par)
    on conflict (compte_id) do update
      set proposition_id = excluded.proposition_id, raison = excluded.raison, prevu_at = excluded.prevu_at,
          decide_par = excluded.decide_par, annule_at = null
      where a.fait_at is null;
    if v_prevu <= now() then
      perform public.ckd_arreter_comptes();
    end if;
  elsif p_decision = 'nudge' then
    v_motifs := array(select jsonb_array_elements_text(coalesce(p.donnees->'motifs', '[]'::jsonb)));
    v_handle := coalesce(p.donnees->>'handle', '');
    select * into v_nudge from public.ckd_texte_nudge(p.regle, v_motifs, p.donnees->>'handle');
    -- Le texte modifié pour ce posteur (0338), sinon celui de Réglages.
    insert into public.compte_nudges (compte_id, modele_id, titre, corps, envoye_par)
    values (p.compte_id, v_nudge.modele,
            coalesce(replace(nullif(btrim(coalesce(p.nudge_titre, '')), ''), '{handle}', v_handle), v_nudge.titre),
            coalesce(replace(nullif(btrim(coalesce(p.nudge_corps, '')), ''), '{handle}', v_handle), v_nudge.corps),
            v_par);
  end if;

  return jsonb_build_object('id', p_id, 'decision', p_decision, 'arret_at', v_prevu);
end;
$$;

-- Décider un Nudge avec un texte modifié pour ce posteur.
create or replace function public.ckd_decider_nudge(p_id uuid, p_titre text, p_corps text,
                                                    p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titre text := btrim(coalesce(p_titre, ''));
  v_corps text := btrim(coalesce(p_corps, ''));
begin
  if not public.is_admin() then
    raise exception 'ckd_decider_nudge : réservé à l''admin';
  end if;
  if v_titre = '' or v_corps = '' then
    raise exception 'ckd_decider_nudge : le titre et le texte ne peuvent pas être vides';
  end if;
  if char_length(v_titre) > 200 or char_length(v_corps) > 3000 then
    raise exception 'ckd_decider_nudge : texte trop long (titre 200, texte 3000 caractères)';
  end if;
  update public.ckd_propositions
     set nudge_titre = v_titre, nudge_corps = v_corps
   where id = p_id and decision is null;
  return public.ckd_decider(p_id, 'nudge', p_note);
end;
$$;

-- Le texte qu'un Nudge enverrait pour cette proposition (Réglages, motifs de la
-- proposition, handle remplacé).
create or replace function public.ckd_apercu_nudge(p_id uuid)
returns table (titre text, corps text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  p public.ckd_propositions%rowtype;
  v_nudge record;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'ckd_apercu_nudge : réservé à l''admin';
  end if;
  select * into p from public.ckd_propositions where id = p_id;
  if not found then
    raise exception 'ckd_apercu_nudge : proposition introuvable';
  end if;
  select * into v_nudge
    from public.ckd_texte_nudge(
      p.regle,
      array(select jsonb_array_elements_text(coalesce(p.donnees->'motifs', '[]'::jsonb))),
      p.donnees->>'handle');
  return query select v_nudge.titre, v_nudge.corps;
end;
$$;

revoke all on function public.ckd_decider_nudge(uuid, text, text, text) from public, anon;
revoke all on function public.ckd_apercu_nudge(uuid) from public, anon;
grant execute on function public.ckd_decider_nudge(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.ckd_apercu_nudge(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
