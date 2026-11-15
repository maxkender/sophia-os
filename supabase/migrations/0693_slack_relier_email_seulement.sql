-- 0693 : NOUVELLE RÈGLE (Max, 12/11) — un compte Slack n'est rattaché à une fiche que si
-- l'EMAIL du profil Slack correspond à un email connu de la fiche. Jamais par le prénom ni le nom.
-- Si ce n'est pas sûr (aucun email, ou l'email mène à plusieurs fiches), on ne rattache pas :
-- la fiche reste dans « Slack à relier ».
-- Emails connus d'une fiche : email de connexion, email perso, email Ruul, email du site
-- (hub_posteurs), emails de la candidature Ruul.
-- Additif : une fonction nouvelle, une fonction redéfinie (même signature).

/* Tous les emails connus de chaque fiche posteur (en minuscules). */
create or replace function public.slack_posteur_emails()
returns table (id uuid, emails text[])
language sql
stable
security definer
set search_path = public
as $$
  select x.id, array_agg(distinct x.e order by x.e)
    from (
      select pr.id, lower(btrim(v.e)) as e
        from public.profiles pr
        cross join lateral (values (pr.email), (pr.email_perso), (pr.ruul_email)) v(e)
      union all
      select h.profile_id, lower(btrim(h.email_perso)) from public.hub_posteurs h where h.profile_id is not null
      union all
      select c.os_profile_id, lower(btrim(v.e))
        from public.ruul_candidatures c
        cross join lateral (values (c.email), (c.ruul_email)) v(e)
       where c.os_profile_id is not null
    ) x
   where x.e is not null and x.e <> ''
     and exists (select 1 from public.user_roles r where r.user_id = x.id and r.role = 'poster')
   group by x.id;
$$;
revoke execute on function public.slack_posteur_emails() from public, anon, authenticated;
grant execute on function public.slack_posteur_emails() to service_role;

create or replace function public.slack_relier_regles(p_posteur uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  v_n int := 0;
begin
  for m in
    with membres as (
      select sm.slack_user_id, coalesce(nullif(sm.nom_reel, ''), sm.nom_affiche) as nom, lower(btrim(sm.email)) as email
        from public.slack_membres sm
       where not coalesce(sm.bot, false) and not coalesce(sm.supprime, false)
         and nullif(btrim(sm.email), '') is not null
         and not exists (select 1 from public.profiles q where q.slack_user_id = sm.slack_user_id)
         -- Le compte Slack d'une HM (Adrien…) n'est jamais celui d'un posteur.
         and not exists (select 1 from public.hm_slack hs where hs.slack_user_id = sm.slack_user_id)
         and (p_posteur is not null or coalesce(sm.premier_vu_at, sm.vu_at) > now() - interval '14 days')
    ),
    -- Les fiches actives sans Slack dont un email connu est celui du membre Slack.
    paires as (
      select distinct mb.slack_user_id, mb.nom, pr.id as pid
        from membres mb
        join public.slack_posteur_emails() pe on mb.email = any (pe.emails)
        join public.profiles pr on pr.id = pe.id
       where pr.is_active and pr.slack_user_id is null
         and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id and h.exclu_suivi /* 0575 */)
    ),
    comptes as (
      select pa.*, count(*) over (partition by pa.slack_user_id) as fiches_du_membre,
             count(*) over (partition by pa.pid) as membres_de_la_fiche
        from paires pa
    )
    -- Sûr seulement si l'email mène à une seule fiche, et la fiche à un seul compte Slack.
    select c.slack_user_id, c.nom, c.pid from comptes c
     where c.fiches_du_membre = 1 and c.membres_de_la_fiche = 1
       and (p_posteur is null or c.pid = p_posteur)
  loop
    update public.profiles set slack_user_id = m.slack_user_id, slack_lie_par = 'email', slack_lie_at = now()
     where id = m.pid and slack_user_id is null;
    if found then
      v_n := v_n + 1;
      update public.relances_prevues r set statut = 'perime', raison = 'slack relié : la relance passe par Slack', maj_at = now()
       where r.poster_id = m.pid and r.statut = 'prevu' and (r.canal = 'upwork' or r.donnees ->> 'canal_relance' = 'upwork');
      perform public.recrue_evenement_noter(m.pid, null, 'slack_relie', now(),
        'Slack linked (email) : ' || coalesce(m.nom, m.slack_user_id), 'slack_relie:' || m.slack_user_id);
    end if;
  end loop;
  return v_n;
end;
$$;
