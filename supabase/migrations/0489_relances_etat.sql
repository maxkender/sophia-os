-- 0489 — Onboarding posters : la dernière relance de chaque recrue et le compteur du jour.
--
-- Règle des relances (1/11, fonction recrues-check) : une seule relance par
-- étape et par canal ; sur Slack d'abord, puis une seule sur Upwork si l'étape
-- n'est toujours pas faite 24 h après ; pas sur Slack : Upwork directement.
--
-- relances_etat() : pour chaque recrue qui a reçu une relance depuis 30 jours,
-- la dernière : l'étape, le canal, l'heure, et « Upwork prévu à » quand la
-- relance Slack de cette étape attend ses 24 h (aucune relance Upwork pour
-- cette étape, contrat relié). relances_compteur_jour() : relances parties
-- aujourd'hui (heure de Paris), sur Slack et sur Upwork.
--
-- Lecture seule : 2 fonctions.

create or replace function public.relances_etat()
returns table (poster_id uuid, etape text, canal text, envoye_at timestamptz, upwork_prevu_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (public.is_admin() or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()
                                         and ur.role in ('head_of_ops', 'hiring_manager', 'directing_manager'))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with n as (
    select n.poster_id, n.envoye_at, coalesce(n.canaux, '{}') as canaux,
           coalesce(n.donnees ->> 'element', (n.donnees -> 'elements' ->> 0)) as etape
      from public.nudges n
     where n.type = 'relance' and n.envoye_at is not null and n.envoye_at > now() - interval '30 days'
       and coalesce(array_length(n.canaux, 1), 0) > 0
  ),
  dernier as (
    select distinct on (n.poster_id) n.* from n order by n.poster_id, n.envoye_at desc
  )
  select d.poster_id, d.etape,
         case when 'upwork' = any (d.canaux) then 'upwork' else 'slack' end,
         d.envoye_at,
         case when not ('upwork' = any (d.canaux))
                   and not exists (select 1 from n u where u.poster_id = d.poster_id and u.etape = d.etape and 'upwork' = any (u.canaux))
                   and exists (select 1 from public.profiles p where p.id = d.poster_id and p.upwork_contract_id is not null)
              then d.envoye_at + interval '24 hours' end
    from dernier d;
end;
$$;
revoke all on function public.relances_etat() from public, anon;
grant execute on function public.relances_etat() to authenticated;

create or replace function public.relances_compteur_jour()
returns table (slack int, upwork int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()
                                         and ur.role in ('head_of_ops', 'hiring_manager', 'directing_manager'))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select count(*) filter (where 'slack' = any (n.canaux))::int, count(*) filter (where 'upwork' = any (n.canaux))::int
    from public.nudges n
   where n.type = 'relance'
     and (n.envoye_at at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date;
end;
$$;
revoke all on function public.relances_compteur_jour() from public, anon;
grant execute on function public.relances_compteur_jour() to authenticated;

notify pgrst, 'reload schema';
