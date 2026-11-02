-- 0364 : décisions du samedi et liste de recrutement, côté HM.
--
-- 1) Le samedi, avec ses décisions, l'admin note « À recruter » par pays
--    (`ckd_recrutement`). La HM est déduite de la zone de recrutement, comme
--    le routage du site (fonction `ckd`, action `recrutement`) ; la cohorte est
--    le lundi à J+9 du samedi. À l'envoi aux HMs, `envoye_at` est posé : la
--    ligne apparaît sur le dashboard de la HM.
-- 2) Dashboard HM, « Décisions du samedi » : les propositions de ses posteurs
--    validées et envoyées (ne pas renouveler, doubler, nouveau compte), avec un
--    bouton « Fait » qui remplit `fait_at` / `fait_par`, comme le bouton Done
--    de Slack.
-- 3) Alarme : si des propositions du samedi ne sont pas validées le dimanche à
--    12 h, la fonction `ckd` (envoi_auto) écrit à Max sur Slack.
--
-- Additive : une table, trois fonctions.
-- Retour arrière : supprimer les fonctions et la table.

create table if not exists public.ckd_recrutement (
  id          uuid primary key default gen_random_uuid(),
  controle_id uuid not null references public.ckd_controles (id) on delete cascade,
  pays        text not null check (pays ~ '^[A-Z]{2}$'),
  hm_id       uuid,
  nombre      integer not null check (nombre > 0),
  -- Le lundi où ces recrues postent pour la première fois (samedi + 9 jours).
  cohorte     date not null,
  envoye_at   timestamptz,
  created_at  timestamptz not null default now(),
  maj_at      timestamptz not null default now(),
  unique (controle_id, pays)
);

create index if not exists ckd_recrutement_hm on public.ckd_recrutement (hm_id);

alter table public.ckd_recrutement enable row level security;

-- Admin : tout. HM : ses lignes, une fois envoyées. Écriture : fonction `ckd`.
drop policy if exists ckd_recrutement_lecture on public.ckd_recrutement;
create policy ckd_recrutement_lecture on public.ckd_recrutement
  for select to authenticated
  using (public.is_admin() or (hm_id = (select auth.uid()) and envoye_at is not null));

grant select on public.ckd_recrutement to authenticated;
grant all on public.ckd_recrutement to service_role;

-- Les décisions envoyées pour les posteurs de la HM (21 derniers jours).
create or replace function public.ckd_decisions_hm()
returns table (
  id               uuid,
  jour             date,
  decision         text,
  compte_id        uuid,
  poster_id        uuid,
  handle           text,
  pays             text,
  nouveau_handle   text,
  note             text,
  envoye_at        timestamptz,
  fait_at          timestamptz,
  fait_par         text,
  diagnostic       jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_hm uuid;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    if not public.is_hiring_manager() then
      raise exception 'ckd_decisions_hm : réservé à l''admin et aux HMs';
    end if;
  end if;
  v_hm := auth.uid();

  return query
  select p.id, p.jour, p.decision, p.compte_id, p.poster_id,
         p.donnees->>'handle', p.pays,
         (select c.handle_tiktok from public.comptes c where c.id = p.nouveau_compte_id),
         p.note, p.envoye_at, p.fait_at, p.fait_par,
         public.ckd_diagnostic(p.donnees)
    from public.ckd_propositions p
    join public.profiles pr on pr.id = p.poster_id
   where p.decision in ('ne_pas_renouveler', 'doubler', 'recreer')
     and p.envoye_at is not null
     and p.envoye_at > now() - interval '21 days'
     and pr.manager_id = v_hm
   order by p.fait_at nulls first, p.envoye_at desc;
end;
$$;

-- « Fait » depuis le dashboard : la HM du posteur, ou l'admin.
create or replace function public.ckd_fait_hm(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poster uuid;
  v_par text;
begin
  select poster_id into v_poster from public.ckd_propositions
   where id = p_id and envoye_at is not null and decision in ('ne_pas_renouveler', 'doubler', 'recreer');
  if v_poster is null then
    raise exception 'ckd_fait_hm : décision introuvable ou pas envoyée';
  end if;
  if not public.is_admin()
     and not exists (select 1 from public.profiles p where p.id = v_poster and p.manager_id = auth.uid()) then
    raise exception 'ckd_fait_hm : réservé à la HM du posteur et à l''admin';
  end if;
  -- Comme le bouton Done de Slack : l'identifiant Slack si on le connaît, sinon le prénom.
  select coalesce(h.slack_user_id, nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), p.email)
    into v_par
    from public.profiles p
    left join public.hm_slack h on h.profile_id = p.id
   where p.id = auth.uid();
  update public.ckd_propositions
     set fait_at = now(), fait_par = coalesce(v_par, 'OS')
   where id = p_id and fait_at is null;
end;
$$;

revoke execute on function public.ckd_decisions_hm() from public, anon;
revoke execute on function public.ckd_fait_hm(uuid) from public, anon;
grant execute on function public.ckd_decisions_hm() to authenticated, service_role;
grant execute on function public.ckd_fait_hm(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
