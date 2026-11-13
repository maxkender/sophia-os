-- 0673 : Support (Max, 12/11). Le bot lit tout ce que l'OS sait d'un posteur avant de
-- répondre ou de juger un problème : ses messages Upwork (10 derniers), ses messages
-- Slack (salons et messages privés au bot), ce que l'OS lui a envoyé (7 jours), sa paie
-- des 4 dernières semaines (Ruul : paiements et lot ; Upwork : paiement API et
-- milestones), ses posts de la semaine et de la précédente.
-- support_demandes : verdict (probleme_confirme / pas_de_probleme / incertain) et sa
-- phrase, écrits par le bot ; l'équipe les voit dans le panneau. Lecture seule : le bot
-- ne paie rien, ne ferme rien, ne change aucune donnée.
-- Additif : deux colonnes, une fonction.

alter table public.support_demandes add column if not exists verdict text;
alter table public.support_demandes add column if not exists verdict_texte text;

create or replace function public.support_contexte(p_poster uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pr public.profiles%rowtype;
  v_lundi date := date_trunc('week', (now() at time zone 'Europe/Paris'))::date;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into pr from public.profiles where id = p_poster;
  if not found then return null; end if;
  return jsonb_build_object(
    'messages_upwork', coalesce((select jsonb_agg(jsonb_build_object('at', m.at, 'de', m.role, 'texte', left(m.texte, 400)) order by m.at)
                                   from (select * from public.upwork_messages um where um.poster_id = p_poster order by um.at desc limit 10) m), '[]'::jsonb),
    'messages_slack', coalesce((select jsonb_agg(jsonb_build_object('at', s.at, 'canal', s.canal, 'texte', left(s.texte, 400)) order by s.at)
                                  from (select * from public.slack_messages sm where pr.slack_user_id is not null and sm.slack_user = pr.slack_user_id
                                         order by sm.at desc limit 10) s), '[]'::jsonb),
    'messages_au_bot', coalesce((select jsonb_agg(jsonb_build_object('at', r.recu_at, 'canal', r.canal, 'texte', left(r.texte, 400)) order by r.recu_at)
                                   from (select * from public.posteur_reponses x where x.poster_id = p_poster order by x.recu_at desc limit 10) r), '[]'::jsonb),
    'envoye_par_os', coalesce((select jsonb_agg(jsonb_build_object('at', n.envoye_at, 'type', n.type, 'texte', left(n.texte, 300)) order by n.envoye_at)
                                 from (select * from public.nudges y where y.poster_id = p_poster and y.envoye_at > now() - interval '7 days'
                                        order by y.envoye_at desc limit 10) n), '[]'::jsonb),
    'paie_semaines', coalesce((select jsonb_agg(jsonb_build_object('semaine', s.semaine, 'statut', s.statut, 'prevus', s.prevus, 'faits', s.faits,
                                                                   'montant', coalesce(s.montant_corrige, s.montant), 'raison', s.raison, 'paye_at', s.paye_at,
                                                                   'action', s.action) order by s.semaine desc)
                                 from (select * from public.paie_semaines z where z.poster_id = p_poster order by z.semaine desc limit 4) s), '[]'::jsonb),
    'paie_upwork', case when pr.canal_paie = 'ruul' then null else
      coalesce((select jsonb_agg(jsonb_build_object('semaine', a.semaine, 'statut', a.statut, 'montant', coalesce(a.montant_finance, a.montant_approuve, a.montant_reserve),
                                                    'erreur', a.erreur, 'maj_at', a.updated_at) order by a.semaine desc)
                  from (select * from public.paie_paiements_api w where w.poster_id = p_poster order by w.semaine desc limit 4) a), '[]'::jsonb) end,
    'milestones', case when pr.canal_paie = 'ruul' or pr.upwork_contract_id is null then null else
      (select jsonb_build_object('lu_at', j.lu_at, 'liste', j.jalons) from public.upwork_jalons j where j.contrat_id = pr.upwork_contract_id limit 1) end,
    'paie_ruul', case when pr.canal_paie = 'ruul' then
      coalesce((select jsonb_agg(jsonb_build_object('semaine', rp.semaine, 'statut', rp.statut, 'montant', rp.montant, 'bonus', rp.bonus,
                                                    'paye_at', rp.paye_at, 'raison_report', rp.raison_report, 'lot', l.statut, 'lot_paye_at', l.paye_at)
                                 order by rp.semaine desc)
                  from (select * from public.ruul_paiements q where q.poster_id = p_poster order by q.semaine desc limit 4) rp
                  left join public.ruul_lots l on l.id = rp.lot_id), '[]'::jsonb) end,
    'posts', coalesce((select jsonb_agg(jsonb_build_object('semaine', x.lundi, 'prevus', x.prevus, 'publies', x.publies) order by x.lundi desc)
                         from (select (date_trunc('week', pa.date_publication_prevue))::date as lundi,
                                      count(*) as prevus, count(*) filter (where pa.publie_url is not null) as publies
                                 from public.passages pa join public.comptes co on co.id = pa.compte_id
                                where co.poster_id = p_poster and pa.date_publication_prevue between v_lundi - 7 and v_lundi + 6
                                  and pa.statut::text <> 'brouillon' and not coalesce(pa.est_rappel, false)
                                group by 1) x), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.support_contexte(uuid) from public, anon;
grant execute on function public.support_contexte(uuid) to authenticated, service_role;
