-- 0463 — L'arrêt complet en deux temps, sans aucun message.
--
-- 1. Samedi, à Validate (et à chaque arrêt à la main) : tout de suite, sans
--    aucun appel d'API, quel que soit `arret_auto` :
--    - posteur et comptes désactivés dans l'OS, ses messages prévus périmés ;
--    - la ligne « To remove from Slack » (Logs & to do) créée tout de suite
--      (avant : le lundi 8 h, et seulement après le passage de la fonction upwork).
--    Trigger `arrets_immediat` : chaque nouvel arrêt passe par arret_immediat.
-- 2. Lundi, après la paie : le contrat fermé par l'API (fonction upwork,
--    action arrets, finsDeContrat), seulement si arret_auto = on ET si le
--    dernier test de fermeture (Overview → Test contracts) a fermé le contrat.
--    Jamais posté compris (semaine à 0 $) : arrets_fins_a_faire ne demande plus
--    a_poste. En test, la fermeture simulée ne sort plus la ligne de la file
--    (elle partira pour de vrai sur on).
-- 3. Aucun message au Kill : plus de « Your contract has ended… » (le réglage
--    arret_message_texte reste en base, il n'est plus lu).
--
-- Additive : 2 fonctions, 1 trigger, 1 fonction modifiée. Aucune donnée
-- existante modifiée (la file arrets est vide).

create or replace function public.arret_immediat(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  v_a_poste boolean;
  v_slack text;
begin
  select x.id, x.poster_id, x.statut, x.annule_at into a from public.arrets x where x.id = p_id for update;
  if not found or a.statut <> 'a_faire' or a.annule_at is not null then
    return;
  end if;
  v_a_poste := exists (select 1 from public.passages p join public.comptes c on c.id = p.compte_id
                        where c.poster_id = a.poster_id and (p.publie_at is not null or p.publie_url is not null));
  select slack_user_id into v_slack from public.profiles where id = a.poster_id;
  update public.profiles set is_active = false where id = a.poster_id and is_active;
  update public.comptes set is_active = false where poster_id = a.poster_id and is_active;
  -- Ses messages prévus ne partent plus (statut, rien n'est effacé).
  update public.relances_prevues set statut = 'perime', maj_at = now() where poster_id = a.poster_id and statut = 'prevu';
  update public.arrets
     set statut = 'fait', a_poste = v_a_poste, sans_message = true, maj_at = now(),
         etapes = jsonb_build_array(
           jsonb_build_object('action', 'os', 'statut', 'fait', 'detail', 'posteur et comptes désactivés', 'at', now()),
           jsonb_build_object('action', 'message', 'statut', 'sans_objet', 'detail', 'aucun message au Kill', 'at', now()),
           case when v_slack is not null
                then jsonb_build_object('action', 'slack', 'statut', 'a_faire', 'detail', 'liste « To remove from Slack »', 'at', now())
                else jsonb_build_object('action', 'slack', 'statut', 'sans_objet', 'detail', 'pas de compte Slack relié', 'at', now()) end,
           jsonb_build_object('action', 'paie', 'statut', 'a_faire',
                              'detail', 'lundi, après la paie : contrat fermé par l''API (si le test de fermeture est bon)', 'at', now()))
   where id = a.id;
  -- La ligne « To remove from Slack », tout de suite (une seule fois par arrêt).
  perform public.slack_a_retirer_lundi();
end;
$$;
revoke all on function public.arret_immediat(uuid) from public, anon, authenticated;
grant execute on function public.arret_immediat(uuid) to service_role;

create or replace function public.arrets_immediat_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.arret_immediat(new.id);
  return null;
end;
$$;
revoke all on function public.arrets_immediat_trigger() from public, anon, authenticated;

drop trigger if exists arrets_immediat on public.arrets;
create trigger arrets_immediat after insert on public.arrets
  for each row when (new.statut = 'a_faire' and new.annule_at is null)
  execute function public.arrets_immediat_trigger();

-- Lundi : jamais posté compris ; une fermeture simulée (test) ne sort plus la ligne de la file.
do $p$
declare
  v_def text := pg_get_functiondef('public.arrets_fins_a_faire()'::regprocedure);
  v_a1 text := $q$where x.statut in ('fait', 'erreur') and x.a_poste$q$;
  v_n1 text := $q$where x.statut in ('fait', 'erreur')$q$;
  v_a2 text := $q$where e->>'action' = 'fermeture' and e->>'statut' in ('fait', 'simule', 'a_faire'))$q$;
  v_n2 text := $q$where e->>'action' = 'fermeture' and e->>'statut' in ('fait', 'a_faire'))$q$;
begin
  if position(v_a1 in v_def) = 0 or position(v_a2 in v_def) = 0 then
    raise exception '0463 : arrets_fins_a_faire ne correspond pas';
  end if;
  execute replace(replace(v_def, v_a1, v_n1), v_a2, v_n2);
end;
$p$;

notify pgrst, 'reload schema';
