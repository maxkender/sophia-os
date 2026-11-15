-- 0588 : action hub-posteurs « parrainages » au format du site (Max, 10/11).
-- Une ligne plate par filleul (déclaration « Refer a friend »), paginée par 500.
-- Lecture seule : une fonction ajoutée, rien d'autre (hub_parrainages() de 0585 reste).

create or replace function public.hub_parrainages_page(p_offset integer default 0, p_limite integer default 500)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select cr.*, i.id as inv_id, i.statut as inv_statut, i.email as inv_email, i.prenom as inv_prenom, i.pays as inv_pays,
           i.code as inv_code, i.ouvert_at, i.clique_at, i.postule_at, i.dernier_envoi_at, i.recrue_id as inv_recrue
      from public.creator_referrals cr
      left join lateral (select x.* from public.parrainage_invitations x
                          where x.referral_id = cr.id
                             or (nullif(btrim(cr.contact_email), '') is not null and x.email = lower(btrim(cr.contact_email)))
                          order by (x.referral_id = cr.id) desc, x.cree_at limit 1) i on true
  ), tot as (select count(*)::int as n from base),
  page as (
    select * from base order by created_at desc, id
     offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limite, 500), 1), 500)
  )
  select jsonb_build_object(
    'total', (select n from tot),
    'offset', greatest(coalesce(p_offset, 0), 0),
    'next_offset', case when greatest(coalesce(p_offset, 0), 0) + least(greatest(coalesce(p_limite, 500), 1), 500) < (select n from tot)
                        then greatest(coalesce(p_offset, 0), 0) + least(greatest(coalesce(p_limite, 500), 1), 500) end,
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', b.id,
      'ref', coalesce(b.inv_code, (select c.code from public.parrainage_codes c where c.poster_id = b.referrer_id)),
      'referrer_name', btrim(concat_ws(' ', pr.prenom, pr.nom)),
      'referrer_channel', case when pr.canal_paie = 'ruul' then 'ruul' else 'upwork' end,
      'friend_first_name', coalesce(b.inv_prenom, b.prenom),
      'friend_last_name', b.nom,
      'friend_email', coalesce(b.inv_email, nullif(lower(btrim(b.contact_email)), '')),
      'country', coalesce(nullif(b.inv_pays, '??'),
                          case when public.parrainage_pays_de_langue(b.pays) <> '??' then public.parrainage_pays_de_langue(b.pays) end),
      'created_at', b.created_at,
      'invitation_status', coalesce(b.inv_statut, 'non_invite'),
      'j0_sent_at', (select min(e.at) from public.parrainage_envois e where e.invitation_id = b.inv_id and e.etape = 0 and e.ok),
      'j2_sent_at', (select min(e.at) from public.parrainage_envois e where e.invitation_id = b.inv_id and e.etape = 2 and e.ok),
      'j5_sent_at', (select min(e.at) from public.parrainage_envois e where e.invitation_id = b.inv_id and e.etape = 5 and e.ok),
      'opened_at', b.ouvert_at,
      'clicked_at', b.clique_at,
      'unsubscribed_at', (select min(d.at) from public.parrainage_desinscrits d where d.email = coalesce(b.inv_email, lower(btrim(b.contact_email)))),
      'bounced_at', case when b.inv_statut = 'rebond' then b.dernier_envoi_at end,
      'applied_at', b.postule_at,
      'recrue_id', coalesce(b.recrue_id, b.inv_recrue),
      'first_login_at', (select rp.premiere_connexion_at from public.profiles rp where rp.id = coalesce(b.recrue_id, b.inv_recrue)),
      'first_post_at', (select min(coalesce(ps.publie_at, ps.created_at)) from public.passages ps join public.comptes c on c.id = ps.compte_id
                         where c.poster_id = coalesce(b.recrue_id, b.inv_recrue) and ps.publie_url is not null),
      'bonus_status', coalesce((select case when bo.statut = 'paye' then 'paid' else 'pending' end
                                  from public.bonus bo
                                 where bo.type = 'parrainage' and bo.statut <> 'retire'
                                   and (bo.referral_id = b.id or (bo.recrue_id is not null and bo.recrue_id = coalesce(b.recrue_id, b.inv_recrue)))
                                 order by (bo.statut = 'paye') desc limit 1), 'none'),
      'bonus_paid_at', (select max(bo.paye_at) from public.bonus bo
                         where bo.type = 'parrainage' and bo.statut = 'paye'
                           and (bo.referral_id = b.id or (bo.recrue_id is not null and bo.recrue_id = coalesce(b.recrue_id, b.inv_recrue))))
    ) order by b.created_at desc, b.id)
      from page b left join public.profiles pr on pr.id = b.referrer_id), '[]'::jsonb));
$$;

revoke execute on function public.hub_parrainages_page(integer, integer) from public, anon, authenticated;
grant execute on function public.hub_parrainages_page(integer, integer) to service_role;
