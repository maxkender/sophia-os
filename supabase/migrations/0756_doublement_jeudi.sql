-- 0756 : kills, partie 4 (Max, 18/11) : le doublement passe au jeudi.
-- 1. doubles_jeudi : les propositions du jeudi (40 au plus), la décision de Max (OUI / NON, label du 2e compte),
--    le compte créé. Un NON n'est pas reproposé, sauf si les vues médianes ont augmenté d'au moins 50 %.
-- 2. jeudi_doubles_calculer : les comptes éligibles, classés (stars d'abord, puis vues médianes et bons posts de la
--    semaine complète d'avant), avec le label proposé pour le 2e compte (autre label, autre app si possible, le
--    meilleur dans la langue du posteur). jeudi_doubles_preparer les fige dans doubles_jeudi (cron du jeudi matin).
-- 3. jeudi_doubles_lire, jeudi_double_decider, jeudi_doubles_tout_refuser, jeudi_lundi_resume (page du jeudi).
-- 4. jeudi_double_cree / jeudi_double_erreur : pour la fonction ckd (création du compte).
-- 5. Samedi : plus de proposition « doubler » (ckd_calculer).
-- 6. Paie : un 2e compte validé le jeudi compte pour 2 dès le lundi suivant (paie_suivante_calc).
-- 7. Kill du samedi du 1er compte : le 2e compte du jeudi est annulé avant son démarrage (ckd_arreter_comptes).
-- Additif : une table, des fonctions, trois fonctions existantes complétées.

create table if not exists public.doubles_jeudi (
  id uuid primary key default gen_random_uuid(),
  jeudi date not null,
  compte_id uuid not null references public.comptes(id),
  poster_id uuid not null references public.profiles(id),
  rang integer,
  star boolean not null default false,
  vues_med integer,
  bons integer,
  posts integer,
  meilleur_url text,
  meilleur_vues integer,
  label_propose_id uuid,
  label_choisi_id uuid,
  decision text check (decision in ('oui', 'non')),
  decide_at timestamptz,
  decide_par uuid,
  statut text not null default 'propose' check (statut in ('propose', 'refuse', 'a_creer', 'cree', 'erreur', 'annule')),
  nouveau_compte_id uuid,
  erreur text,
  annule_at timestamptz,
  created_at timestamptz not null default now(),
  unique (jeudi, compte_id)
);
alter table public.doubles_jeudi enable row level security;
do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'doubles_jeudi' and policyname = 'doubles_jeudi_admin') then
    create policy doubles_jeudi_admin on public.doubles_jeudi for select to authenticated using (public.is_admin());
  end if;
end
$p$;

-- Les comptes à proposer ce jeudi (sans rien écrire).
create or replace function public.jeudi_doubles_calculer(p_jeudi date)
returns table (compte_id uuid, poster_id uuid, star boolean, vues_med integer, bons integer, posts integer,
               meilleur_url text, meilleur_vues integer, label_propose_id uuid, rang integer)
language sql
stable
security definer
set search_path = public
as $$
  with b as (
    select p_jeudi - 3 as lc, p_jeudi - 10 as lp, p_jeudi - 4 as dp,
           coalesce((select (r.valeur #>> '{}')::integer from public.ckd_reglages r where r.cle = 'seuil_mort' limit 1), 50) as mort
  ),
  c as (
    select c.id, c.poster_id, c.langue, c.application_id, (c.classement::text = 'star') as star
      from public.comptes c
      join public.profiles pr on pr.id = c.poster_id
      cross join b
     where c.is_active and coalesce(c.type_compte, 'perso') = 'perso' and pr.is_active
       and not coalesce(c.non_renouveler, false)
       -- Un seul compte actif (pas de 3e compte).
       and (select count(*) from public.comptes o where o.poster_id = c.poster_id and o.is_active
             and coalesce(o.type_compte, 'perso') = 'perso') = 1
       -- Pas en warm-up.
       and c.warmup_ends_at is not null and c.warmup_ends_at <= now()
       -- Au moins 2 semaines complètes de posts (la semaine d'avant et celle d'avant encore).
       and coalesce((select pj.premier_jour from public.comptes_premier_jour pj where pj.compte_id = c.id),
                    (c.warmup_ends_at at time zone 'Europe/Paris')::date) <= b.lp - 7
       -- Pas en pause cette semaine.
       and not exists (select 1 from public.posteur_pauses pp where pp.poster_id = c.poster_id
                         and pp.debut <= (b.lc + 7)::timestamptz and coalesce(pp.jusqu_au, 'infinity'::timestamptz) >= b.lc::timestamptz)
       -- Pas déjà doublé ou en cours, pas refusé (sauf vues nettement en hausse : vérifié plus bas).
       and not exists (select 1 from public.doubles_jeudi d where d.compte_id = c.id and d.jeudi <> p_jeudi
                         and d.statut in ('a_creer', 'cree', 'erreur'))
  ),
  posts as (
    select p.compte_id, p.date_publication_prevue as d, p.publie_url, p.vues, p.langue
      from public.passages p join c on c.id = p.compte_id cross join b
     where p.date_publication_prevue between b.lp and p_jeudi - 1
  ),
  med_langue as (
    select p.langue, percentile_cont(0.5) within group (order by p.vues) as med
      from public.passages p cross join b
     where p.date_publication_prevue between b.lp and b.dp and p.publie_url is not null and p.vues is not null
     group by p.langue
  ),
  stats as (
    select c.id, c.poster_id, c.star, c.langue, c.application_id,
           percentile_cont(0.5) within group (order by x.vues) filter (where x.d <= b.dp and x.vues is not null) as vues_med,
           count(*) filter (where x.d <= b.dp and x.vues is not null and x.vues >= coalesce(ml.med, 0)) as bons,
           count(*) filter (where x.d <= b.dp) as posts,
           bool_or(x.publie_url is null) as manque,
           bool_or(x.d <= b.dp and x.vues is not null and x.vues < b.mort) as mort
      from c cross join b
      join posts x on x.compte_id = c.id
      left join med_langue ml on ml.langue = x.langue
     group by c.id, c.poster_id, c.star, c.langue, c.application_id
  ),
  ok as (
    select s.* from stats s
     where s.posts > 0 and not s.manque and not s.mort and s.vues_med is not null
       and not exists (select 1 from public.doubles_jeudi d where d.compte_id = s.id and d.decision = 'non' and d.jeudi <> p_jeudi
                         and s.vues_med < 1.5 * coalesce(d.vues_med, 0))
  ),
  perf as (
    select cl.label_id, p.langue, percentile_cont(0.5) within group (order by p.vues) as med, count(*) as n
      from public.passages p join public.compte_labels cl on cl.compte_id = p.compte_id cross join b
     where p.date_publication_prevue between b.lp - 7 and b.dp and p.publie_url is not null and p.vues is not null
     group by cl.label_id, p.langue
    having count(*) >= 5
  )
  select o.id, o.poster_id, o.star, round(o.vues_med)::integer, o.bons::integer, o.posts::integer,
         (select x.publie_url from posts x cross join b where x.compte_id = o.id and x.d <= b.dp and x.vues is not null
           order by x.vues desc limit 1),
         (select x.vues from posts x cross join b where x.compte_id = o.id and x.d <= b.dp and x.vues is not null
           order by x.vues desc limit 1),
         (select l.id from perf pf join public.labels l on l.id = pf.label_id
           where pf.langue = o.langue and not coalesce(l.manuel, false)
             and not exists (select 1 from public.compte_labels cl where cl.compte_id = o.id and cl.label_id = l.id)
           order by (l.application_id is distinct from o.application_id) desc, pf.med desc limit 1),
         (row_number() over (order by o.star desc, o.vues_med desc, o.bons desc))::integer
    from ok o
   order by o.star desc, o.vues_med desc, o.bons desc
   limit 40;
$$;

-- Fige les propositions du jeudi (40 au plus) ; ne touche pas aux lignes déjà décidées.
create or replace function public.jeudi_doubles_preparer(p_jeudi date)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_n integer;
begin
  if not public.is_admin() and coalesce(auth.jwt()->>'role', '') <> 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.doubles_jeudi (jeudi, compte_id, poster_id, rang, star, vues_med, bons, posts, meilleur_url, meilleur_vues, label_propose_id)
  select p_jeudi, k.compte_id, k.poster_id, k.rang, k.star, k.vues_med, k.bons, k.posts, k.meilleur_url, k.meilleur_vues, k.label_propose_id
    from public.jeudi_doubles_calculer(p_jeudi) k
   where (select count(*) from public.doubles_jeudi d where d.jeudi = p_jeudi) < 40
  on conflict (jeudi, compte_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

create or replace function public.jeudi_doubles_lire(p_jeudi date)
returns table (id uuid, compte_id uuid, poster_id uuid, poster_nom text, hm_nom text, pays text, langue text, handle text,
               label_nom text, app_nom text, star boolean, vues_med integer, bons integer, posts integer, meilleur_url text,
               meilleur_vues integer, label_propose_id uuid, label_choisi_id uuid, decision text, statut text, erreur text,
               nouveau_compte_id uuid, rang integer)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.compte_id, d.poster_id,
         coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
         (select coalesce(nullif(btrim(concat_ws(' ', h.prenom, h.nom)), ''), h.email) from public.profiles h where h.id = pr.manager_id),
         c.pays, c.langue, c.handle_tiktok,
         (select string_agg(l.nom, ', ') from public.compte_labels cl join public.labels l on l.id = cl.label_id where cl.compte_id = c.id),
         (select a.nom from public.applications a where a.id = c.application_id),
         d.star, d.vues_med, d.bons, d.posts, d.meilleur_url, d.meilleur_vues, d.label_propose_id, d.label_choisi_id,
         d.decision, d.statut, d.erreur, d.nouveau_compte_id, d.rang
    from public.doubles_jeudi d
    join public.comptes c on c.id = d.compte_id
    join public.profiles pr on pr.id = d.poster_id
   where public.is_admin() and d.jeudi = p_jeudi
   order by d.rang nulls last, d.vues_med desc nulls last;
$$;

-- Les labels possibles pour un 2e compte (dropdown), avec leur app et leur vues médianes dans la langue.
create or replace function public.jeudi_labels_possibles(p_compte uuid)
returns table (label_id uuid, nom text, app_nom text, autre_app boolean, vues_med integer)
language sql
stable
security definer
set search_path = public
as $$
  with c as (select id, langue, application_id from public.comptes where id = p_compte),
  perf as (
    select cl.label_id, percentile_cont(0.5) within group (order by p.vues) as med
      from public.passages p join public.compte_labels cl on cl.compte_id = p.compte_id cross join c
     where p.langue = c.langue and p.date_publication_prevue > current_date - 21 and p.publie_url is not null and p.vues is not null
     group by cl.label_id
  )
  select l.id, l.nom, a.nom, l.application_id is distinct from c.application_id, round(pf.med)::integer
    from public.labels l cross join c
    left join public.applications a on a.id = l.application_id
    left join perf pf on pf.label_id = l.id
   where public.is_admin() and not coalesce(l.manuel, false)
     and not exists (select 1 from public.compte_labels cl where cl.compte_id = c.id and cl.label_id = l.id)
   order by (l.application_id is distinct from c.application_id) desc, pf.med desc nulls last, l.nom
   limit 60;
$$;

create or replace function public.jeudi_double_decider(p_id uuid, p_decision text, p_label uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not public.is_admin_strict() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_decision not in ('oui', 'non') then raise exception 'décision inconnue'; end if;
  update public.doubles_jeudi
     set decision = p_decision, decide_at = now(), decide_par = auth.uid(),
         label_choisi_id = case when p_decision = 'oui' then coalesce(p_label, label_choisi_id, label_propose_id) end,
         statut = case when p_decision = 'oui' then 'a_creer' else 'refuse' end, erreur = null
   where id = p_id and statut in ('propose', 'refuse', 'erreur');
  if not found then raise exception 'proposition introuvable ou déjà créée'; end if;
end;
$function$;

create or replace function public.jeudi_doubles_tout_refuser(p_jeudi date)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_n integer;
begin
  if not public.is_admin_strict() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.doubles_jeudi set decision = 'non', decide_at = now(), decide_par = auth.uid(), statut = 'refuse'
   where jeudi = p_jeudi and decision is null and statut = 'propose';
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- Le 2e compte est créé (fonction ckd) : il démarre le lendemain de son warm-up, avec la cohorte du lundi.
create or replace function public.jeudi_double_cree(p_id uuid, p_compte uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.doubles_jeudi set nouveau_compte_id = p_compte, statut = 'cree', erreur = null where id = p_id;
  update public.comptes set premiers_posts_le = null where id = p_compte;
$$;

create or replace function public.jeudi_double_erreur(p_id uuid, p_erreur text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.doubles_jeudi set statut = 'erreur', erreur = left(p_erreur, 500) where id = p_id and statut <> 'cree';
$$;

-- Ce qui démarre lundi, par pays : les nouveaux posteurs de la cohorte et les 2e comptes validés jeudi.
create or replace function public.jeudi_lundi_resume(p_jeudi date)
returns table (pays text, nouveaux integer, doubles integer, total integer)
language sql
stable
security definer
set search_path = public
as $$
  with n as (
    select coalesce((select c.pays from public.comptes c where c.poster_id = pr.id order by c.created_at limit 1), '?') as pays
      from public.profiles pr
     where pr.cohorte_lundi = p_jeudi + 4 and pr.relances_stop_at is null
       and not exists (select 1 from public.arrets a where a.poster_id = pr.id and a.annule_at is null)
  ),
  d as (
    select coalesce(c.pays, '?') as pays from public.doubles_jeudi dj join public.comptes c on c.id = dj.compte_id
     where dj.jeudi = p_jeudi and dj.statut in ('a_creer', 'cree')
  ),
  t as (select pays, 1 as n, 0 as d from n union all select pays, 0, 1 from d)
  select t.pays, sum(t.n)::integer, sum(t.d)::integer, (sum(t.n) + sum(t.d))::integer
    from t where public.is_admin()
   group by t.pays order by sum(t.n) + sum(t.d) desc, t.pays;
$$;

-- 5. Samedi : plus de proposition « doubler » (le doublement est au jeudi).
do $p$
declare
  d text := pg_get_functiondef('public.ckd_calculer(text,date)'::regprocedure);
  avant text := $a$where not (t.regle = 'doubler' and t.a_un_kill)$a$;
begin
  if position('0756' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0756 : ckd_calculer ne correspond pas'; end if;
  execute replace(d, avant, $a$where not (t.regle = 'doubler' and (t.a_un_kill or p_type = 'samedi' /* 0756 */))$a$);
end
$p$;

-- 6. Paie : un 2e compte validé le jeudi (21 jours au plus avant la coupure) compte pour 2 dès le lundi suivant.
do $p$
declare
  d text := pg_get_functiondef('public.paie_suivante_calc(date,jsonb)'::regprocedure);
  avant text := $a$exists (select 1 from doubles x where x.nouveau_compte_id = c.id)$a$;
begin
  if position('0756' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0756 : paie_suivante_calc ne correspond pas'; end if;
  execute replace(d, avant, $a$(exists (select 1 from doubles x where x.nouveau_compte_id = c.id)
                or exists (select 1 from public.doubles_jeudi dj cross join bornes b2 /* 0756 */
                            where dj.nouveau_compte_id = c.id and dj.statut = 'cree'
                              and dj.decide_at <= b2.coupure and dj.decide_at >= b2.coupure - interval '21 days'))$a$);
end
$p$;

-- 7. Kill du 1er compte : le 2e compte validé jeudi (pas encore démarré) est annulé avec lui.
do $p$
declare
  d text := pg_get_functiondef('public.ckd_arreter_comptes()'::regprocedure);
  avant text := $a$    update public.comptes set is_active = false where id = r.compte_id;
    update public.ckd_arrets set fait_at = now() where compte_id = r.compte_id;$a$;
begin
  if position('0756' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0756 : ckd_arreter_comptes ne correspond pas'; end if;
  execute replace(d, avant, avant || $a$
    -- 0756 : le 2e compte du jeudi (pas encore démarré) est annulé avec le 1er.
    update public.comptes x set is_active = false, non_renouveler = true, non_renouveler_at = now(),
           non_renouveler_raison = 'ckd:double_annule'
      from public.doubles_jeudi dj
     where dj.compte_id = r.compte_id and dj.statut = 'cree' and dj.nouveau_compte_id = x.id and x.is_active
       and not exists (select 1 from public.passages p where p.compte_id = x.id and p.publie_url is not null);
    update public.doubles_jeudi set statut = 'annule', annule_at = now()
     where compte_id = r.compte_id and statut in ('a_creer', 'cree')
       and (nouveau_compte_id is null
            or not exists (select 1 from public.passages p where p.compte_id = nouveau_compte_id and p.publie_url is not null));$a$);
end
$p$;

revoke all on function public.jeudi_doubles_calculer(date) from public, anon, authenticated;
revoke all on function public.jeudi_double_cree(uuid, uuid) from public, anon, authenticated;
revoke all on function public.jeudi_double_erreur(uuid, text) from public, anon, authenticated;
revoke all on function public.jeudi_doubles_preparer(date) from public, anon;
revoke all on function public.jeudi_doubles_lire(date) from public, anon;
revoke all on function public.jeudi_labels_possibles(uuid) from public, anon;
revoke all on function public.jeudi_double_decider(uuid, text, uuid) from public, anon;
revoke all on function public.jeudi_doubles_tout_refuser(date) from public, anon;
revoke all on function public.jeudi_lundi_resume(date) from public, anon;
grant execute on function public.jeudi_doubles_calculer(date) to service_role;
grant execute on function public.jeudi_double_cree(uuid, uuid) to service_role;
grant execute on function public.jeudi_double_erreur(uuid, text) to service_role;
grant execute on function public.jeudi_doubles_preparer(date) to authenticated, service_role;
grant execute on function public.jeudi_doubles_lire(date) to authenticated, service_role;
grant execute on function public.jeudi_labels_possibles(uuid) to authenticated, service_role;
grant execute on function public.jeudi_double_decider(uuid, text, uuid) to authenticated;
grant execute on function public.jeudi_doubles_tout_refuser(date) to authenticated;
grant execute on function public.jeudi_lundi_resume(date) to authenticated, service_role;

-- Le jeudi matin, les propositions sont prêtes.
do $p$
begin
  if not exists (select 1 from cron.job where jobname = 'doubles-jeudi-preparer') then
    perform cron.schedule('doubles-jeudi-preparer', '17 6 * * 4',
      $c$select public.jeudi_doubles_preparer((now() at time zone 'Europe/Paris')::date)$c$);
  end if;
end
$p$;
