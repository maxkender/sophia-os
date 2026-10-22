-- 0339 : Check, Kill or Double, le message au HM d'un nudge se modifie, et le
-- suivi du HM se désactive (demandes d'Adrien, 22/10).
--
-- POURQUOI. Après le texte du pop-up (0338), l'admin veut aussi adapter ce que
-- le HM lit dans #managers-hq (« quoi vérifier ») pour ce posteur, ou ne rien
-- envoyer au HM du tout : le pop-up seul suffit parfois.
--
-- CE QUI CHANGE.
--   * `ckd_propositions.hm_texte` : la consigne au HM modifiée pour ce posteur.
--     Le message Slack garde son en-tête (« Follow up @compte (posteur) ») et
--     la remplace. Vide : la consigne par défaut (fonction `ckd`).
--   * `ckd_propositions.hm_suivi` (vrai par défaut) : faux, la décision ne part
--     jamais dans #managers-hq (ni au clic « Envoyer aux HM », ni le dimanche).
--   * `ckd_nudge_personnalise(p_id, p_titre, p_corps, p_hm, p_suivi, p_note)` :
--     note les textes et le suivi puis décide le Nudge, dans la même
--     transaction. Titre, texte ou consigne vides : ceux par défaut.
--   * `ckd_decider_nudge` (0338, même signature) passe par elle, suivi actif.
--
-- Retour arrière : remettre `ckd_decider_nudge` de 0338, retirer
-- `ckd_nudge_personnalise` et les deux colonnes.

set lock_timeout = '10s';

alter table public.ckd_propositions
  add column if not exists hm_texte text,
  add column if not exists hm_suivi boolean not null default true;

comment on column public.ckd_propositions.hm_texte is
  'Consigne au HM modifiée pour ce posteur (0339), sous l''en-tête « Follow up ». Vide : celle par défaut.';
comment on column public.ckd_propositions.hm_suivi is
  'Faux : la décision ne part pas dans #managers-hq (0339). Vrai par défaut.';

create or replace function public.ckd_nudge_personnalise(p_id uuid, p_titre text, p_corps text, p_hm text,
                                                         p_suivi boolean default true, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titre text := nullif(btrim(coalesce(p_titre, '')), '');
  v_corps text := nullif(btrim(coalesce(p_corps, '')), '');
  v_hm text := nullif(btrim(coalesce(p_hm, '')), '');
  v_suivi boolean := coalesce(p_suivi, true);
begin
  if not public.is_admin() then
    raise exception 'ckd_nudge_personnalise : réservé à l''admin';
  end if;
  if char_length(coalesce(v_titre, '')) > 200 or char_length(coalesce(v_corps, '')) > 3000
     or char_length(coalesce(v_hm, '')) > 2000 then
    raise exception 'ckd_nudge_personnalise : texte trop long (titre 200, texte 3000, message au HM 2000 caractères)';
  end if;
  update public.ckd_propositions
     set nudge_titre = v_titre,
         nudge_corps = v_corps,
         hm_texte = case when v_suivi then v_hm end,
         hm_suivi = v_suivi
   where id = p_id and decision is null;
  return public.ckd_decider(p_id, 'nudge', p_note);
end;
$$;

create or replace function public.ckd_decider_nudge(p_id uuid, p_titre text, p_corps text,
                                                    p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'ckd_decider_nudge : réservé à l''admin';
  end if;
  if btrim(coalesce(p_titre, '')) = '' or btrim(coalesce(p_corps, '')) = '' then
    raise exception 'ckd_decider_nudge : le titre et le texte ne peuvent pas être vides';
  end if;
  return public.ckd_nudge_personnalise(p_id, p_titre, p_corps, null, true, p_note);
end;
$$;

revoke all on function public.ckd_nudge_personnalise(uuid, text, text, text, boolean, text) from public, anon;
grant execute on function public.ckd_nudge_personnalise(uuid, text, text, text, boolean, text) to authenticated, service_role;

notify pgrst, 'reload schema';
