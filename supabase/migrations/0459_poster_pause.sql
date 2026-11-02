-- #poster-pause (C0CDF609030) : là où les posteurs demandent à arrêter.
--
-- Chaque message humain du canal (gardé dans slack_messages par slack-faq) :
--   * relié au posteur par son compte Slack → demande d'arrêt (demande_arret_noter,
--     source « message ») : ses relances s'arrêtent et le samedi propose
--     Kill & pay (Kill pré-coché). Pas de Kill automatique, aucune réponse ;
--   * badge « Wants to stop » et le message dans la colonne Context
--     (messages_posteurs : cas « stop ») ;
--   * relié à personne → Needs you « Message in #poster-pause » (To read
--     exige un posteur ; la carte donne le lien du message).
-- Seuls les messages de moins de 7 jours ouvrent une demande (une reprise
-- d'historique ne rouvre pas d'anciennes demandes déjà traitées).

insert into public.reglages (cle, valeur) values ('slack_canal_pause', to_jsonb('C0CDF609030'::text))
on conflict (cle) do nothing;

create or replace function public.canal_pause()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select r.valeur #>> '{}' from public.reglages r where r.cle = 'slack_canal_pause'), 'C0CDF609030');
$$;

create or replace function public.slack_message_pause()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poster uuid;
begin
  if new.canal <> public.canal_pause() or new.at < now() - interval '7 days' then
    return new;
  end if;
  select p.id into v_poster from public.profiles p
   where p.slack_user_id = new.slack_user and p.is_active
     and not exists (select 1 from public.hub_posteurs h where h.profile_id = p.id)
   order by p.created_at limit 1;
  if v_poster is not null then
    perform public.demande_arret_noter(v_poster, 'message', 'Message in #poster-pause : ' || left(coalesce(new.texte, ''), 300), null);
  end if;
  return new;
end;
$$;

create trigger slack_messages_pause
after insert on public.slack_messages
for each row execute function public.slack_message_pause();

-- messages_posteurs : un message de #poster-pause porte le cas « stop » (badge « Wants to stop »).
do $p$
declare
  v_def text := pg_get_functiondef('public.messages_posteurs(uuid[])'::regprocedure);
  v_avant text := $a$'https://sophia-system.slack.com/archives/' || sm.canal || '/p' || replace(sm.ts, '.', ''), null
    from public.slack_messages sm$a$;
  v_apres text := $a$'https://sophia-system.slack.com/archives/' || sm.canal || '/p' || replace(sm.ts, '.', ''),
         case when sm.canal = public.canal_pause() then 'stop' end
    from public.slack_messages sm$a$;
begin
  if position(v_avant in v_def) = 0 then
    raise exception 'messages_posteurs : la lecture de slack_messages attendue est introuvable';
  end if;
  execute replace(v_def, v_avant, v_apres);
end;
$p$;

-- needs_you : un message de #poster-pause relié à personne (14 jours).
do $p$
declare
  v_def text := pg_get_functiondef('public.needs_you()'::regprocedure);
  v_ancre text := $a$    union all
    select 'samedi:' || cp.id$a$;
  v_ajout text := $a$    union all
    select 'pause:' || sm.canal || ':' || sm.ts, 'pas_pu_repondre', 'pause_non_relie', null::uuid, sm.slack_user,
           left(coalesce(sm.texte, ''), 400),
           'Message in #poster-pause from a Slack account not linked to a poster: link their Slack, then the stop request is noted',
           null, 'rien', sm.at, array['ouvrir', 'ignorer'], sm.ts,
           'https://sophia-system.slack.com/archives/' || sm.canal || '/p' || replace(sm.ts, '.', ''), null, 1
      from public.slack_messages sm
     where sm.canal = public.canal_pause() and sm.at > now() - interval '14 days'
       and not exists (select 1 from public.profiles p where p.slack_user_id = sm.slack_user)
       and not exists (select 1 from public.hm_slack h where h.slack_user_id = sm.slack_user)
$a$;
begin
  if position(v_ancre in v_def) = 0 then
    raise exception 'needs_you : l''ancre samedi est introuvable';
  end if;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) / length(v_ancre) <> 1 then
    raise exception 'needs_you : l''ancre samedi apparaît plusieurs fois';
  end if;
  execute replace(v_def, v_ancre, v_ajout || v_ancre);
end;
$p$;

notify pgrst, 'reload schema';
