-- 0387 — Upwork, point 2a : lire les contrats actifs (lecture seule).
--
-- `upwork_contrats` : les contrats actifs des organisations connectées
-- (Vik Studios, compte perso de Max, Micabo…), tels que l'API les rend
-- (organization.clientOffers, état Active), relus à chaque passage. Sert au
-- rapprochement avec les posteurs (point 2b), qui viendra après le décompte.
--
-- Additive : une table. Rien n'est écrit sur Upwork, aucun posteur n'est
-- modifié.

create table if not exists public.upwork_contrats (
  offre_id          text primary key,
  contrat_id        text,
  organisation_id   text not null,
  organisation_nom  text,
  titre             text,
  type              text,
  etat              text,
  jalon_etat        text,
  debut_at          timestamptz,
  freelancer_id     text,
  freelancer_nom    text,
  freelancer_pays   text,
  equipe_id         text,
  equipe_nom        text,
  actif             boolean not null default true,
  lu_at             timestamptz not null default now(),
  brut              jsonb
);

create index if not exists upwork_contrats_org on public.upwork_contrats (organisation_id);

alter table public.upwork_contrats enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'upwork_contrats'
                  and policyname = 'upwork_contrats_lecture_admin') then
    create policy upwork_contrats_lecture_admin on public.upwork_contrats for select to authenticated
      using (public.is_admin());
  end if;
end
$$;

comment on table public.upwork_contrats is
  'Upwork (0387) : contrats actifs lus à l''API (organization.clientOffers), pour relier les posteurs (point 2b).';

notify pgrst, 'reload schema';
