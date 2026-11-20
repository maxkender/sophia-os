-- 0791 : questionnaire « top posters » avant envoi (Max, 20/11). Additif ; ne touche qu'au questionnaire, à son
-- pop-up et au bonus.
-- 1. Réponses : la langue du formulaire, les réponses écrites traduites en français (page Questionnaires), le bonus.
-- 2. Bonus de 5 $ : seulement pour un questionnaire TERMINÉ (obligatoires + au moins une capture, contrôlé par la
--    fonction questionnaire), un posteur ciblé (pop-up), une seule fois par posteur. Une ligne « bonus » de type
--    « questionnaire », à valider, sur le lundi qui suit : Upwork avec les bonus du lundi (Max clique), Ruul dans
--    le lot Ruul du lundi.
-- 3. Pop-up : dans la langue de son compte ; « Later » 3 fois au plus (il revient à la connexion suivante,
--    20 h plus tard au plus tôt).
-- 4. Les cibles : les posteurs « star » et les 30 meilleurs sur 14 jours (vues médianes, puis % de posts viraux),
--    Ruul et Upwork, sans doublon. Le pop-up ne part qu'au clic de Max (questionnaire_cibles_envoyer).

-- 1.
alter table public.questionnaire_reponses add column if not exists langue text;
alter table public.questionnaire_reponses add column if not exists reponses_fr jsonb;
alter table public.questionnaire_reponses add column if not exists bonus_id uuid;
alter table public.questionnaire_popups add column if not exists plus_tard_n integer not null default 0;
alter table public.questionnaires add column if not exists bonus numeric not null default 0;
update public.questionnaires set bonus = 5 where slug = 'top-posters' and bonus = 0;

-- 2. Le type « questionnaire » s'ajoute aux types de bonus (les autres valeurs restent).
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.bonus'::regclass and contype = 'c' and conname = 'bonus_type_check'
              and pg_get_constraintdef(oid) not ilike '%questionnaire%'
  loop
    execute format('alter table public.bonus drop constraint %I', c.conname);
    alter table public.bonus add constraint bonus_type_check check (type in ('parrainage', 'comment_master', 'manuel', 'questionnaire'));
  end loop;
end $$;
create unique index if not exists bonus_questionnaire_un_par_posteur on public.bonus (poster_id) where type = 'questionnaire' and statut <> 'retire';

/** Le lundi qui suit un jour (jamais le jour même). */
create or replace function public.questionnaire_lundi_suivant(p_jour date)
returns date
language sql
immutable
as $$
  select p_jour + (8 - extract(isodow from p_jour)::int);
$$;

create or replace function public.questionnaire_bonus_creer(p_reponse uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.questionnaire_reponses;
  v_montant numeric;
  v_canal text;
  v_id uuid;
  v_lundi date;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then raise exception 'réservé à la fonction questionnaire'; end if;
  select * into r from public.questionnaire_reponses where id = p_reponse;
  if r.id is null or r.termine_at is null or r.poster_id is null then return jsonb_build_object('ok', false, 'raison', 'non terminé ou non relié'); end if;
  select bonus into v_montant from public.questionnaires where slug = r.slug;
  if coalesce(v_montant, 0) <= 0 then return jsonb_build_object('ok', false, 'raison', 'pas de bonus'); end if;
  -- Seulement les posteurs ciblés (pop-up envoyé).
  if not exists (select 1 from public.questionnaire_popups pp where pp.slug = r.slug and pp.poster_id = r.poster_id) then
    return jsonb_build_object('ok', false, 'raison', 'pas ciblé');
  end if;
  -- Un seul bonus par posteur : celui qui existe déjà est rendu.
  select id, lundi_bonus into v_id, v_lundi from public.bonus where poster_id = r.poster_id and type = 'questionnaire' and statut <> 'retire' limit 1;
  if v_id is null then
    v_lundi := public.questionnaire_lundi_suivant((now() at time zone 'Europe/Paris')::date);
    select case when p.canal_paie = 'ruul' then 'ruul' else 'upwork' end into v_canal from public.profiles p where p.id = r.poster_id;
    insert into public.bonus (poster_id, type, lundi_bonus, periode_debut, periode_fin, detail, quantite, montant, statut, raison, canal_paie)
    values (r.poster_id, 'questionnaire', v_lundi, v_lundi, v_lundi, 'Bonus questionnaire', 1, v_montant, 'a_valider',
            'Questionnaire: thank you for your answers', coalesce(v_canal, 'upwork'))
    on conflict do nothing
    returning id into v_id;
    if v_id is null then
      select id, lundi_bonus into v_id, v_lundi from public.bonus where poster_id = r.poster_id and type = 'questionnaire' and statut <> 'retire' limit 1;
    end if;
  end if;
  update public.questionnaire_reponses set bonus_id = v_id where id = r.id and bonus_id is distinct from v_id;
  return jsonb_build_object('ok', v_id is not null, 'lundi', v_lundi, 'bonus_id', v_id);
end;
$$;
revoke all on function public.questionnaire_bonus_creer(uuid) from public, anon, authenticated;
grant execute on function public.questionnaire_bonus_creer(uuid) to service_role;

-- La page Pay : les bonus questionnaire (à valider, à payer, payés).
create or replace function public.questionnaire_bonus_lire()
returns table (id uuid, poster_id uuid, nom text, canal_paie text, lundi date, montant numeric, statut text, envoi_at timestamptz, paye_at timestamptz, erreur text)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.poster_id, coalesce(nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), p.email), b.canal_paie, b.lundi_bonus, b.montant, b.statut,
         b.envoi_at, b.paye_at, b.erreur
    from public.bonus b join public.profiles p on p.id = b.poster_id
   where public.is_admin() and b.type = 'questionnaire'
   order by b.lundi_bonus desc, 3;
$$;
revoke all on function public.questionnaire_bonus_lire() from public, anon;
grant execute on function public.questionnaire_bonus_lire() to authenticated;

-- 3. Le pop-up du posteur connecté : avec la langue de son compte ; caché 20 h après « Later », plus après 3 fois.
create or replace function public.questionnaire_popup_mien()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('slug', q.slug, 'titre', q.titre, 'bonus', q.bonus,
           'langue', coalesce((select c.langue from public.comptes c where c.poster_id = auth.uid() and c.is_active
                                  and coalesce(c.type_compte, 'perso') = 'perso' order by c.created_at limit 1), 'en'),
           'plus_tard_restants', greatest(0, 3 - pp.plus_tard_n))
    from public.questionnaire_popups pp
    join public.questionnaires q on q.slug = pp.slug and q.actif
   where pp.poster_id = auth.uid() and pp.repondu_at is null and pp.plus_tard_n < 3
     and (pp.plus_tard_at is null or pp.plus_tard_at < now() - interval '20 hours')
     and not exists (select 1 from public.questionnaire_reponses r where r.slug = pp.slug and r.poster_id = auth.uid() and r.termine_at is not null)
   order by pp.cree_at desc limit 1;
$$;
revoke execute on function public.questionnaire_popup_mien() from public, anon;
grant execute on function public.questionnaire_popup_mien() to authenticated;

-- « Later » : compté (3 au plus). Clic sur le lien : caché jusqu'à la connexion suivante, sans compter.
create or replace function public.questionnaire_popup_fermer(p_slug text, p_ouvert boolean default false)
returns void
language sql
security definer
set search_path = public
as $$
  update public.questionnaire_popups
     set plus_tard_at = now(), vu_at = coalesce(vu_at, now()),
         plus_tard_n = plus_tard_n + case when p_ouvert then 0 else 1 end
   where slug = p_slug and poster_id = auth.uid();
$$;
revoke execute on function public.questionnaire_popup_fermer(text, boolean) from public, anon;
grant execute on function public.questionnaire_popup_fermer(text, boolean) to authenticated;

-- 4. Les cibles : « star » (un compte actif classé star) et les 30 meilleurs sur 14 jours (posts publiés de J-15 à J-2,
--    au moins 7 posts) : vues médianes, puis % de posts viraux (au moins 5 fois la médiane de sa langue).
create or replace function public.questionnaire_cibles(p_slug text)
returns table (poster_id uuid, nom text, canal_paie text, langue text, star boolean, rang integer, vues_mediane integer,
               pct_viraux integer, posts integer, popup text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'réservé à l''admin' using errcode = '42501'; end if;
  return query
  with b as (select (now() at time zone 'Europe/Paris')::date - 15 as d1, (now() at time zone 'Europe/Paris')::date - 2 as d2),
  posteurs as (
    select p.id, p.canal_paie, coalesce(nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), p.email) as nom
      from public.profiles p join public.user_roles ur on ur.user_id = p.id and ur.role = 'poster'
     where p.is_active
  ),
  cpt as (
    select c.* from public.comptes c join posteurs p on p.id = c.poster_id
     where c.is_active and coalesce(c.type_compte, 'perso') = 'perso'
  ),
  ml as (
    select pa.langue, percentile_cont(0.5) within group (order by pa.vues) as med
      from public.passages pa cross join b
     where pa.date_publication_prevue between b.d1 and b.d2 and pa.publie_url is not null and pa.vues is not null
     group by pa.langue
  ),
  st as (
    select c.poster_id, percentile_cont(0.5) within group (order by pa.vues) as vues_med, count(*) as n,
           count(*) filter (where pa.vues > 0 and pa.vues >= 5 * coalesce(ml.med, 0)) as viraux
      from cpt c join public.passages pa on pa.compte_id = c.id cross join b
      left join ml on ml.langue = pa.langue
     where pa.date_publication_prevue between b.d1 and b.d2 and pa.publie_url is not null and pa.vues is not null
     group by c.poster_id
  ),
  cl as (
    select st.*, row_number() over (order by st.vues_med desc, st.viraux::numeric / st.n desc)::int as rg
      from st where st.n >= 7
  ),
  stars as (select distinct cpt.poster_id from cpt where cpt.classement::text = 'star')
  select p.id, p.nom, coalesce(p.canal_paie, 'upwork'),
         coalesce((select c.langue from cpt c where c.poster_id = p.id order by c.created_at limit 1), 'en'),
         p.id in (select s.poster_id from stars s), cl.rg, round(cl.vues_med)::int,
         case when cl.n > 0 then round(100.0 * cl.viraux / cl.n)::int end, cl.n::int,
         (select case when pp.repondu_at is not null then 'repondu' when pp.plus_tard_n >= 3 then 'plus_tard_3' else 'envoye' end
            from public.questionnaire_popups pp where pp.slug = p_slug and pp.poster_id = p.id)
    from posteurs p left join cl on cl.poster_id = p.id
   where p.id in (select s.poster_id from stars s) or cl.rg <= 30
   order by cl.rg nulls last, p.nom;
end;
$$;
revoke all on function public.questionnaire_cibles(text) from public, anon;
grant execute on function public.questionnaire_cibles(text) to authenticated;

-- L'envoi (au clic de Max seulement) : le pop-up aux cibles qui ne l'ont pas encore.
create or replace function public.questionnaire_cibles_envoyer(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not public.is_admin() then raise exception 'réservé à l''admin' using errcode = '42501'; end if;
  insert into public.questionnaire_popups (slug, poster_id, cree_par)
  select p_slug, c.poster_id, auth.uid() from public.questionnaire_cibles(p_slug) c
  on conflict (slug, poster_id) do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'envoyes', n);
end;
$$;
revoke all on function public.questionnaire_cibles_envoyer(text) from public, anon;
grant execute on function public.questionnaire_cibles_envoyer(text) to authenticated;

-- La page Questionnaires : la langue, la traduction française et le bonus de chaque réponse (champs ajoutés).
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
      'langue', r.langue, 'reponses_fr', r.reponses_fr,
      'bonus', (select jsonb_build_object('lundi', b.lundi_bonus, 'statut', b.statut, 'canal', b.canal_paie, 'montant', b.montant)
                  from public.bonus b where b.id = r.bonus_id),
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

notify pgrst, 'reload schema';
