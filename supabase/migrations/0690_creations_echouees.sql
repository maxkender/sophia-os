-- 0690 : une création de compte refusée (site → creer_posteur) laisse une trace, et une ligne pour
-- Max dans « Aujourd'hui » tant que le compte n'existe pas (Max, 12/11, point 0). Les erreurs
-- d'envoi du parcours Ruul du jour aussi. Additif : une table ; os_aujourdhui renvoie deux chiffres
-- de plus (mêmes champs qu'avant).
create table if not exists public.hub_echecs (
  hub_id     text primary key,
  email      text,
  nom        text,
  erreur     text not null,
  essais     integer not null default 1,
  premier_at timestamptz not null default now(),
  dernier_at timestamptz not null default now(),
  resolu_at  timestamptz
);
alter table public.hub_echecs enable row level security;
create policy hub_echecs_admin on public.hub_echecs for select to authenticated using (public.is_admin());

create or replace function public.os_aujourdhui()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pour_max', (select count(*) from public.support_demandes where niveau = 'max' and statut in ('ouvert', 'attente_posteur')),
    'pour_adrien', (select count(*) from public.support_demandes where coalesce(niveau, 'adrien') = 'adrien'
                      and escalade_at is not null and statut in ('ouvert', 'attente_posteur')),
    'ruul_a_inviter', (select count(*) from public.profiles where canal_paie = 'ruul' and is_active and ruul_statut = 'a_ajouter'),
    'contrats_a_relier', (select count(*) from public.accueils a
                           left join public.upwork_contrats u on u.contrat_id::text = a.contrat_id
                          where a.statut = 'a_relier' and a.classement is null
                            and coalesce(btrim(u.organisation_nom), 'VIk Studios') ilike 'vik studios'),
    'ruul_import_heures', (select floor(extract(epoch from now() - max(at)) / 3600)::int from public.ruul_imports where type = 'statuts'),
    'creations_echouees', (select count(*) from public.hub_echecs e
                            where e.resolu_at is null and e.dernier_at > now() - interval '7 days'
                              and not exists (select 1 from public.hub_posteurs h where h.hub_id = e.hub_id and h.statut = 'cree')),
    'parcours_erreurs', (select count(*) from public.ruul_parcours_envois where not ok and envoye_at > now() - interval '24 hours'))
  where public.is_admin();
$$;
revoke execute on function public.os_aujourdhui() from public, anon;
grant execute on function public.os_aujourdhui() to authenticated;
