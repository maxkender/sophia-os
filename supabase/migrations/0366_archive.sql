-- 0366 : l'Archive — posteurs désactivés et comptes dormants hors des listes
-- actives (ticket #a-os-tickets du 26 oct., 16h09).
--
-- L'Archive n'est pas un nouvel état : elle se lit sur `is_active`, qui existe
-- déjà et que tous les agents filtrent (Check, Kill or Double, nudges,
-- shadowban, sanity, génération de nuit) :
--   - un compte est en Archive s'il est inactif (dormant ou arrêté) ;
--   - un posteur est en Archive s'il est désactivé, ou si tous ses comptes le
--     sont (un posteur sans aucun compte reste actif : il n'a pas commencé).
-- Pas de tâche de nuit qui désactiverait des profils : une réactivation
-- prévue (Abasin, le 1/11 au soir) n'est pas défaite derrière.
--
-- Ce que la migration change :
--   1. Un compte remplacé par un nouveau compte TikTok (Recréer, ou « Nouveau
--      compte » de la page Shadowban) s'arrête TOUT DE SUITE, au lieu du
--      dimanche soir : il passe en Archive dès que le nouveau existe.
--   2. Hired (Notion) ne compte plus que les comptes actifs de posteurs actifs.
--   3. `archive_reactiver_compte` : Reactivate, compte par compte. Le profil
--      est réactivé s'il était désactivé, ses autres comptes ne bougent pas.
--
-- Additive : fonctions réécrites à signature identique, une vue réécrite à
-- colonnes identiques, une fonction nouvelle. Aucune donnée existante modifiée.
-- Retour arrière : réappliquer ckd_compte_cree (0328), ckd_shadowban_compte_cree
-- (0362) et la vue de 0328 ;
-- drop function public.archive_reactiver_compte(uuid).

-- ---------------------------------------------------------------------------
-- 1. Compte remplacé : arrêté tout de suite
-- ---------------------------------------------------------------------------
create or replace function public.ckd_compte_cree(p_id uuid, p_compte uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.ckd_propositions%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'ckd_compte_cree : réservé à la fonction ckd';
  end if;
  select * into p from public.ckd_propositions where id = p_id for update;
  if not found or p.decision not in ('recreer', 'doubler') then
    raise exception 'ckd_compte_cree : proposition introuvable ou pas en Recréer / Doubler';
  end if;
  update public.ckd_propositions set nouveau_compte_id = p_compte, erreur = null where id = p_id;
  if p.decision = 'recreer' then
    insert into public.ckd_recreations (poster_id, ancien_compte_id, nouveau_compte_id, regle, proposition_id, decide_par)
    values (p.poster_id, p.compte_id, p_compte, p.regle, p_id, p.decision_par);
    -- L'ancien compte part en Archive maintenant (0366), plus le dimanche soir.
    insert into public.ckd_arrets as a (compte_id, proposition_id, raison, prevu_at, decide_par)
    values (p.compte_id, p_id, 'recreer', now(), p.decision_par)
    on conflict (compte_id) do update
      set proposition_id = excluded.proposition_id, raison = excluded.raison, prevu_at = excluded.prevu_at,
          decide_par = excluded.decide_par, annule_at = null
      where a.fait_at is null;
    perform public.ckd_arreter_comptes();
  end if;
end;
$$;

create or replace function public.ckd_shadowban_compte_cree(p_compte uuid, p_nouveau uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ckd_shadowban;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'ckd_shadowban_compte_cree : réservé à la fonction ckd';
  end if;
  select * into r from public.ckd_shadowban where compte_id = p_compte for update;
  if not found then
    raise exception 'ckd_shadowban_compte_cree : compte introuvable';
  end if;
  update public.ckd_shadowban set nouveau_compte_id = p_nouveau, erreur = null where compte_id = p_compte;
  insert into public.ckd_recreations (poster_id, ancien_compte_id, nouveau_compte_id, regle, proposition_id, decide_par)
  values (r.poster_id, p_compte, p_nouveau, r.type, null, r.recreation_par);
  -- L'ancien compte part en Archive maintenant (0366), plus le dimanche soir.
  insert into public.ckd_arrets as a (compte_id, proposition_id, raison, prevu_at, decide_par)
  values (p_compte, null, 'recreer', now(), r.recreation_par)
  on conflict (compte_id) do update
    set proposition_id = excluded.proposition_id, raison = excluded.raison, prevu_at = excluded.prevu_at,
        decide_par = excluded.decide_par, annule_at = null
    where a.fait_at is null;
  perform public.ckd_arreter_comptes();
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Hired : comptes actifs de posteurs actifs
-- ---------------------------------------------------------------------------
create or replace view public.hired_pays_application
with (security_invoker = true) as
select
  c.pays,
  case
    when c.parts_applications is null then 'sophia'
    when (
      select count(*) from jsonb_each(c.parts_applications) e
      where (e.value)::numeric > 0
    ) = 1 then (
      select e.key from jsonb_each(c.parts_applications) e
      where (e.value)::numeric > 0 limit 1
    )
    else null  -- compte partagé entre applications : le job doit s'arrêter
  end as application,
  count(*)::int as hired
from public.comptes c
join public.profiles p on p.id = c.poster_id
where coalesce(c.type_compte, '') <> 'cm'
  and c.pays is not null
  and p.is_active
  and c.is_active
  and not exists (
    select 1 from public.ckd_arrets a
     where a.compte_id = c.id and a.fait_at is not null and a.annule_at is null
  )
group by 1, 2;

comment on view public.hired_pays_application is
  'Comptes TikTok par (pays × application) pour la colonne Hired de Notion. Seulement les comptes ACTIFS de posteurs actifs (0366 : les dormants ne comptent plus, l''Archive est exclue) ; warm-ups inclus ; comptes arrêtés par Check, Kill or Double exclus (0328), compte marque (cm) et comptes sans pays exclus. application NULL = compte partagé entre apps : anomalie, le job s''arrête.';

-- ---------------------------------------------------------------------------
-- 3. Reactivate : un compte à la fois
-- ---------------------------------------------------------------------------
-- Admin, Head of Ops, la HM du posteur ou sa DM (`peut_gerer_createur`).
-- Le compte redevient actif ; un arrêt de Check, Kill or Double déjà fait est
-- annulé (le compte recompte dans Hired et n'est plus « Stopped ») ; le
-- profil est réactivé s'il était désactivé. Les autres comptes du posteur ne
-- bougent pas.
create or replace function public.archive_reactiver_compte(p_compte uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poster uuid;
begin
  select poster_id into v_poster from public.comptes where id = p_compte for update;
  if not found then
    raise exception 'archive_reactiver_compte : compte introuvable';
  end if;
  if coalesce(auth.role(), '') <> 'service_role' and not public.peut_gerer_createur(v_poster) then
    raise exception 'archive_reactiver_compte : réservé à l''admin et à la HM du posteur';
  end if;
  update public.comptes set is_active = true where id = p_compte and not is_active;
  -- L'arrêt fait est rouvert et annulé : Check, Kill or Double peut en
  -- reprogrammer un plus tard (son upsert ne touche qu'un arrêt pas fait).
  update public.ckd_arrets set fait_at = null, annule_at = now()
   where compte_id = p_compte and fait_at is not null;
  -- « Ne pas renouveler » posé par Check, Kill or Double : levé, comme ckd_annuler.
  update public.comptes
     set non_renouveler = false, non_renouveler_at = null, non_renouveler_par = null, non_renouveler_raison = null
   where id = p_compte and non_renouveler_raison like 'ckd:%';
  update public.profiles set is_active = true where id = v_poster and not is_active;
end;
$$;

revoke execute on function public.archive_reactiver_compte(uuid) from public, anon;
grant execute on function public.archive_reactiver_compte(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
