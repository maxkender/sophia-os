-- 0513 — Liste du samedi : des recrues à voir en premier (décision de Max).
--
-- samedi_priorites (poster, lundi de la semaine, raison) : la liste du samedi
-- de cette semaine les montre en tête, avec la raison. Rien n'est proposé
-- d'office (pas de Kill par défaut, contrairement aux « toujours montrés ») :
-- Max choisit. Lecture : samedi_priorites_liste(lundi), admin.
--
-- Additif : une table, une fonction. Aucune autre table modifiée.

create table if not exists public.samedi_priorites (
  poster_id uuid not null references public.profiles(id) on delete cascade,
  lundi     date not null,
  raison    text not null,
  cree_at   timestamptz not null default now(),
  primary key (poster_id, lundi)
);
alter table public.samedi_priorites enable row level security;
do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'samedi_priorites' and policyname = 'samedi_priorites_admin') then
    create policy samedi_priorites_admin on public.samedi_priorites for select to authenticated using (public.is_admin());
  end if;
end
$p$;

create or replace function public.samedi_priorites_liste(p_lundi date)
returns table (poster_id uuid, raison text)
language sql
stable
security definer
set search_path = public
as $$
  select s.poster_id, s.raison
    from public.samedi_priorites s
   where s.lundi = p_lundi and public.is_admin();
$$;
revoke all on function public.samedi_priorites_liste(date) from public, anon;
grant execute on function public.samedi_priorites_liste(date) to authenticated;

notify pgrst, 'reload schema';
