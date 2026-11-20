-- 0803 : support, emails reliés (Max, 21/11). Additif.
-- 1. posteur_emails : les adresses d'un posteur reconnues plus tard (il écrit d'une nouvelle adresse et on l'a
--    retrouvé par son @TikTok, son contrat ou son nom) : ajoutées à sa fiche, cherchées en premier.
-- 2. support_conversation : le fil d'un posteur montre aussi les emails envoyés à profiles.email_perso et aux adresses
--    de posteur_emails (bienvenue, relances, paie, fin, réponses du support…), avec leur statut Brevo.

-- 1.
create table if not exists public.posteur_emails (
  email text primary key,
  poster_id uuid not null references public.profiles(id) on delete cascade,
  source text,
  cree_at timestamptz not null default now()
);
create index if not exists posteur_emails_poster on public.posteur_emails (poster_id);
alter table public.posteur_emails enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'posteur_emails' and policyname = 'posteur_emails_admin') then
    create policy posteur_emails_admin on public.posteur_emails for select to authenticated using (public.is_admin());
  end if;
end $$;

-- 2.
do $$
declare
  d text := pg_get_functiondef('public.support_conversation(uuid)'::regprocedure);
  a text := 'v_emails := array_remove(array[lower(pr.email), lower(pr.ruul_email),
    (select lower(h.email_perso) from public.hub_posteurs h where h.profile_id = p_poster limit 1)], null);';
begin
  if position('0803' in d) > 0 then return; end if;
  if position(a in d) = 0 then raise exception '0803 : support_conversation a changé'; end if;
  d := replace(d, a, 'v_emails := array_remove(array[lower(pr.email), lower(pr.ruul_email), lower(pr.email_perso) /* 0803 */,
    (select lower(h.email_perso) from public.hub_posteurs h where h.profile_id = p_poster limit 1)], null)
    || coalesce((select array_agg(pe.email) from public.posteur_emails pe where pe.poster_id = p_poster), ''{}''::text[]);');
  execute d;
end $$;
