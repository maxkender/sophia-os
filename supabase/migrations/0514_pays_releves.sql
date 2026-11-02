-- 0514 — Page Pays (refonte, 2/11) : relevés de vues, annonces, détail d'un pays.
--
-- 1. Vues des posts à J+1, J+3, J+7. Le relevé de nuit (scrape des comptes,
--    00:18 UTC) met à jour passages.vues chaque nuit ; la tâche metriques-soir
--    (post_metrics, ancienne table posts) est coupée depuis le 26/10 (0326 :
--    elle s'arrêtait après 9 à 20 comptes et payait Apify pour rien). Plutôt
--    que de la relancer, on photographie les vues du relevé de nuit quand un
--    post a 1, 3 et 7 jours : passage_vues_jalons, rempli chaque nuit à 03:05
--    UTC par passage_vues_photographier() (aucun appel Apify en plus).
-- 2. pays_meta() : la date des derniers relevés (posts, comptes, post_metrics)
--    et les annonces Upwork (titre, pays, vue, contrats des 21 derniers jours)
--    pour la colonne « Annonce active » du recrutement.
-- 3. pays_detail(pays) : par compte, les vues des 7 derniers jours (relevés
--    quotidiens, hausses seulement), la médiane des vues par post sur 28 jours
--    et le nombre de posts ; les 5 meilleurs posts des 28 derniers jours (lien,
--    vues, application, vues à J+1/J+3/J+7 quand elles existent).
--
-- Additif : une table, quatre fonctions, un cron. Aucune autre table touchée.

create table if not exists public.passage_vues_jalons (
  passage_id uuid not null references public.passages(id) on delete cascade,
  age_jours  integer not null check (age_jours in (1, 3, 7)),
  vues       bigint,
  releve_at  timestamptz not null default now(),
  primary key (passage_id, age_jours)
);
alter table public.passage_vues_jalons enable row level security;
do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'passage_vues_jalons' and policyname = 'passage_vues_jalons_admin') then
    create policy passage_vues_jalons_admin on public.passage_vues_jalons for select to authenticated using (public.is_admin());
  end if;
end
$p$;

-- Chaque nuit, après le relevé : les posts publiés il y a 1, 3 ou 7 jours (heure de Paris).
create or replace function public.passage_vues_photographier()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auj date := (now() at time zone 'Europe/Paris')::date;
  n integer;
begin
  insert into public.passage_vues_jalons (passage_id, age_jours, vues)
  select pa.id, v_auj - pa.date_publication_prevue, pa.vues
    from public.passages pa
   where pa.publie_url is not null
     and pa.date_publication_prevue in (v_auj - 1, v_auj - 3, v_auj - 7)
     and pa.stats_maj_at is not null
     and pa.stats_maj_at >= (v_auj::timestamp at time zone 'Europe/Paris') - interval '1 day'
  on conflict (passage_id, age_jours) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.passage_vues_photographier() from public, anon, authenticated;

do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'vues-jalons-nuit') then
    perform cron.schedule('vues-jalons-nuit', '5 3 * * *', 'select public.passage_vues_photographier()');
  end if;
end
$c$;

create or replace function public.pays_meta()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'pays_meta : réservé à l''admin' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'releve_posts', (select max(stats_maj_at) from public.passages),
    'releve_comptes', (select max(collecte_at) from public.compte_metrics),
    'releve_post_metrics', (select max(collecte_at) from public.post_metrics),
    'jalons', (select max(releve_at) from public.passage_vues_jalons),
    'annonces', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'titre', a.titre, 'pays', a.pays, 'generique', a.generique, 'vue_at', a.vue_at,
               'contrats_21j', (select count(*) from public.accueils x where x.job_id = a.job_id and x.created_at > now() - interval '21 days'))), '[]'::jsonb)
        from public.annonces_pays a
    )
  );
end;
$$;
revoke all on function public.pays_meta() from public, anon;
grant execute on function public.pays_meta() to authenticated;

create or replace function public.pays_detail(p_pays text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_auj date := (now() at time zone 'Europe/Paris')::date;
begin
  if not public.is_admin() then
    raise exception 'pays_detail : réservé à l''admin' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'comptes', (
      with c as (
        select c.id, c.handle_tiktok, c.is_active, nullif(btrim(concat_ws(' ', p.prenom, p.nom)), '') as poster
          from public.comptes c
          left join public.profiles p on p.id = c.poster_id
         where upper(c.pays) = upper(p_pays) and c.type_compte = 'perso'
      ),
      m as (
        select cm.compte_id, (cm.collecte_at at time zone 'Europe/Paris')::date as jour, max(cm.vues) as vues
          from public.compte_metrics cm join c on c.id = cm.compte_id
         where cm.collecte_at > now() - interval '9 days'
         group by 1, 2
      ),
      d as (select m.compte_id, m.jour, m.vues - lag(m.vues) over (partition by m.compte_id order by m.jour) as gain from m),
      v7 as (select d.compte_id, sum(greatest(coalesce(d.gain, 0), 0))::bigint as vues from d where d.jour > v_auj - 7 group by 1),
      p28 as (
        select pa.compte_id, count(*)::int as posts,
               percentile_cont(0.5) within group (order by coalesce(pa.vues, 0))::bigint as mediane
          from public.passages pa join c on c.id = pa.compte_id
         where pa.publie_url is not null and pa.date_publication_prevue > v_auj - 28
         group by 1
      )
      select coalesce(jsonb_agg(jsonb_build_object(
               'compte_id', c.id, 'handle', c.handle_tiktok, 'poster', c.poster, 'actif', c.is_active,
               'vues_7j', coalesce(v7.vues, 0), 'mediane_post', p28.mediane, 'posts_28j', coalesce(p28.posts, 0))
             order by coalesce(v7.vues, 0) desc), '[]'::jsonb)
        from c
        left join v7 on v7.compte_id = c.id
        left join p28 on p28.compte_id = c.id
       where c.is_active or v7.vues > 0 or p28.posts > 0
    ),
    'top_posts', (
      select coalesce(jsonb_agg(x order by (x->>'vues')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'passage_id', pa.id, 'url', pa.publie_url, 'vues', coalesce(pa.vues, 0), 'date', pa.date_publication_prevue,
                 'handle', c.handle_tiktok, 'app', coalesce(ap.nom, 'Sophia'),
                 'j1', (select j.vues from public.passage_vues_jalons j where j.passage_id = pa.id and j.age_jours = 1),
                 'j3', (select j.vues from public.passage_vues_jalons j where j.passage_id = pa.id and j.age_jours = 3),
                 'j7', (select j.vues from public.passage_vues_jalons j where j.passage_id = pa.id and j.age_jours = 7)) as x
          from public.passages pa
          join public.comptes c on c.id = pa.compte_id and upper(c.pays) = upper(p_pays) and c.type_compte = 'perso'
          left join public.applications ap on ap.id = coalesce(pa.application_id, pa.application_visee_id)
         where pa.publie_url is not null and pa.date_publication_prevue > v_auj - 28
         order by coalesce(pa.vues, 0) desc
         limit 5
      ) t
    )
  );
end;
$$;
revoke all on function public.pays_detail(text) from public, anon;
grant execute on function public.pays_detail(text) to authenticated;

notify pgrst, 'reload schema';
