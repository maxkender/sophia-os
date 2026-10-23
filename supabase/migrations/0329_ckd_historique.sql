-- 0329 : Check, Kill or Double, l'historique des décisions et leur devenir.
--
-- POURQUOI. Le prompt 5 demandait, en bas de la page, l'historique de toutes
-- les décisions, avec l'admin qui les a prises, et ce que sont devenus 2
-- semaines après les comptes gardés et les posteurs doublés, pour voir si les
-- seuils sont trop durs ou trop mous.
--
-- CE QUE RENVOIE `ckd_historique`. Une ligne par décision des `p_semaines`
-- dernières semaines, avec :
--   * AVANT : les chiffres de la proposition, figés au moment du contrôle
--     (période jugée, médiane, publiés, bons posts) et la médiane de référence ;
--   * APRÈS : les 2 semaines du lundi au dimanche qui suivent le contrôle, avec
--     les MÊMES seuils (âge minimum, post mort, bon post) que la décision.
--     Elles se remplissent au fil des jours (jusqu'à hier), et sont complètes
--     3 jours après leur dernier jour, quand le relevé de nuit a mesuré les
--     derniers posts ;
--     - Garder, Pas maintenant, Rien, Nudge, Doubler : le même compte ;
--     - Recréer et Doubler : aussi le nouveau compte ;
--     - Kill, et l'ancien compte de Recréer : arrêtés, rien à mesurer (la
--       date d'arrêt est rendue).
-- Rien n'est stocké : tout se recalcule à la lecture, donc l'historique se
-- remplit tout seul.
--
-- Retour arrière : `drop function public.ckd_historique(integer)`.

set lock_timeout = '10s';

create or replace function public.ckd_historique(p_semaines integer default 12)
returns table (
  id uuid, type text, jour date, regle text, action text, decision text,
  decision_par uuid, decision_at timestamptz, note text,
  compte_id uuid, poster_id uuid, hm_id uuid, pays text, handle text,
  nouveau_compte_id uuid, nouveau_handle text,
  avant jsonb, mediane_ref numeric,
  du date, au date, complet boolean,
  apres jsonb, apres_nouveau jsonb,
  arrete_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_auj date := (now() at time zone 'Europe/Paris')::date;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'ckd_historique : réservé à l''admin';
  end if;
  return query
  with d as (
    select p.*,
           -- Le lundi qui suit le contrôle (jeudi → +4, samedi → +2).
           p.jour + (8 - extract(isodow from p.jour)::int) as d_du,
           coalesce((p.donnees->'reglages'->'age_min_heures'->>'v')::numeric, 10) as d_age,
           coalesce((p.donnees->'reglages'->'seuil_mort'->>'v')::numeric, 50) as d_mort,
           coalesce((p.donnees->'seuil_bon_post'->>'valeur')::numeric, 10000) as d_bon
      from public.ckd_propositions p
     where p.decision is not null
       and p.jour >= v_auj - 7 * greatest(p_semaines, 1)
  )
  select d.id, d.type, d.jour, d.regle, d.action, d.decision,
         d.decision_par, d.decision_at, d.note,
         d.compte_id, d.poster_id, d.hm_id, d.pays, d.donnees->>'handle',
         d.nouveau_compte_id, n.handle_tiktok,
         coalesce(d.donnees->'periode', '{}'::jsonb) - 'posts' - 'liens_manquants',
         (d.donnees->'mediane_ref'->>'valeur')::numeric,
         d.d_du, d.d_du + 13, v_auj >= d.d_du + 16,
         case when v_auj > d.d_du and d.decision not in ('ne_pas_renouveler', 'recreer') then
           public.ckd_detail(d.compte_id, d.d_du, least(d.d_du + 13, v_auj - 1), d.d_age, d.d_mort, d.d_bon)
             - 'posts' - 'liens_manquants'
         end,
         case when v_auj > d.d_du and d.nouveau_compte_id is not null then
           public.ckd_detail(d.nouveau_compte_id, d.d_du, least(d.d_du + 13, v_auj - 1), d.d_age, d.d_mort, d.d_bon)
             - 'posts' - 'liens_manquants'
         end,
         a.fait_at
    from d
    left join public.comptes n on n.id = d.nouveau_compte_id
    left join public.ckd_arrets a on a.compte_id = d.compte_id and a.proposition_id = d.id and a.annule_at is null
   order by d.decision_at desc nulls last, d.jour desc;
end;
$$;

revoke all on function public.ckd_historique(integer) from public, anon;
grant execute on function public.ckd_historique(integer) to authenticated, service_role;

notify pgrst, 'reload schema';
