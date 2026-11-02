-- 0505 — Accès des bots en lecture seule (0503) : le connecteur Supabase peut
-- prendre le rôle bots_lecture (« set local role bots_lecture »), et
-- conversation_lecteur_ok() reconnaît ce rôle (dans une fonction security
-- definer, current_user est le propriétaire : on lit le rôle de la session).
-- Additif : un droit, une fonction remplacée.

grant bots_lecture to postgres;

create or replace function public.conversation_lecteur_ok()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_setting('role', true) = 'bots_lecture'
      or coalesce(auth.role(), '') = 'service_role' or public.is_admin()
      or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'head_of_ops');
$$;
