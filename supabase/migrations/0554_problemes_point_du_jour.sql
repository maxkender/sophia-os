-- 0554 : la nouvelle page Problèmes (« Ton point du jour ») lit tout en une fois.
--
-- problemes_point_du_jour(p_depuis) (admin, lecture seule) :
--   * journal   : les actions des bots depuis p_depuis (faites, refusées, en
--                 erreur, annulées), avec le nom de la personne, le message
--                 envoyé et la raison d'un refus ;
--   * passages  : le dernier passage de chaque bot (action ou proposition) ;
--   * bonus     : les bonus à payer (parrainage, Comment Masters) ;
--   * semaine   : par bot, les actions faites et les corrections de Max sur
--                 7 jours (bot_feedback), avec la proposition du bot, ce que
--                 Max a fait et pourquoi. Un « Ignorer » sur une proposition
--                 « rien à faire » / « fermer » n'est pas une erreur.
--
-- Additif : une fonction.

create or replace function public.problemes_point_du_jour(p_depuis timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_depuis timestamptz := greatest(coalesce(p_depuis, now() - interval '24 hours'), now() - interval '7 days');
begin
  if not public.is_admin() then
    raise exception 'problemes_point_du_jour : réservé à l''admin' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'depuis', v_depuis,
    'journal', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'bot', a.bot, 'action', a.action, 'statut', a.statut, 'at', a.at, 'canal', a.canal,
               'message', left(a.message, 2000), 'raison', left(a.raison, 500), 'probleme_id', a.probleme_id, 'poster_id', a.poster_id,
               'nom', coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), nullif(btrim(concat_ws(' ', h.prenom, h.nom)), '')))
             order by a.at desc)
        from public.bot_actions a
        left join public.profiles pr on pr.id = a.poster_id
        left join public.profiles h on h.id = a.hm_id
       where a.at > v_depuis and a.statut in ('fait', 'erreur', 'refuse', 'annule')), '[]'::jsonb),
    'passages', coalesce((
      select jsonb_object_agg(b.bot, b.dernier)
        from (select x.bot, max(x.at) as dernier from (
                select a.bot, a.at from public.bot_actions a where a.at > now() - interval '7 days'
                union all
                select p.propose_par, p.propose_at from public.problemes p
                 where p.propose_par in ('new_cohort_bot', 'control_bot', 'pay_bot') and p.propose_at > now() - interval '7 days'
              ) x group by x.bot) b), '{}'::jsonb),
    'bonus', jsonb_build_object(
      'a_payer', (select count(*) from public.bonus b where b.statut = 'a_payer' and b.montant > 0),
      'montant', (select coalesce(sum(b.montant), 0) from public.bonus b where b.statut = 'a_payer' and b.montant > 0)),
    'semaine', coalesce((
      select jsonb_object_agg(s.bot, s.v)
        from (
          select bots.bot, jsonb_build_object(
                   'actions', (select count(*) from public.bot_actions a where a.bot = bots.bot and a.statut = 'fait' and a.at > now() - interval '7 days'),
                   'refusees', (select count(*) from public.bot_actions a where a.bot = bots.bot and a.statut = 'refuse' and a.at > now() - interval '7 days'),
                   'justes', (select count(*) from public.bot_feedback f where f.bot = bots.bot and f.verdict = 'juste' and f.created_at > now() - interval '7 days'),
                   'corrections', coalesce((
                     select jsonb_agg(jsonb_build_object('at', f.created_at, 'verdict', f.verdict, 'raison', f.raison, 'categorie', f.categorie,
                                                         'diagnostic_du_bot', f.diagnostic_du_bot, 'action_du_bot', f.action_du_bot, 'choix', f.choix,
                                                         'id', f.id)
                                      order by f.created_at desc)
                       from public.bot_feedback f
                      where f.bot = bots.bot and f.created_at > now() - interval '7 days'
                        and f.verdict in ('mauvaise_action', 'pas_un_probleme')
                        -- Un « Ignorer » (pas un problème) quand le bot proposait déjà de ne rien faire n'est pas une erreur.
                        and not (f.verdict = 'pas_un_probleme' and coalesce(f.action_du_bot, '') in ('', 'close', 'fermer', 'rien', 'mark_read', 'none'))), '[]'::jsonb)) as v
            from (values ('new_cohort_bot'), ('control_bot'), ('pay_bot')) as bots(bot)
        ) s), '{}'::jsonb)
  );
end;
$$;

revoke execute on function public.problemes_point_du_jour(timestamptz) from public, anon;
grant execute on function public.problemes_point_du_jour(timestamptz) to authenticated;
