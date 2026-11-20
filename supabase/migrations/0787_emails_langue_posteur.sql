-- 0787 : les emails Ruul de l'OS aux posteurs partent dans la langue de leur pays (Max, 20/11). Additif.
-- 1. email_langue_pays(pays) : la langue d'un pays pour les emails (celle du parrainage, plus BA, ME, MK, AL, UA, ID).
-- 2. email_langue_poster(poster) : la langue d'un posteur, d'après le pays de son compte actif (sinon de sa candidature).
-- 3. traductions_emails : les traductions déjà faites (une par langue et par texte), réutilisées ; les valeurs
--    propres au posteur (nom, mot de passe, liens, emails, montants) sont remplacées par [[1]], [[2]]… avant la
--    traduction : elles ne sont jamais envoyées au traducteur ni gardées ici.

-- 1.
create or replace function public.email_langue_pays(p_pays text)
returns text
language sql
immutable
as $$
  select coalesce((select l from (values ('BA', 'bs'), ('ME', 'sr'), ('MK', 'mk'), ('AL', 'sq'), ('XK', 'sq'), ('UA', 'uk'), ('ID', 'id'))
                    m(p, l) where m.p = upper(coalesce(p_pays, ''))),
                  public.parrainage_langue_pays(p_pays));
$$;

-- 2.
create or replace function public.email_langue_poster(p_poster uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.email_langue_pays(coalesce(
    (select c.pays from public.comptes c where c.poster_id = p_poster and c.is_active order by c.created_at limit 1),
    (select r.pays from public.ruul_candidatures r where r.os_profile_id = p_poster order by r.cree_at desc limit 1)));
$$;
revoke all on function public.email_langue_poster(uuid) from public, anon, authenticated;
grant execute on function public.email_langue_poster(uuid) to service_role;

-- 3.
create table if not exists public.traductions_emails (
  langue text not null,
  cle text not null,
  source jsonb not null,
  traduction jsonb not null,
  cree_at timestamptz not null default now(),
  primary key (langue, cle)
);
alter table public.traductions_emails enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'traductions_emails' and policyname = 'traductions_emails_admin') then
    create policy traductions_emails_admin on public.traductions_emails for select to authenticated using (public.is_admin());
  end if;
end $$;

notify pgrst, 'reload schema';
