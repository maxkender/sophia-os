-- 0506 — Un utilisateur de connexion pour les bots : bots_lecteur, qui hérite
-- de bots_lecture (0503 : select sur upwork_messages, nouveaux_messages,
-- conversation_complete). Sessions en lecture seule par défaut, 30 s par
-- requête, 5 connexions au plus. Le mot de passe est tiré au hasard DANS la
-- base et rangé dans Vault (secret « bots_lecteur_password ») : il n'apparaît
-- ni ici, ni dans un résultat, ni dans un journal. Additif.

do $r$
declare
  v_mdp text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not exists (select 1 from pg_roles where rolname = 'bots_lecteur') then
    execute 'create role bots_lecteur login noinherit connection limit 5';
    execute format('alter role bots_lecteur password %L', v_mdp);
    perform vault.create_secret(v_mdp, 'bots_lecteur_password', 'Mot de passe de connexion du rôle bots_lecteur (lecture seule des conversations Upwork)');
  end if;
end
$r$;

alter role bots_lecteur inherit;
grant bots_lecture to bots_lecteur;
alter role bots_lecteur set default_transaction_read_only = on;
alter role bots_lecteur set statement_timeout = '30s';
alter role bots_lecteur set search_path = public;

-- Connecté en bots_lecteur (pas seulement « set role bots_lecture ») : accepté aussi.
create or replace function public.conversation_lecteur_ok()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_setting('role', true) = 'bots_lecture' or session_user = 'bots_lecteur'
      or coalesce(auth.role(), '') = 'service_role' or public.is_admin()
      or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'head_of_ops');
$$;
