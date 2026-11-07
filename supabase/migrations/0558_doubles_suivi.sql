-- 0558 : Weekly decisions → « 2e comptes proposés » (lecture seule).
-- Une ligne par offre Double (posteur_messages type 'double') depuis p_depuis :
-- statut (proposé / vu / accepté / refusé / expiré / retenu), dates, et pour
-- les acceptés : compte créé ? warm-up ? 1er post avec lien ? milestone du
-- 2e compte (« (2 acc) » / « (2nd acc) ») créé / financé ?
-- Additif : une fonction.

create or replace function public.doubles_suivi(p_depuis date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_depuis date := coalesce(p_depuis, (now() at time zone 'Europe/Paris')::date - 35);
begin
  if not public.is_admin() then
    raise exception 'doubles_suivi : réservé à l''admin' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x order by x->>'propose_at' desc)
      from (
        select jsonb_build_object(
          'id', m.id,
          'poster_id', m.poster_id,
          'nom', coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), '?'),
          'pays', upper(coalesce(c1.pays, '')),
          'samedi', m.semaine,
          'propose_at', m.created_at,
          'expire_at', case when m.visible_de > now() + interval '1 year' then null else m.expire_at end,
          'vu_at', m.lu_at,
          'repondu_at', m.repondu_at,
          'statut', case
             when m.reponse = 'oui' then 'accepte'
             when m.reponse = 'non' then 'refuse'
             when m.visible_de > now() + interval '1 year' then 'retenu'
             when m.expire_at is not null and m.expire_at <= now() then 'expire'
             when m.lu_at is not null then 'vu'
             else 'propose' end,
          'tarif', coalesce(public.paie_tarif_contrat(m.poster_id), public.paie_tarif_zone(m.poster_id)),
          'compte1', c1.handle_tiktok,
          'compte2', c2.handle_tiktok,
          'compte2_cree_at', c2.created_at,
          'warmup_debut', c2.warmup_started_at,
          'warmup_fin', c2.warmup_ends_at,
          'warmup_fait', c2.warmup_ends_at is not null and c2.warmup_ends_at <= now(),
          'premier_post', (select min(ps.date_publication_prevue) from public.passages ps
                            where ps.compte_id = c2.id and ps.publie_url is not null),
          'posts_2', (select count(*) from public.passages ps where ps.compte_id = c2.id and ps.publie_url is not null),
          'milestone', (select jsonb_build_object('nom', e->>'nom', 'etat', e->>'etat', 'depot', e->>'depot')
                          from public.upwork_jalons j, jsonb_array_elements(coalesce(j.jalons, '[]'::jsonb)) e
                         where j.contrat_id = pr.upwork_contract_id
                           and (e->>'nom') ~* '\((2\s*acc|2nd\s*acc)'
                         order by (e->>'sequence')::int desc nulls last limit 1),
          'erreur', coalesce(m.erreur, p.erreur)
        ) x
          from public.posteur_messages m
          left join public.profiles pr on pr.id = m.poster_id
          left join public.ckd_propositions p on p.id = m.proposition_id
          left join public.comptes c1 on c1.id = m.compte_id
          left join public.comptes c2 on c2.id = p.nouveau_compte_id
         where m.type = 'double' and m.semaine >= v_depuis
      ) t), '[]'::jsonb);
end;
$$;
revoke execute on function public.doubles_suivi(date) from public, anon;
grant execute on function public.doubles_suivi(date) to authenticated;
