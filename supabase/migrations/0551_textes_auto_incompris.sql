-- 0551 : les textes envoyés automatiquement, avec le nombre de « What does it
-- mean / I don't understand » reçus après chacun.
--
-- texte_incompris(t) : un message du posteur qui dit ne pas comprendre
-- (anglais surtout, et les tournures courantes en français, espagnol, turc).
-- textes_auto_incompris(p_jours) : pour chaque type de message automatique
-- parti (relances, nudges, popup Recreate, rappels, bienvenue, fin de
-- contrat… : tout ce que liste messages_envoyes), le nombre d'envois, de
-- posteurs, de réponses « incompris » (la réponse est rattachée au dernier
-- message automatique parti à ce posteur dans les 48 h avant), le dernier
-- texte parti et 3 exemples de réponses. Lecture seule, admin.

create or replace function public.texte_incompris(p_texte text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_texte, '') ~* ('(what (does|do|did) (it|this|that|you|u) mean|what do (you|u) mean|what is (the )?meaning|meaning\?'
           || '|\mi (don.?t|do not|didn.?t|did not|dont|can.?t|cannot) (understand|get it|get what|follow)|not sure what (you|this|it|i)'
           || '|\mconfus|\munclear\M|not clear|(can|could) (you|u) (please )?explain|what am i supposed to|what should i do( now)?\?'
           || '|je (ne )?comprends pas|c.?est quoi|no entiendo|no entend|qu[eé] significa|anlamad[ıi]m|ne demek)');
$$;

create or replace function public.textes_auto_incompris(p_jours integer default 30)
returns table(type text, envoyes integer, posteurs integer, incompris integer, dernier_texte text, dernier_at timestamptz, exemples jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_depuis timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_jours, 30), 90)));
begin
  if not public.is_admin() then
    raise exception 'textes_auto_incompris : réservé à l''admin' using errcode = '42501';
  end if;
  return query
  with env as (
    select e.at, e.poster_id, e.type, e.texte
      from public.messages_envoyes(v_depuis) e
     where e.etat = 'envoye' and e.poster_id is not null and e.type is distinct from 'reponse_auto'
  ),
  rep as (
    select um.poster_id, um.at, um.texte from public.upwork_messages um
     where um.role = 'posteur' and um.at > v_depuis and public.texte_incompris(um.texte)
    union all
    select r.poster_id, r.recu_at, r.texte from public.posteur_reponses r
     where r.canal in ('slack', 'bouton') and r.recu_at > v_depuis and public.texte_incompris(r.texte)
    union all
    select pr.id, sm.at, sm.texte from public.slack_messages sm join public.profiles pr on pr.slack_user_id = sm.slack_user
     where sm.at > v_depuis and public.texte_incompris(sm.texte)
  ),
  rattache as (
    select distinct on (r.poster_id, r.at) e.type, r.poster_id, r.at, r.texte
      from rep r
      join env e on e.poster_id = r.poster_id and e.at <= r.at and e.at > r.at - interval '48 hours'
     order by r.poster_id, r.at, e.at desc
  ),
  par_type as (
    select e.type, count(*)::int as envoyes, count(distinct e.poster_id)::int as posteurs, max(e.at) as dernier_at
      from env e group by e.type
  )
  select t.type, t.envoyes, t.posteurs,
         coalesce((select count(*)::int from rattache a where a.type = t.type), 0),
         (select left(e.texte, 2000) from env e where e.type = t.type and e.texte is not null order by e.at desc limit 1),
         t.dernier_at,
         coalesce((select jsonb_agg(jsonb_build_object('at', x.at, 'texte', left(x.texte, 300)) order by x.at desc)
                     from (select a.at, a.texte from rattache a where a.type = t.type order by a.at desc limit 3) x), '[]'::jsonb)
    from par_type t
   order by 4 desc, 2 desc;
end;
$$;

revoke execute on function public.textes_auto_incompris(integer) from public, anon;
grant execute on function public.textes_auto_incompris(integer) to authenticated;
