-- 0717 : Questionnaire « top posters » (Max, 15/11). Un formulaire public par lien, sans connexion.
-- 1. questionnaires : les questionnaires (slug du lien) ; « top-posters » créé ici.
-- 2. questionnaire_reponses : une ligne par personne (jeton du navigateur), sauvegardée au fil des écrans ;
--    reliée à la fiche du posteur par email, email Ruul, email perso ou @ TikTok ; sinon « non reliée ».
-- 3. questionnaire_popups : les posteurs choisis à la main par Max ; eux seuls voient le pop-up avec le lien,
--    jusqu'à leur réponse ou « Later ».
-- 4. Espace de stockage privé « questionnaires » (captures), lisible par l'admin seulement.
-- Additif : rien d'existant n'est modifié (onboarding, dashboard, relances inchangés).

create table if not exists public.questionnaires (
  slug text primary key check (slug ~ '^[a-z0-9-]{3,40}$'),
  titre text not null,
  actif boolean not null default true,
  cree_at timestamptz not null default now()
);
insert into public.questionnaires (slug, titre) values ('top-posters', 'Top posters')
on conflict (slug) do nothing;

create table if not exists public.questionnaire_reponses (
  id uuid primary key default gen_random_uuid(),
  slug text not null references public.questionnaires(slug),
  jeton text not null unique check (jeton ~ '^[A-Za-z0-9-]{20,64}$'),
  nom text,
  email text,
  tiktok text,
  poster_id uuid references public.profiles(id),
  relie_par text,
  reponses jsonb not null default '{}'::jsonb,
  captures jsonb not null default '{}'::jsonb,
  section integer not null default 0,
  termine_at timestamptz,
  cree_at timestamptz not null default now(),
  maj_at timestamptz not null default now()
);
create index if not exists questionnaire_reponses_slug_idx on public.questionnaire_reponses (slug, maj_at desc);
create index if not exists questionnaire_reponses_poster_idx on public.questionnaire_reponses (poster_id) where poster_id is not null;

create table if not exists public.questionnaire_popups (
  slug text not null references public.questionnaires(slug),
  poster_id uuid not null references public.profiles(id),
  cree_at timestamptz not null default now(),
  cree_par uuid,
  vu_at timestamptz,
  plus_tard_at timestamptz,
  repondu_at timestamptz,
  primary key (slug, poster_id)
);

alter table public.questionnaires enable row level security;
alter table public.questionnaire_reponses enable row level security;
alter table public.questionnaire_popups enable row level security;
drop policy if exists questionnaires_admin on public.questionnaires;
create policy questionnaires_admin on public.questionnaires for select to authenticated using (public.is_admin());
drop policy if exists questionnaire_reponses_admin on public.questionnaire_reponses;
create policy questionnaire_reponses_admin on public.questionnaire_reponses for select to authenticated using (public.is_admin());
drop policy if exists questionnaire_popups_admin on public.questionnaire_popups;
create policy questionnaire_popups_admin on public.questionnaire_popups for select to authenticated using (public.is_admin());

insert into storage.buckets (id, name, public) values ('questionnaires', 'questionnaires', false)
on conflict (id) do nothing;
drop policy if exists questionnaires_captures_admin on storage.objects;
create policy questionnaires_captures_admin on storage.objects for select to authenticated
  using (bucket_id = 'questionnaires' and public.is_admin());

-- La fiche du posteur d'une réponse : email (login, Ruul, perso), puis @ TikTok. Profils désactivés compris.
create or replace function public.questionnaire_relier(p_email text, p_tiktok text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_tiktok text := lower(regexp_replace(btrim(coalesce(p_tiktok, '')), '^@+', ''));
  v_id uuid;
begin
  if v_email <> '' then
    select p.id into v_id from public.profiles p where lower(p.email) = v_email order by p.is_active desc limit 1;
    if v_id is not null then return jsonb_build_object('poster_id', v_id, 'par', 'email'); end if;
    select p.id into v_id from public.profiles p where lower(p.ruul_email) = v_email order by p.is_active desc limit 1;
    if v_id is not null then return jsonb_build_object('poster_id', v_id, 'par', 'email_ruul'); end if;
    select p.id into v_id from public.profiles p where lower(p.email_perso) = v_email order by p.is_active desc limit 1;
    if v_id is null then
      select h.profile_id into v_id from public.hub_posteurs h where lower(h.email_perso) = v_email and h.profile_id is not null limit 1;
    end if;
    if v_id is not null then return jsonb_build_object('poster_id', v_id, 'par', 'email_perso'); end if;
  end if;
  if v_tiktok <> '' then
    select c.poster_id into v_id from public.comptes c
     where lower(regexp_replace(coalesce(c.handle_tiktok, ''), '^@+', '')) = v_tiktok and c.poster_id is not null
     order by c.is_active desc limit 1;
    if v_id is not null then return jsonb_build_object('poster_id', v_id, 'par', 'tiktok'); end if;
  end if;
  return jsonb_build_object('poster_id', null, 'par', null);
end;
$$;
revoke execute on function public.questionnaire_relier(text, text) from public, anon, authenticated;
grant execute on function public.questionnaire_relier(text, text) to service_role;

-- Page admin : les réponses et, à côté, les données OS du posteur (compte principal = son 1er compte perso actif).
create or replace function public.questionnaire_admin(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'réservé à l''admin' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'nom', r.nom, 'email', r.email, 'tiktok', r.tiktok, 'poster_id', r.poster_id, 'relie_par', r.relie_par,
      'reponses', r.reponses, 'captures', r.captures, 'section', r.section, 'termine_at', r.termine_at, 'maj_at', r.maj_at,
      'os', case when r.poster_id is null then null else (
        select jsonb_build_object(
          'nom_os', nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''),
          'handle', c.handle_tiktok,
          'classement', c.classement,
          'langue', c.langue,
          'labels', (select string_agg(l.nom, ' · ' order by l.nom) from public.compte_labels cl join public.labels l on l.id = cl.label_id where cl.compte_id = c.id),
          'warmup_start', c.warmup_started_at,
          'abonnements', (select w.abonnements from public.ckd_warmup_releves w where w.compte_id = c.id and w.abonnements is not null order by w.releve_at desc limit 1),
          'premier_post', (select min(pa.date_publication_prevue) from public.passages pa where pa.compte_id = c.id and pa.publie_url is not null),
          'vues_mediane_30j', (select round(percentile_cont(0.5) within group (order by pa.vues)) from public.passages pa
                                where pa.compte_id = c.id and pa.publie_url is not null and pa.vues is not null and pa.date_publication_prevue >= current_date - 30),
          'vues_moyenne_30j', (select round(avg(pa.vues)) from public.passages pa
                                where pa.compte_id = c.id and pa.publie_url is not null and pa.vues is not null and pa.date_publication_prevue >= current_date - 30),
          'posts_30j', (select count(*) from public.passages pa where pa.compte_id = c.id and pa.publie_url is not null and pa.date_publication_prevue >= current_date - 30))
          from public.profiles p
          left join lateral (select * from public.comptes c0 where c0.poster_id = p.id and c0.type_compte = 'perso'
                              order by c0.is_active desc, c0.created_at limit 1) c on true
         where p.id = r.poster_id)
      end
    ) order by r.termine_at desc nulls last, r.maj_at desc)
      from public.questionnaire_reponses r where r.slug = p_slug
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.questionnaire_admin(text) from public, anon;
grant execute on function public.questionnaire_admin(text) to authenticated;

-- « Envoyer un pop-up » : les posteurs choisis voient le lien sur leur dashboard (renvoyer le fait réapparaître).
create or replace function public.questionnaire_popup_envoyer(p_slug text, p_posters uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not public.is_admin() then raise exception 'réservé à l''admin' using errcode = '42501'; end if;
  if not exists (select 1 from public.questionnaires where slug = p_slug) then return jsonb_build_object('ok', false, 'error', 'questionnaire introuvable'); end if;
  insert into public.questionnaire_popups (slug, poster_id, cree_par)
  select p_slug, p.id, auth.uid() from public.profiles p where p.id = any(coalesce(p_posters, '{}'))
  on conflict (slug, poster_id) do update set plus_tard_at = null, vu_at = null, cree_at = now(), cree_par = auth.uid()
   where public.questionnaire_popups.repondu_at is null;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'envoyes', n);
end;
$$;
revoke execute on function public.questionnaire_popup_envoyer(text, uuid[]) from public, anon;
grant execute on function public.questionnaire_popup_envoyer(text, uuid[]) to authenticated;

-- Pour le posteur connecté : le questionnaire à montrer en pop-up (un seul), s'il y en a un.
create or replace function public.questionnaire_popup_mien()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('slug', q.slug, 'titre', q.titre)
    from public.questionnaire_popups pp
    join public.questionnaires q on q.slug = pp.slug and q.actif
   where pp.poster_id = auth.uid() and pp.repondu_at is null and pp.plus_tard_at is null
     and not exists (select 1 from public.questionnaire_reponses r where r.slug = pp.slug and r.poster_id = auth.uid() and r.termine_at is not null)
   order by pp.cree_at desc limit 1;
$$;
revoke execute on function public.questionnaire_popup_mien() from public, anon;
grant execute on function public.questionnaire_popup_mien() to authenticated;

-- « Later » (ou clic sur le lien) : le pop-up disparaît.
create or replace function public.questionnaire_popup_fermer(p_slug text, p_ouvert boolean default false)
returns void
language sql
security definer
set search_path = public
as $$
  update public.questionnaire_popups
     set plus_tard_at = case when p_ouvert then plus_tard_at else now() end, vu_at = coalesce(vu_at, now())
   where slug = p_slug and poster_id = auth.uid();
$$;
revoke execute on function public.questionnaire_popup_fermer(text, boolean) from public, anon;
grant execute on function public.questionnaire_popup_fermer(text, boolean) to authenticated;

-- La liste des posteurs actifs, pour choisir à qui envoyer le pop-up (admin).
create or replace function public.questionnaire_posteurs(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'réservé à l''admin' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'nom', nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''),
      'handle', (select c.handle_tiktok from public.comptes c where c.poster_id = p.id and c.is_active and c.type_compte = 'perso' order by c.created_at limit 1),
      'classement', (select c.classement from public.comptes c where c.poster_id = p.id and c.is_active and c.type_compte = 'perso' order by c.created_at limit 1),
      'popup', (select case when pp.repondu_at is not null then 'repondu' when pp.plus_tard_at is not null then 'plus_tard' else 'envoye' end
                  from public.questionnaire_popups pp where pp.slug = p_slug and pp.poster_id = p.id),
      'repondu', exists (select 1 from public.questionnaire_reponses r where r.slug = p_slug and r.poster_id = p.id and r.termine_at is not null)
    ) order by p.prenom, p.nom)
      from public.profiles p
      join public.user_roles ur on ur.user_id = p.id and ur.role = 'poster'
     where p.is_active
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.questionnaire_posteurs(text) from public, anon;
grant execute on function public.questionnaire_posteurs(text) to authenticated;
