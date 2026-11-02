-- 0477 — Le secret des crons passe dans le Vault, pour pouvoir le tourner sans l'afficher.
--
-- 1. Vault « cron_secret » : créé avec la valeur actuelle (lue dans une commande
--    de cron, jamais affichée) : rien ne change au moment de la migration.
-- 2. Les commandes des crons ne portent plus la valeur : l'en-tête x-cron-secret
--    lit le Vault au moment de partir.
-- 3. cron_secret_lire() : pour les fonctions Edge (service_role seulement).
-- 4. cron_secret_tourner() : une nouvelle valeur aléatoire (64 caractères hex)
--    dans le Vault ; crons et fonctions la prennent dans la minute. Admin seulement,
--    ne renvoie jamais la valeur.
--
-- Additive : 1 secret du Vault, 2 fonctions, commandes des crons réécrites (la
-- valeur en clair remplacée par la lecture du Vault). Aucune donnée métier touchée.

do $v$
declare
  v text;
  n int;
begin
  if exists (select 1 from vault.secrets where name = 'cron_secret') then
    return;
  end if;
  select count(distinct (regexp_match(j.command, '(?i)''x-cron-secret''\s*,\s*''([^'']+)'''))[1]) into n
    from cron.job j where j.command ~* '''x-cron-secret''\s*,\s*''[^'']+''';
  if n <> 1 then
    raise exception '0477 : % valeurs différentes du secret dans les crons (1 attendue)', n;
  end if;
  select (regexp_match(j.command, '(?i)''x-cron-secret''\s*,\s*''([^'']+)'''))[1] into v
    from cron.job j where j.command ~* '''x-cron-secret''\s*,\s*''[^'']+''' limit 1;
  if v is null or length(v) < 16 then
    raise exception '0477 : secret actuel introuvable';
  end if;
  perform vault.create_secret(v, 'cron_secret', 'En-tête x-cron-secret des crons et des appels entre fonctions (0477)');
end;
$v$;

create or replace function public.cron_secret_lire()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'cron_secret' limit 1;
$$;
revoke all on function public.cron_secret_lire() from public, anon, authenticated;
grant execute on function public.cron_secret_lire() to service_role;

do $c$
declare
  j record;
  n int := 0;
begin
  for j in select jobid, command from cron.job where command ~* '''x-cron-secret''\s*,\s*''[^'']+''' loop
    perform cron.alter_job(
      j.jobid,
      command := regexp_replace(
        j.command,
        '''x-cron-secret''\s*,\s*''[^'']+''',
        '''x-cron-secret'', (select s.decrypted_secret from vault.decrypted_secrets s where s.name = ''cron_secret'' limit 1)',
        'gi'
      )
    );
    n := n + 1;
  end loop;
  if exists (select 1 from cron.job where command ~* '''x-cron-secret''\s*,\s*''[^'']+''') then
    raise exception '0477 : un cron porte encore la valeur en clair';
  end if;
  raise notice '0477 : % crons lisent le Vault', n;
end;
$c$;

create or replace function public.cron_secret_tourner()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (public.is_admin() or session_user in ('postgres', 'supabase_admin')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select s.id into v_id from vault.secrets s where s.name = 'cron_secret';
  if v_id is null then
    raise exception 'cron_secret absent du Vault';
  end if;
  perform vault.update_secret(v_id, encode(extensions.gen_random_bytes(32), 'hex'));
  return true;
end;
$$;
revoke all on function public.cron_secret_tourner() from public, anon;
grant execute on function public.cron_secret_tourner() to authenticated;
