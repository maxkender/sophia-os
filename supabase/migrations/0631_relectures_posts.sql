-- 0631 : la relecture simple des posts publiés (08/11).
--
-- Idée d'Adrien : chaque samedi, 15 slideshows publiés dans une langue
-- partent au relecteur natif de cette langue, tels qu'ils sont partis sur
-- TikTok. Pas de duel : il lit, réécrit les slides qu'il aurait écrites
-- autrement, note sur 5 et laisse une remarque. Ses réécritures et sa
-- remarque entrent dans la boucle de correction (0630) comme celles des
-- duels : découpées en corrections, à retenir dans Relecture native.
--
--  - `relectures_posts` : un post envoyé à un relecteur, avec le deck publié
--    figé (`slides`), la source pour l'admin, puis sa relecture ;
--  - `relectures_envoyer(langue, n, jours)` : admin ou service_role, choisit
--    n passages publiés de la langue sur les derniers jours, les plus vus,
--    un par contenu, au plus 3 par label, jamais deux fois au même relecteur,
--    et les envoie à chaque relecteur invité ou actif de la langue ;
--  - `relectures_envoyer_toutes(n)` : toutes les langues qui ont un
--    relecteur ; cron `relectures-hebdo` le samedi à 8 h 07 UTC ;
--  - `mes_relectures_relecteur()` et `relire_post_relecteur()` : l'espace du
--    relecteur (mêmes gardes que les duels : relecteur de la langue, espace
--    ouvert).
--
-- Retour arrière : cron.unschedule('relectures-hebdo') ; drop function des
-- cinq fonctions ; alter table corrections_natives drop column relecture_id ;
-- drop table relectures_posts ; rejouer corrections_a_extraire() de 0630.

set lock_timeout = '5s';

create table if not exists public.relectures_posts (
  id                            uuid primary key default gen_random_uuid(),
  langue                        text not null,
  relecteur_id                  uuid not null references public.relecteurs_natifs (id) on delete cascade,
  passage_id                    uuid references public.passages (id) on delete set null,
  post_id                       uuid references public.posts (id) on delete set null,
  contenu_id                    uuid references public.contenus (id) on delete set null,
  label                         text,
  vues                          integer,
  publie_at                     timestamptz,
  slides                        jsonb not null default '[]'::jsonb,
  slides_source                 jsonb not null default '[]'::jsonb,
  statut                        text not null default 'a_faire' check (statut in ('a_faire', 'faite')),
  note                          smallint check (note between 1 and 5),
  remarque                      text,
  slides_corrigees              jsonb not null default '[]'::jsonb,
  fait_le                       timestamptz,
  corrections_extraites_le      timestamptz,
  corrections_extraction_erreur text,
  envoye_le                     timestamptz not null default now(),
  created_at                    timestamptz not null default now(),
  unique (relecteur_id, passage_id)
);

comment on table public.relectures_posts is
  'Relecture simple (0631) : un post publié envoyé à un relecteur natif, le deck publié figé, sa note, sa remarque et les slides qu''il a réécrites ({position, texte}). Découpé en corrections (0630) une fois fait.';

create index if not exists relectures_posts_langue_statut on public.relectures_posts (langue, statut, envoye_le desc);
create index if not exists relectures_posts_relecteur on public.relectures_posts (relecteur_id, statut);

alter table public.relectures_posts enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'relectures_posts' and policyname = 'relectures_posts_admin') then
    create policy relectures_posts_admin on public.relectures_posts for all to authenticated
      using (public.is_admin()) with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'relectures_posts' and policyname = 'relectures_posts_lecture_soi') then
    create policy relectures_posts_lecture_soi on public.relectures_posts for select to authenticated
      using (relecteur_id in (select r.id from public.relecteurs_natifs r where r.profile_id = auth.uid()));
  end if;
end $$;
grant select on public.relectures_posts to authenticated;
grant insert, update, delete on public.relectures_posts to authenticated; -- portés par la policy admin seulement
grant all on public.relectures_posts to service_role;

alter table public.corrections_natives
  add column if not exists relecture_id uuid references public.relectures_posts (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Envoi : n passages publiés de la langue, à chaque relecteur de la langue
-- ---------------------------------------------------------------------------
create or replace function public.relectures_envoyer_interne(p_langue text, p_n integer default 15, p_jours integer default 14)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_langue text := lower(btrim(p_langue));
  v_n integer := greatest(coalesce(p_n, 15), 1);
  v_total integer := 0;
  v_inseres integer;
  rel record;
begin
  for rel in
    select r.id from public.relecteurs_natifs r
     where lower(r.langue) = v_langue and r.statut in ('invite', 'actif')
  loop
    with candidats as (
      select p.id as passage_id, p.post_id, p.contenu_id, p.vues, p.publie_at,
             (select l.nom from public.contenu_labels cl join public.labels l on l.id = cl.label_id
               where cl.contenu_id = p.contenu_id and l.nom not in ('Hook', 'UGC AI VIDEO')
               order by l.nom limit 1) as label,
             row_number() over (partition by p.contenu_id order by p.vues desc nulls last, p.publie_at desc) as rn_contenu
        from public.passages p
       where lower(p.langue) = v_langue
         and p.statut = 'publie'
         and p.post_id is not null
         and p.publie_at >= now() - make_interval(days => greatest(coalesce(p_jours, 14), 1))
         and not exists (select 1 from public.relectures_posts r where r.passage_id = p.id and r.relecteur_id = rel.id)
    ), par_label as (
      select c.*, row_number() over (partition by coalesce(c.label, '') order by c.vues desc nulls last, c.publie_at desc) as rn_label
        from candidats c where c.rn_contenu = 1
    ), choisis as (
      select * from par_label where rn_label <= 3
       order by vues desc nulls last, publie_at desc
       limit v_n
    )
    insert into public.relectures_posts (langue, relecteur_id, passage_id, post_id, contenu_id, label, vues, publie_at, slides, slides_source)
    select v_langue, rel.id, c.passage_id, c.post_id, c.contenu_id, c.label, c.vues, c.publie_at,
           coalesce(nullif((select jsonb_agg(jsonb_build_object('position', ps.position, 'texte_overlay', ps.texte_overlay, 'position_sophia', ps.position_sophia) order by ps.position)
                             from public.post_slides ps where ps.post_id = c.post_id), '[]'::jsonb),
                    (select p.slides from public.passages p where p.id = c.passage_id), '[]'::jsonb),
           coalesce((select coalesce(nullif(s.slides_base, '[]'::jsonb), s.slides)
                       from public.contenu_langues s join public.contenus co on co.id = s.contenu_id
                      where s.contenu_id = c.contenu_id and s.langue = co.langue_source limit 1), '[]'::jsonb)
      from choisis c;
    get diagnostics v_inseres = row_count;
    v_total := v_total + v_inseres;
  end loop;
  return v_total;
end;
$$;
revoke all on function public.relectures_envoyer_interne(text, integer, integer) from public, authenticated;
grant execute on function public.relectures_envoyer_interne(text, integer, integer) to service_role;

create or replace function public.relectures_envoyer(p_langue text, p_n integer default 15, p_jours integer default 14)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (public.is_admin_strict() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'relectures_envoyer : réservé à l''admin' using errcode = '42501';
  end if;
  return public.relectures_envoyer_interne(p_langue, p_n, p_jours);
end;
$$;
grant execute on function public.relectures_envoyer(text, integer, integer) to authenticated, service_role;

create or replace function public.relectures_envoyer_toutes(p_n integer default 15, p_jours integer default 14)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_total integer := 0;
  l record;
begin
  for l in select distinct lower(r.langue) as langue from public.relecteurs_natifs r where r.statut in ('invite', 'actif')
  loop
    v_total := v_total + public.relectures_envoyer_interne(l.langue, p_n, p_jours);
  end loop;
  return v_total;
end;
$$;
revoke all on function public.relectures_envoyer_toutes(integer, integer) from public, authenticated;
grant execute on function public.relectures_envoyer_toutes(integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- L'espace du relecteur
-- ---------------------------------------------------------------------------
create or replace function public.mes_relectures_relecteur()
returns table (
  id               uuid,
  langue           text,
  envoye_le        timestamptz,
  label            text,
  slides           jsonb,
  statut           text,
  note             smallint,
  remarque         text,
  slides_corrigees jsonb,
  fait_le          timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select rp.id, rp.langue, rp.envoye_le, rp.label, rp.slides, rp.statut, rp.note, rp.remarque, rp.slides_corrigees, rp.fait_le
    from public.relectures_posts rp
    join public.relecteurs_natifs r on r.id = rp.relecteur_id
   where r.profile_id = auth.uid()
     and r.statut in ('invite', 'actif')
     and coalesce((select (g.valeur ->> 'espace_ouvert')::boolean from public.reglages g where g.cle = 'relecture_native'), false)
   order by (rp.statut = 'faite'), rp.envoye_le, rp.created_at
   limit 200;
$$;
grant execute on function public.mes_relectures_relecteur() to authenticated;

create or replace function public.relire_post_relecteur(
  p_id       uuid,
  p_note     integer,
  p_remarque text default null,
  p_slides   jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rp        public.relectures_posts%rowtype;
  v_relecteur uuid;
  v_slides    jsonb := '[]'::jsonb;
  v_remarque  text := nullif(btrim(coalesce(p_remarque, '')), '');
  v_mots      integer := 0;
  x           jsonb;
begin
  if p_note is null or p_note not between 1 and 5 then
    raise exception 'relire_post_relecteur : la note va de 1 à 5' using errcode = '22023';
  end if;
  select * into v_rp from public.relectures_posts where id = p_id;
  if not found then
    raise exception 'relire_post_relecteur : relecture introuvable' using errcode = '42501';
  end if;
  v_relecteur := public.relecteur_natif_de(v_rp.langue);
  if v_relecteur is null or v_relecteur <> v_rp.relecteur_id then
    raise exception 'relire_post_relecteur : cette relecture n''est pas la vôtre, ou l''espace est fermé' using errcode = '42501';
  end if;
  -- Les slides réécrites : {position, texte}, position existante, texte non vide et différent du publié.
  for x in select * from jsonb_array_elements(coalesce(p_slides, '[]'::jsonb))
  loop
    if (x ->> 'position') ~ '^\d+$' and nullif(btrim(coalesce(x ->> 'texte', '')), '') is not null
       and exists (select 1 from jsonb_array_elements(v_rp.slides) s
                    where (s ->> 'position')::int = (x ->> 'position')::int
                      and btrim(coalesce(s ->> 'texte_overlay', '')) <> btrim(x ->> 'texte')) then
      v_slides := v_slides || jsonb_build_object('position', (x ->> 'position')::int, 'texte', btrim(x ->> 'texte'));
    end if;
  end loop;
  if v_remarque is not null then
    v_mots := coalesce(array_length(regexp_split_to_array(v_remarque, '\s+'), 1), 0);
  end if;
  if jsonb_array_length(v_slides) = 0 and v_mots < 30 then
    raise exception 'relire_post_relecteur : réécris au moins une slide, ou laisse une remarque d''au moins 30 mots' using errcode = '22023';
  end if;
  update public.relectures_posts
     set statut = 'faite', note = p_note, remarque = v_remarque, slides_corrigees = v_slides,
         fait_le = now(), corrections_extraites_le = null, corrections_extraction_erreur = null
   where id = p_id;
  return p_id;
end;
$$;
grant execute on function public.relire_post_relecteur(uuid, integer, text, jsonb) to authenticated;

-- La garde du cron de découpage (0630) couvre aussi les relectures faites.
create or replace function public.corrections_a_extraire()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from ab_traduction_votes v
     where v.remarque is not null and btrim(v.remarque) <> ''
       and v.corrections_extraites_le is null
  ) or exists (
    select 1 from relectures_posts rp
     where rp.statut = 'faite' and rp.corrections_extraites_le is null
  );
$$;

-- ---------------------------------------------------------------------------
-- Le samedi à 8 h 07 UTC : 15 posts par langue qui a un relecteur
-- ---------------------------------------------------------------------------
do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'relectures-hebdo') then
    perform cron.unschedule('relectures-hebdo');
  end if;
  perform cron.schedule('relectures-hebdo', '7 8 * * 6', 'select public.relectures_envoyer_toutes(15, 14);');
end
$cron$;

notify pgrst, 'reload schema';
