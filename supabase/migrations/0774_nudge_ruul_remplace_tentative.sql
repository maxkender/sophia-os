-- 0774 : nudge Ruul du jeudi (19/11). Une tentative de nudge qui n'est pas partie (ex. DM Slack en pause, aucun canal)
-- occupe la ligne unique (posteur, jeudi, semaine) de nudges : le nudge Ruul envoyé par email + bandeau la remplace
-- (sinon il n'était pas noté et la ligne restait « pas nudgé »). Un nudge réellement parti n'est jamais écrasé.
create or replace function public.jeudi_nudge_ruul_noter(p_poster uuid, p_compte uuid, p_lundi date, p_texte text, p_canaux text[], p_erreur text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.nudges (poster_id, compte_id, type, cible, canal, texte, envoye_at, periode, canaux, erreur_canal, slack_erreur, raison)
  values (p_poster, p_compte, 'jeudi', 'posteur', 'os', p_texte, now(), p_lundi, coalesce(p_canaux, '{}'), p_erreur,
          case when coalesce(array_length(p_canaux, 1), 0) = 0 then coalesce(p_erreur, 'aucun canal') end, 'jeudi_ruul')
  on conflict (poster_id, type, periode) where periode is not null do update
     set compte_id = excluded.compte_id, canal = excluded.canal, texte = excluded.texte, envoye_at = excluded.envoye_at,
         canaux = excluded.canaux, erreur_canal = excluded.erreur_canal, slack_erreur = excluded.slack_erreur, raison = excluded.raison
   where coalesce(array_length(public.nudges.canaux, 1), 0) = 0;
$$;
revoke all on function public.jeudi_nudge_ruul_noter(uuid, uuid, date, text, text[], text) from public, anon, authenticated;
grant execute on function public.jeudi_nudge_ruul_noter(uuid, uuid, date, text, text[], text) to service_role;

-- La raison d'une tentative pas partie (DM Slack en pause) est dans slack_erreur : decisions_ruul la lit aussi.
do $p$
declare
  d text := pg_get_functiondef('public.decisions_ruul(uuid[])'::regprocedure);
  avant text := $a$'erreur', n.erreur_canal)$a$;
begin
  if position('0774' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0774 : decisions_ruul ne correspond pas'; end if;
  execute replace(d, avant, $a$'erreur', coalesce(n.erreur_canal, n.slack_erreur) /* 0774 */)$a$);
end
$p$;
