-- Prompt 21, partie T : retirer les gens de Slack.
--
-- Le retrait des canaux se fait dans la fonction upwork, à chaque arrêt
-- complet. Le compte Slack, lui, ne peut pas être désactivé par le bot (SCIM :
-- plan Business+ ou Enterprise et jeton d'un admin) : chaque lundi à 8 h
-- (Paris), la liste « To remove from Slack » arrive dans Logs & to do (onglet
-- To do), avec « Open Slack members » et « Done ».
--
-- - a_faire : colonnes ref (l'arrêt) et lien (le bouton « Open ») ;
-- - slack_a_retirer_lundi() et le cron slack-retirer-lundi ;
-- - « Done » sur la liste coche aussi l'étape Slack de l'arrêt, et
--   « Fait à la main » sur Cohorts ferme la ligne de la liste.

alter table public.a_faire
  add column if not exists ref uuid,
  add column if not exists lien text;

insert into public.reglages (cle, valeur) values
  ('slack_membres_url', to_jsonb('https://sophia-system.slack.com/admin'::text))
on conflict (cle) do nothing;

/**
 * Les arrêts dont le compte Slack reste à désactiver : une ligne To do par
 * personne (nom Slack, raison, date de l'arrêt). Une seule fois par arrêt.
 */
create or replace function public.slack_a_retirer_lundi()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n   integer;
  v_url text := coalesce((select valeur #>> '{}' from public.reglages where cle = 'slack_membres_url'), 'https://slack.com/admin');
begin
  insert into public.a_faire (cle, type, gravite, titre, detail, poster_id, ref, lien)
  select 'slack:' || a.id, 'slack', 'todo',
         'To remove from Slack: ' || coalesce(nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), p.email, p.id::text),
         format('%s · arrêt du %s · Slack %s',
                case coalesce(a.motif, a.source)
                  when 'moins6' then 'moins de 6 posts'
                  when 'kill_48h' then 'Kill à 48 h'
                  when 'kill_samedi' then 'Kill du samedi'
                  when 'je_ne_veux_plus' then 'demande d''arrêt'
                  else 'arrêt manuel' end,
                to_char(a.created_at at time zone 'Europe/Paris', 'DD/MM'),
                p.slack_user_id),
         a.poster_id, a.id, v_url
    from public.arrets a
    join public.profiles p on p.id = a.poster_id
   where p.slack_user_id is not null
     and a.statut in ('fait', 'erreur', 'en_cours')
     and exists (select 1 from jsonb_array_elements(a.etapes) e where e->>'action' = 'slack' and e->>'statut' = 'a_faire')
  on conflict (cle) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.slack_a_retirer_lundi() from public, anon, authenticated;

/** « Done » : la ligne fermée ; pour Slack, l'étape de l'arrêt aussi. */
create or replace function public.a_faire_fait(p_id uuid, p_fait boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.a_faire;
begin
  if not public.is_admin() then
    raise exception 'réservé à l''admin et au Head of Ops';
  end if;
  update public.a_faire
     set fait_at = case when p_fait then now() end, fait_par = case when p_fait then auth.uid() end, maj_at = now()
   where id = p_id
  returning * into v;
  if p_fait and v.type = 'slack' and v.ref is not null then
    perform public.arret_action_faite(v.ref, 'slack');
  end if;
end;
$$;

/** « Fait à la main » sur Cohorts : la ligne « To remove from Slack » se ferme. */
create or replace function public.arrets_slack_fait()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from jsonb_array_elements(new.etapes) e where e->>'action' = 'slack' and e->>'statut' = 'fait')
     and not exists (select 1 from jsonb_array_elements(coalesce(old.etapes, '[]'::jsonb)) e where e->>'action' = 'slack' and e->>'statut' = 'fait') then
    update public.a_faire set fait_at = coalesce(fait_at, now()), fait_par = coalesce(fait_par, auth.uid()), maj_at = now()
     where type = 'slack' and ref = new.id and fait_at is null;
  end if;
  return new;
end;
$$;

create or replace trigger arrets_slack_fait
  after update of etapes on public.arrets
  for each row execute function public.arrets_slack_fait();

-- Lundi 7 h UTC = 8 h à Paris (heure d'hiver).
select cron.schedule('slack-retirer-lundi', '0 7 * * 1', 'select public.slack_a_retirer_lundi()');
