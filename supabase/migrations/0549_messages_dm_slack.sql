-- 0549 : les DM Slack du posteur à l'app Sophia OS (onglet Messages de l'App
-- Home, désormais ouvert) et la fenêtre « I need help » arrivent dans
-- Problèmes.
--
-- Ces messages sont gardés dans posteur_reponses (canal slack / bouton, via
-- l'événement message.im et slack-interactions) ; problemes_passage en fait
-- déjà des cartes. Mais probleme_messages (les messages de la carte, « message
-- sans réponse ») ne lisait que Upwork, #questions et les nudges : un DM ne
-- s'y voyait pas. Il lit maintenant aussi :
--   * les messages du posteur reçus en DM ou par la fenêtre (canal « slack_dm ») ;
--   * la réponse de l'OS à chacun (reponse_texte partie).
-- Les messages « Send to OS » (source os:…) viennent d'un canal déjà lu : pas
-- de doublon.
--
-- Additif : probleme_messages réécrite, rien d'autre.

create or replace function public.probleme_messages(p_poster uuid, p_n integer default 15)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with moi as (select pr.slack_user_id as su from public.profiles pr where pr.id = p_poster),
  slack_posteur as (
    select sm.canal, sm.ts, coalesce(sm.fil_ts, sm.ts) as fil from public.slack_messages sm, moi where sm.slack_user = moi.su
  ),
  m as (
    select um.at, 'upwork'::text as canal,
           case um.role when 'posteur' then 'posteur' when 'hm' then 'hm' when 'max' then 'max' when 'nous' then 'max' else 'os' end as auteur,
           left(um.texte, 1000) as texte
      from public.upwork_messages um where um.poster_id = p_poster
    union all
    -- Slack (#questions et les autres canaux suivis) : ses messages, et les réponses dans ses fils.
    select sm.at, 'slack',
           case when sm.slack_user = (select su from moi) then 'posteur'
                when exists (select 1 from public.profiles x where x.slack_user_id = sm.slack_user and x.id = 'dde5916a-89b8-4fc3-897b-dc7f0d88e20e') then 'max'
                when exists (select 1 from public.profiles x join public.user_roles ur on ur.user_id = x.id
                              where x.slack_user_id = sm.slack_user and ur.role::text in ('hiring_manager', 'head_of_ops', 'admin')) then 'hm'
                else 'os' end,
           left(sm.texte, 1000)
      from (select sm.* from public.slack_messages sm where sm.slack_user = (select su from moi)
            union
            select sm.* from public.slack_messages sm
             where sm.fil_ts in (select s.fil from slack_posteur s) and sm.slack_user is distinct from (select su from moi)) sm
    union all
    -- Ce que l'OS a envoyé sur Slack (DM : relances, nudges).
    select n.envoye_at, 'slack_dm', 'os', left(n.texte, 1000)
      from public.nudges n where n.poster_id = p_poster and n.canal = 'slack' and n.envoye_at is not null and n.texte is not null
    union all
    -- 0549 : ses DM à l'app Sophia OS et la fenêtre « I need help ».
    select r.recu_at, 'slack_dm', 'posteur', left(r.texte, 1000)
      from public.posteur_reponses r
     where r.poster_id = p_poster and r.canal in ('slack', 'bouton') and coalesce(r.source_id, '') not like 'os:%'
       and nullif(btrim(coalesce(r.texte, '')), '') is not null
    union all
    -- 0549 : la réponse que l'OS lui a faite en DM.
    select r.reponse_at, 'slack_dm', 'os', left(r.reponse_texte, 1000)
      from public.posteur_reponses r
     where r.poster_id = p_poster and r.canal in ('slack', 'bouton') and r.reponse_statut = 'envoye'
       and r.reponse_at is not null and nullif(btrim(coalesce(r.reponse_texte, '')), '') is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object('at', x.at, 'canal', x.canal, 'auteur', x.auteur, 'texte', x.texte) order by x.at desc), '[]'::jsonb)
    from (select * from m where m.at is not null order by m.at desc limit greatest(1, least(coalesce(p_n, 15), 50))) x;
$$;
