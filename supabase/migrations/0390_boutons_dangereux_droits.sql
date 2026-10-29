-- 0390 — Prompt 15, point 1 : les droits côté base des boutons dangereux.
--
-- 1. Reactivate (Archive, `archive_reactiver_compte`, 0366) : retiré aux HMs.
--    L'admin, le Head of Ops (`is_admin()`) et le DM du posteur le gardent.
--    Même signature, même effet ; seule la vérification des droits change.
-- 2. Réglages de paie (seuil, retenue, bonus) : modifiables par l'admin
--    seulement. Trois politiques RESTRICTIVES sur `reglages` (insert, update,
--    delete) pour les clés de paie : `reglages_admin` (0100) laisse passer
--    le Head of Ops pour les autres clés, plus pour celles-ci. La lecture ne
--    change pas.
--
-- Aucune donnée touchée.
-- Retour arrière : réappliquer `archive_reactiver_compte` de 0366 ;
-- drop policy reglages_paie_admin_ins / _upd / _del on public.reglages.

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
  -- Prompt 15 : plus la HM. Admin et Head of Ops, ou le DM du posteur.
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin()
     and not (public.is_directing_manager() and public.peut_gerer_createur(v_poster)) then
    raise exception 'archive_reactiver_compte : réservé à l''admin et au Head of Ops';
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

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reglages'
                  and policyname = 'reglages_paie_admin_ins') then
    create policy reglages_paie_admin_ins on public.reglages as restrictive for insert to authenticated
      with check (cle not in ('paie', 'bonus', 'bonus_parrainage_actif', 'paie_bonus_premiere_semaine')
                  or public.is_admin_strict());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reglages'
                  and policyname = 'reglages_paie_admin_upd') then
    create policy reglages_paie_admin_upd on public.reglages as restrictive for update to authenticated
      using (cle not in ('paie', 'bonus', 'bonus_parrainage_actif', 'paie_bonus_premiere_semaine')
             or public.is_admin_strict())
      with check (cle not in ('paie', 'bonus', 'bonus_parrainage_actif', 'paie_bonus_premiere_semaine')
                  or public.is_admin_strict());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reglages'
                  and policyname = 'reglages_paie_admin_del') then
    create policy reglages_paie_admin_del on public.reglages as restrictive for delete to authenticated
      using (cle not in ('paie', 'bonus', 'bonus_parrainage_actif', 'paie_bonus_premiere_semaine')
             or public.is_admin_strict());
  end if;
end
$$;

notify pgrst, 'reload schema';
