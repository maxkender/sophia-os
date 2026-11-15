-- 0675 : « Support propre », mise en ligne (OK de Max, 12/11).
-- 1. Les 5 sortes de cartes que Max ne veut plus voir sont fermées dès leur création
--    (statut ferme_auto, raison « tri_support ») : « autre », « pas posté aujourd'hui »,
--    « a login but no Upwork contract and isn't on Slack », « Payroll API to check »,
--    lignes Slack non reliées. Elles deviennent un compteur par type dans le point du soir.
--    Les cartes déjà ouvertes de ces types sont fermées de la même façon (rien n'est supprimé).
-- 2. Les messages de posteurs rangés en « autre » passent par le bot v2 (tâche
--    support-messages, toutes les 15 min) : il répond (Slack s'il est relié, sinon email)
--    ou les met dans Support pour Adrien ou Max.
-- 3. support_demandes : le lien vers la carte d'origine (probleme_id) pour les messages repris.
-- 4. bot_tests : l'admin écrit ses tests depuis /admin/bot.
-- 5. Tâches : support-messages (*/15), support-soir (liste d'Adrien, 21 h Paris),
--    support-lundi (top 10 des questions sans réponse, lundi 8 h Paris).
-- Additif : un déclencheur, deux colonnes, des fonctions, trois tâches ; des cartes fermées.

alter table public.support_demandes add column if not exists probleme_id uuid;


create or replace function public.support_carte_retiree(p_categorie text, p_resume text, p_propose_par text)
returns text
language sql
immutable
as $$
  select case
    when p_categorie = 'autre' then 'autre'
    when p_categorie = 'pas_poste_aujourdhui' then 'pas_poste_aujourdhui'
    when coalesce(p_resume, '') ilike '%has a login but no Upwork contract%' then 'login_sans_contrat'
    when coalesce(p_resume, '') ilike 'Payroll API to check%' then 'payroll_api'
    when p_categorie = 'slack' and coalesce(p_propose_par, '') = 'os' then 'slack_non_relie'
  end;
$$;

create or replace function public.problemes_zz_tri_support()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.statut = 'ouvert' and public.support_carte_retiree(new.categorie, new.resume, new.propose_par) is not null then
    new.statut := 'ferme_auto';
    new.ferme_raison := 'tri_support';
    new.ferme_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function public.problemes_zz_tri_support() from public, anon, authenticated;
create or replace trigger problemes_zz_tri_support
  before insert on public.problemes
  for each row execute function public.problemes_zz_tri_support();

update public.problemes
   set statut = 'ferme_auto', ferme_raison = 'tri_support', ferme_at = now()
 where statut = 'ouvert' and public.support_carte_retiree(categorie, resume, propose_par) is not null;

/* Le point du soir : les cartes retirées du jour par type, et ce que le bot a réglé. */
create or replace function public.support_compteurs_jour()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'cartes_retirees', coalesce((select jsonb_object_agg(t, n) from (
        select public.support_carte_retiree(categorie, resume, propose_par) t, count(*) n from public.problemes
         where ferme_raison = 'tri_support' and created_at >= (date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')
         group by 1) x where t is not null), '{}'::jsonb),
    'regles_par_bot', (select count(*) from public.support_demandes
                        where coalesce(niveau, 'bot') = 'bot' and escalade_at is null
                          and cree_at >= (date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')),
    'adrien_ouverts', (select count(*) from public.support_demandes where niveau = 'adrien' and statut in ('ouvert', 'attente_posteur')),
    'max_ouverts', (select count(*) from public.support_demandes where niveau = 'max' and statut in ('ouvert', 'attente_posteur')))
  where public.is_admin() or coalesce(auth.role(), '') = 'service_role';
$$;
revoke execute on function public.support_compteurs_jour() from public, anon;
grant execute on function public.support_compteurs_jour() to authenticated, service_role;

do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'bot_tests' and policyname = 'bot_tests_admin_ecrire') then
    create policy bot_tests_admin_ecrire on public.bot_tests for insert to authenticated with check (public.is_admin_strict());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'bot_tests' and policyname = 'bot_tests_admin_modifier') then
    create policy bot_tests_admin_modifier on public.bot_tests for update to authenticated using (public.is_admin_strict()) with check (public.is_admin_strict());
  end if;
end
$p$;
grant insert, update on public.bot_tests to authenticated;

do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'support-messages') then
    perform cron.schedule('support-messages', '*/15 * * * *', $cmd$
      select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/support',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"messages_traiter"}'::jsonb, timeout_milliseconds := 140000)
    $cmd$);
  end if;
  if not exists (select 1 from cron.job where jobname = 'support-soir') then
    perform cron.schedule('support-soir', '0 19,20 * * *', $cmd$
      select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/support',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"liste_adrien"}'::jsonb, timeout_milliseconds := 60000)
    $cmd$);
  end if;
  if not exists (select 1 from cron.job where jobname = 'support-lundi') then
    perform cron.schedule('support-lundi', '0 6,7 * * 1', $cmd$
      select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/support',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"top10_lundi"}'::jsonb, timeout_milliseconds := 120000)
    $cmd$);
  end if;
end
$c$;
