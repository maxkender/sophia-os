-- Warmup 24h à la création poster + file ordonnée de labels (réglages).
alter table public.comptes
  add column if not exists warmup_started_at timestamptz,
  add column if not exists warmup_ends_at timestamptz;

comment on column public.comptes.warmup_started_at is
  'Clic « Start warmup » du recruteur. Null = créé mais warmup pas encore lancé.';
comment on column public.comptes.warmup_ends_at is
  'Fin du warmup (started + 24h). Compte « en process » quand now() >= warmup_ends_at.';

-- Comptes déjà en prod : considérés hors warmup (déjà dans le process).
update public.comptes
set
  warmup_started_at = coalesce(warmup_started_at, created_at),
  warmup_ends_at = coalesce(warmup_ends_at, created_at)
where warmup_ends_at is null;

create index if not exists idx_comptes_warmup_ends
  on public.comptes (warmup_ends_at)
  where warmup_ends_at is not null;

-- File FIFO des labels pour les prochains comptes créés (ordre = index).
insert into public.reglages (cle, valeur)
values (
  'file_labels_comptes',
  '{"label_ids":[]}'::jsonb
)
on conflict (cle) do nothing;

-- Durée warmup (heures). Défaut 24.
insert into public.reglages (cle, valeur)
values (
  'warmup',
  '{"heures":24}'::jsonb
)
on conflict (cle) do nothing;

-- Stats : hors process (warmup pas fini / pas démarré) exclus.
drop view if exists public.stats_comptes cascade;
create view public.stats_comptes
with (security_invoker = off) as
  select
    c.id as compte_id,
    c.persona_nom,
    c.handle_tiktok,
    c.langue,
    c.is_active,
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
  group by c.id, c.persona_nom, c.handle_tiktok, c.langue, c.is_active, p.prenom, p.nom;

grant select on public.stats_comptes to authenticated;
