-- 0499 — Onglet Sunday : le détail des relances et notre dernier message, tous canaux.
--
-- warmup_check_contexte(p_lundi) (0496) rend en plus, pour chaque recrue :
--   relances_envoyees : les 8 dernières relances parties (date, canal, type) ;
--   relances_prevues  : celles encore prévues (depuis quand, canal, étape) ;
--   envoye            : notre dernier message, Upwork OU relance (Slack / Upwork), le plus récent ;
--   retrait           : un STOP ou un retrait lu aussi dans le dernier message Slack.
-- Même signature, même type de retour : le texte de 0496 est repris et modifié
-- par remplacement (chaque morceau doit exister, sinon la migration échoue).

do $m$
declare
  v_def text := pg_get_functiondef('public.warmup_check_contexte(date)'::regprocedure);
  v_rx  text := $r$'(^\s*stop\s*$|withdraw|do not wish to (proceed|continue)|don''t wish to (proceed|continue)|not be able to work|won''t be able to work|no longer (interested|available)|cancel (the|my) contract|quit)'$r$;
  a1 text := $q$ as recu_slack
      from po$q$;
  b1 text := $q$ as recu_slack,
           (select jsonb_build_object('at', n.envoye_at, 'texte', left(coalesce(n.texte, ''), 160),
                                      'canal', coalesce(nullif(array_to_string(n.canaux, '+'), ''), n.canal, '?'))
              from public.nudges n where n.poster_id = po.id and n.envoye_at is not null
             order by n.envoye_at desc limit 1) as envoye_nudge
      from po$q$;
  a2 text := $q$'relances', (select jsonb_build_object('n', count(*),$q$;
  b2 text := $q$'relances_envoyees', (select coalesce(jsonb_agg(jsonb_build_object('at', n.envoye_at, 'type', n.type,
                                                  'canal', coalesce(nullif(array_to_string(n.canaux, '+'), ''), n.canal, '?'))
                                               order by n.envoye_at desc), '[]'::jsonb)
                                 from (select * from public.nudges n0 where n0.poster_id = po.id and n0.envoye_at is not null
                                        order by n0.envoye_at desc limit 8) n),
           'relances_prevues', (select coalesce(jsonb_agg(jsonb_build_object('at', r.premier_at, 'canal', r.canal, 'etape', r.donnees ->> 'element')
                                               order by r.premier_at), '[]'::jsonb)
                                  from public.relances_prevues r where r.poster_id = po.id and r.statut = 'prevu'),
           'relances', (select jsonb_build_object('n', count(*),$q$;
  a3 text := $q$'envoye', case when m.envoye_upwork is not null$q$;
  b3 text := $q$'envoye', case when m.envoye_nudge is not null
                               and (m.envoye_upwork is null or (m.envoye_nudge ->> 'at')::timestamptz > (m.envoye_upwork ->> 'at')::timestamptz)
                          then m.envoye_nudge
                          when m.envoye_upwork is not null$q$;
  a4 text := $q$then jsonb_build_object('source', 'upwork', 'texte', left(m.recu_upwork ->> 'texte', 300), 'at', m.recu_upwork ->> 'at') end),$q$;
  b4 text;
begin
  b4 := $q$then jsonb_build_object('source', 'upwork', 'texte', left(m.recu_upwork ->> 'texte', 300), 'at', m.recu_upwork ->> 'at')
                  when coalesce(m.recu_slack ->> 'texte', '') ~* $q$ || v_rx || $q$
                  then jsonb_build_object('source', 'slack', 'texte', left(m.recu_slack ->> 'texte', 300), 'at', m.recu_slack ->> 'at') end),$q$;
  if position(a1 in v_def) = 0 then raise exception '0499 : bloc msg introuvable'; end if;
  if position(a2 in v_def) = 0 then raise exception '0499 : bloc relances introuvable'; end if;
  if position(a3 in v_def) = 0 then raise exception '0499 : bloc envoye introuvable'; end if;
  if position(a4 in v_def) = 0 then raise exception '0499 : bloc retrait introuvable'; end if;
  execute replace(replace(replace(replace(v_def, a1, b1), a2, b2), a3, b3), a4, b4);
end;
$m$;

notify pgrst, 'reload schema';
