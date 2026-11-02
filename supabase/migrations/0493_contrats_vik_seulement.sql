-- 0493 — Contracts to link : seulement les recrues VIk Studios.
--
-- 1. accueils : classement (« hm » : contrat de HM ; « autre_activite » : une
--    autre équipe ou organisation que VIk Studios, ignorée pour toujours), sa
--    raison et sa date. Une ligne classée ne s'affiche plus dans Contracts to
--    link, et l'accueil automatique ne la reprend jamais (ni profil, ni welcome).
-- 2. Trigger accueils_classer (avant insert / update) : toute ligne d'une autre
--    organisation que VIk Studios est classée « autre_activite » ; une ligne de
--    VIk à relier sur un contrat horaire ou une annonce de HM est classée « hm ».
--    Un classement déjà posé n'est jamais changé.
-- 3. Les 5 contrats de l'équipe « Maximilien Kender » (Calyra) : autre activité,
--    ignorés. Erla Menaj (44805186, « Hiring Manager for TikTok Creators ») : HM.
--    Toute autre ligne d'une autre organisation (Leona Bikarova 44787783,
--    Calyra) : autre activité. Aucun profil n'est créé ni relié.
-- 4. bienvenues_a_envoyer (même signature) : jamais une ligne classée.
--
-- Additive : 3 colonnes, 2 fonctions, 1 trigger, 1 fonction remplacée,
-- 7 lignes d'accueil classées (rien d'autre n'est modifié).

alter table public.accueils add column if not exists classement text;
alter table public.accueils add column if not exists classement_raison text;
alter table public.accueils add column if not exists classement_at timestamptz;

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'accueils_classement_check' and conrelid = 'public.accueils'::regclass) then
    alter table public.accueils add constraint accueils_classement_check check (classement is null or classement in ('hm', 'autre_activite'));
  end if;
end;
$c$;

-- L'organisation Upwork de VIk Studios (la seule dont les contrats sont des recrues à relier).
create or replace function public.org_vik_studios(p_org text)
returns boolean
language sql
immutable
as $$
  select p_org = '2074065383597823773';
$$;

create or replace function public.accueils_classer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uc record;
begin
  if new.classement is not null then
    return new;
  end if;
  select u.organisation_id, u.organisation_nom, u.type, u.titre into uc
    from public.upwork_contrats u where u.contrat_id = new.contrat_id
   order by u.lu_at desc nulls last limit 1;
  if not public.org_vik_studios(coalesce(new.organisation_id, uc.organisation_id)) then
    new.classement := 'autre_activite';
    new.classement_raison := 'outside VIk Studios (' || coalesce(uc.organisation_nom, new.organisation_id, '?') || ') : ignored';
    new.classement_at := now();
  elsif new.statut in ('a_relier', 'a_creer', 'simule') and new.poster_id is null
        and (uc.type = 'Hourly' or coalesce(new.job_titre, uc.titre, '') ~* '(hiring|manager|recruit)') then
    new.classement := 'hm';
    new.classement_raison := 'HM contract (' || coalesce(new.job_titre, uc.titre, '?') || case when uc.type = 'Hourly' then ', hourly' else '' end || ')';
    new.classement_at := now();
  end if;
  return new;
exception when others then
  return new;
end;
$$;

do $t$
begin
  if not exists (select 1 from pg_trigger where tgname = 'accueils_classer' and tgrelid = 'public.accueils'::regclass) then
    create trigger accueils_classer
      before insert or update on public.accueils
      for each row execute function public.accueils_classer();
  end if;
end;
$t$;

update public.accueils
   set classement = 'autre_activite', classement_raison = 'autre activité (Calyra) : ignoré', classement_at = now()
 where contrat_id in ('44801090', '44800558', '44800323', '44798541', '44790806') and classement is null;

update public.accueils
   set classement = 'hm', classement_raison = 'HM contract (Hiring Manager for TikTok Creators, hourly)', classement_at = now()
 where contrat_id = '44805186' and classement is null;

update public.accueils a
   set classement = 'autre_activite',
       classement_raison = 'outside VIk Studios (' || coalesce((select u.organisation_nom from public.upwork_contrats u where u.contrat_id = a.contrat_id limit 1), a.organisation_id, '?') || ') : ignored',
       classement_at = now()
 where a.classement is null
   and not public.org_vik_studios(coalesce(a.organisation_id, (select u.organisation_id from public.upwork_contrats u where u.contrat_id = a.contrat_id limit 1)));

create or replace function public.bienvenues_a_envoyer()
returns table (contrat_id text, poster_id uuid, nom text, hm_nom text, pays text, cohorte_lundi date, cas text, connecte boolean, accepte_le timestamptz)
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
       -- 0493 : jamais un contrat classé (autre activité, contrat de HM).
       and a.classement is null
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

notify pgrst, 'reload schema';
