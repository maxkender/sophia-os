-- 0485 — Welcomes en attente : les recrues créées pendant qu'Automatic onboarding est sur Off.
--
-- 1. accueils.bienvenue_attente : la recrue a été créée et reliée par l'OS sans
--    aucun message (action upwork « relier_contrats ») ; son welcome part au
--    premier passage de l'accueil automatique sur On (avec un mot de passe unique).
-- 2. bienvenues_a_envoyer() : la liste exacte de qui recevra un welcome quand
--    Automatic onboarding passera sur On :
--      - os_sans_welcome : créée par l'OS sans welcome (rien reçu) ;
--      - hm_doublon : créée par la HM, notée « doublon », jamais accueillie par l'OS ;
--      - hm_simule : welcome « simulé » (accueil sur Test), contrat actif, profil créé par la HM.
--    Une recrue créée par la HM et déjà connectée à l'OS n'en reçoit pas (elle a
--    ses logins) : elle n'est pas dans la liste.
--
-- Additive : 1 colonne, 1 fonction. Aucune donnée modifiée.

alter table public.accueils add column if not exists bienvenue_attente boolean not null default false;

create or replace function public.bienvenues_a_envoyer()
returns table (contrat_id text, poster_id uuid, nom text, hm_nom text, pays text, cohorte_lundi date, cas text,
               connecte boolean, accepte_le timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role'
          or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'head_of_ops')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with a as (
    select a.*, coalesce(a.poster_id, (select p.id from public.profiles p where p.upwork_contract_id = a.contrat_id and p.is_active limit 1)) as pid,
           case when a.bienvenue_attente then 'os_sans_welcome'
                when a.statut = 'doublon' then 'hm_doublon'
                else 'hm_simule' end as cas
      from public.accueils a
     where a.message_at is null
       and (a.bienvenue_attente
            or (a.statut = 'doublon' and a.raison in ('contrat déjà relié à un posteur', 'même nom et même pays qu''un posteur actif'))
            or (a.statut = 'simule'
                and exists (select 1 from public.upwork_contrats uc where uc.contrat_id = a.contrat_id and uc.actif)
                and exists (select 1 from public.profiles p where p.upwork_contract_id = a.contrat_id and p.is_active)))
  )
  select a.contrat_id, a.pid, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''),
         (select nullif(btrim(concat_ws(' ', h.prenom, h.nom)), '') from public.profiles h where h.id = coalesce(pr.manager_id, a.hm_id)),
         coalesce((select c.pays from public.comptes c where c.poster_id = a.pid and c.is_active and c.pays is not null
                    order by (coalesce(c.type_compte, 'perso') = 'perso') desc limit 1), a.pays),
         coalesce(pr.cohorte_lundi, a.cohorte_lundi), a.cas,
         exists (select 1 from auth.users u where u.id = a.pid and u.last_sign_in_at is not null),
         a.debut_at
    from a
    join public.profiles pr on pr.id = a.pid and pr.is_active
   -- Créée par la HM et déjà connectée : pas de welcome de l'OS (garde de la fonction upwork).
   where a.cas = 'os_sans_welcome' or not exists (select 1 from auth.users u where u.id = a.pid and u.last_sign_in_at is not null)
   order by a.cas, a.debut_at;
end;
$$;
revoke all on function public.bienvenues_a_envoyer() from public, anon;
grant execute on function public.bienvenues_a_envoyer() to authenticated, service_role;

notify pgrst, 'reload schema';
