-- Expose l'ELO compte dans stats_comptes (Analytics : tri vues / elo / likes).
drop view if exists public.stats_comptes cascade;
create view public.stats_comptes
with (security_invoker = off) as
  select
    c.id as compte_id,
    c.persona_nom,
    c.handle_tiktok,
    c.langue,
    c.is_active,
    c.score as elo,
    p.prenom as poster_prenom,
    p.nom as poster_nom,
    count(sp.id) as posts_total,
    count(sp.id) filter (where sp.publie_at is not null) as posts_publies,
    count(sp.id) filter (where sp.publie_at is not null and sp.publie_url is null)
      as posts_sans_lien,
    count(sp.id) filter (where sp.statut = 'assigne') as posts_en_attente,
    coalesce(
      (select cm.vues from public.compte_metrics cm
        where cm.compte_id = c.id order by cm.collecte_at desc limit 1),
      sum(sp.vues), 0
    ) as vues_totales,
    coalesce(
      (select cm.likes from public.compte_metrics cm
        where cm.compte_id = c.id order by cm.collecte_at desc limit 1),
      sum(sp.likes), 0
    ) as likes_totaux,
    coalesce(round(avg(sp.vues) filter (where sp.vues is not null)), 0) as vues_moyennes
  from public.comptes c
  left join public.profiles p on p.id = c.poster_id
  left join public.stats_posts sp on sp.compte_id = c.id
  where (public.is_admin() or c.poster_id = auth.uid())
    and c.warmup_ends_at is not null
    and c.warmup_ends_at <= now()
  group by
    c.id, c.persona_nom, c.handle_tiktok, c.langue, c.is_active, c.score,
    p.prenom, p.nom;

grant select on public.stats_comptes to authenticated;
