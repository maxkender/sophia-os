-- 0761 : doublement du jeudi, règle du 18/11 (relance de Max du 19/11). Additif.
-- 1. Les propositions (40 au plus) sont classées par vues : vues médianes, puis % de posts viraux, sur les 7 derniers
--    jours (posts d'au moins 2 jours, J-8 à J-2). Un post est viral s'il fait au moins 5 fois la médiane de sa langue
--    sur la même période (≈ le top 10 %). Seulement les posteurs actifs qui postent bien (aucun post manqué ni mort),
--    un seul compte actif (une proposition par posteur), pas de demande d'arrêt ouverte, pays où le doublement est
--    autorisé. Le 2e compte va sur un AUTRE label (le meilleur dans sa langue, une autre app si possible).
-- 2. jeudi_doubles_lire_v2 : les mêmes lignes avec les viraux (pour l'onglet Jeudi de Weekly decisions).
-- 3. Kill du samedi d'un posteur à 2 comptes : on ne coupe que le compte décidé ; l'autre (même le 2e compte du jeudi)
--    est gardé. On retire l'annulation automatique du 2e compte ajoutée par 0756.
-- 4. Décision « expire » pour les propositions restées sans décision (pas d'action, pas d'exemple pour les bots).
-- 5. Le rattrapage du samedi enregistre le rituel du samedi (rituels_faits), comme Validate.
-- 6. Bandeau posteur « 2e compte » : mes_bandeaux_compte lit aussi les clés compte_double:…

alter table public.doubles_jeudi add column if not exists viraux integer;

create or replace function public.jeudi_doubles_calculer_v2(p_jeudi date)
returns table (compte_id uuid, poster_id uuid, star boolean, vues_med integer, viraux integer, bons integer, posts integer,
               meilleur_url text, meilleur_vues integer, label_propose_id uuid, rang integer)
language sql
stable
security definer
set search_path = public
as $$
  with b as (
    select p_jeudi - 8 as d1, p_jeudi - 2 as d2,
           coalesce((select (r.valeur #>> '{}')::integer from public.ckd_reglages r where r.cle = 'seuil_mort' and r.pays is null limit 1), 50) as mort
  ),
  c as (
    select c.id, c.poster_id, c.langue, c.application_id, (c.classement::text = 'star') as star
      from public.comptes c
      join public.profiles pr on pr.id = c.poster_id
      cross join b
     where c.is_active and coalesce(c.type_compte, 'perso') = 'perso' and pr.is_active
       and not coalesce(c.non_renouveler, false)
       -- Un seul compte actif : une proposition par posteur, jamais de 3e compte.
       and (select count(*) from public.comptes o where o.poster_id = c.poster_id and o.is_active
             and coalesce(o.type_compte, 'perso') = 'perso') = 1
       -- Plus en warm-up, et au moins 2 semaines de posts.
       and c.warmup_ends_at is not null and c.warmup_ends_at <= now()
       and coalesce((select pj.premier_jour from public.comptes_premier_jour pj where pj.compte_id = c.id),
                    (c.warmup_ends_at at time zone 'Europe/Paris')::date) <= p_jeudi - 17
       -- Pas en pause, pas de demande d'arrêt ouverte.
       and not exists (select 1 from public.posteur_pauses pp where pp.poster_id = c.poster_id
                         and pp.debut <= (p_jeudi + 4)::timestamptz and coalesce(pp.jusqu_au, 'infinity'::timestamptz) >= (p_jeudi - 7)::timestamptz)
       and not exists (select 1 from public.demandes_arret d where d.poster_id = c.poster_id and d.decision is null)
       -- Pays où le doublement est autorisé (réglage du pays, sinon le réglage général).
       and coalesce((select (r.valeur #>> '{}')::boolean from public.ckd_reglages r where r.cle = 'doublement_autorise' and r.pays = c.pays limit 1),
                    (select (r.valeur #>> '{}')::boolean from public.ckd_reglages r where r.cle = 'doublement_autorise' and r.pays is null limit 1),
                    true)
       -- Pas déjà doublé ou en cours.
       and not exists (select 1 from public.doubles_jeudi d where d.compte_id = c.id and d.jeudi <> p_jeudi
                         and d.statut in ('a_creer', 'cree', 'erreur'))
  ),
  posts as (
    select p.compte_id, p.date_publication_prevue as d, p.publie_url, p.vues, p.langue
      from public.passages p join c on c.id = p.compte_id cross join b
     where p.date_publication_prevue between b.d1 and p_jeudi - 1
  ),
  med_langue as (
    select p.langue, percentile_cont(0.5) within group (order by p.vues) as med
      from public.passages p cross join b
     where p.date_publication_prevue between b.d1 and b.d2 and p.publie_url is not null and p.vues is not null
     group by p.langue
  ),
  stats as (
    select c.id, c.poster_id, c.star, c.langue, c.application_id,
           percentile_cont(0.5) within group (order by x.vues) filter (where x.d <= b.d2 and x.vues is not null) as vues_med,
           count(*) filter (where x.d <= b.d2 and x.vues is not null and x.vues >= 5 * coalesce(ml.med, 0) and x.vues > 0) as viraux,
           count(*) filter (where x.d <= b.d2 and x.vues is not null and x.vues >= coalesce(ml.med, 0)) as bons,
           count(*) filter (where x.d <= b.d2) as posts,
           bool_or(x.publie_url is null) as manque,
           bool_or(x.d <= b.d2 and x.vues is not null and x.vues < b.mort) as mort
      from c cross join b
      join posts x on x.compte_id = c.id
      left join med_langue ml on ml.langue = x.langue
     group by c.id, c.poster_id, c.star, c.langue, c.application_id
  ),
  ok as (
    select s.* from stats s
     where s.posts >= 5 and not s.manque and not s.mort and s.vues_med is not null
       -- Un NON n'est pas reproposé, sauf si les vues médianes ont augmenté d'au moins 50 %.
       and not exists (select 1 from public.doubles_jeudi d where d.compte_id = s.id and d.decision = 'non' and d.jeudi <> p_jeudi
                         and s.vues_med < 1.5 * coalesce(d.vues_med, 0))
  ),
  perf as (
    select cl.label_id, p.langue, percentile_cont(0.5) within group (order by p.vues) as med, count(*) as n
      from public.passages p join public.compte_labels cl on cl.compte_id = p.compte_id cross join b
     where p.date_publication_prevue between b.d1 - 14 and b.d2 and p.publie_url is not null and p.vues is not null
     group by cl.label_id, p.langue
    having count(*) >= 5
  )
  select o.id, o.poster_id, o.star, round(o.vues_med)::integer, o.viraux::integer, o.bons::integer, o.posts::integer,
         (select x.publie_url from posts x cross join b where x.compte_id = o.id and x.d <= b.d2 and x.vues is not null
           order by x.vues desc limit 1),
         (select x.vues from posts x cross join b where x.compte_id = o.id and x.d <= b.d2 and x.vues is not null
           order by x.vues desc limit 1),
         coalesce(
           (select l.id from perf pf join public.labels l on l.id = pf.label_id
             where pf.langue = o.langue and not coalesce(l.manuel, false)
               and not exists (select 1 from public.compte_labels cl where cl.compte_id = o.id and cl.label_id = l.id)
             order by (l.application_id is distinct from o.application_id) desc, pf.med desc limit 1),
           -- Langue avec trop peu de posts : le meilleur label toutes langues confondues.
           (select l.id from perf pf join public.labels l on l.id = pf.label_id
             where not coalesce(l.manuel, false)
               and not exists (select 1 from public.compte_labels cl where cl.compte_id = o.id and cl.label_id = l.id)
             group by l.id, l.application_id
             order by (l.application_id is distinct from o.application_id) desc, max(pf.med) desc limit 1)),
         (row_number() over (order by o.vues_med desc, (o.viraux::numeric / nullif(o.posts, 0)) desc nulls last, o.bons desc))::integer
    from ok o
   order by o.vues_med desc, (o.viraux::numeric / nullif(o.posts, 0)) desc nulls last, o.bons desc
   limit 40;
$$;

-- Fige les propositions du jeudi (40 au plus), avec la règle v2 ; ne touche pas aux lignes déjà décidées.
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
  insert into public.doubles_jeudi (jeudi, compte_id, poster_id, rang, star, vues_med, viraux, bons, posts, meilleur_url, meilleur_vues, label_propose_id)
  select p_jeudi, k.compte_id, k.poster_id, k.rang, k.star, k.vues_med, k.viraux, k.bons, k.posts, k.meilleur_url, k.meilleur_vues, k.label_propose_id
    from public.jeudi_doubles_calculer_v2(p_jeudi) k
   where (select count(*) from public.doubles_jeudi d where d.jeudi = p_jeudi) < 40
  on conflict (jeudi, compte_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

create or replace function public.jeudi_doubles_lire_v2(p_jeudi date)
returns table (id uuid, compte_id uuid, poster_id uuid, poster_nom text, hm_nom text, pays text, langue text, handle text,
               label_nom text, app_nom text, canal_paie text, star boolean, vues_med integer, viraux integer, bons integer, posts integer,
               meilleur_url text, meilleur_vues integer, label_propose_id uuid, label_propose_nom text, label_choisi_id uuid,
               decision text, statut text, erreur text, nouveau_compte_id uuid, rang integer)
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
         pr.canal_paie,
         d.star, d.vues_med, d.viraux, d.bons, d.posts, d.meilleur_url, d.meilleur_vues, d.label_propose_id,
         (select l.nom from public.labels l where l.id = d.label_propose_id),
         d.label_choisi_id, d.decision, d.statut, d.erreur, d.nouveau_compte_id, d.rang
    from public.doubles_jeudi d
    join public.comptes c on c.id = d.compte_id
    join public.profiles pr on pr.id = d.poster_id
   where public.is_admin() and d.jeudi = p_jeudi
   order by d.rang nulls last, d.vues_med desc nulls last;
$$;

revoke all on function public.jeudi_doubles_calculer_v2(date) from public, anon, authenticated;
grant execute on function public.jeudi_doubles_calculer_v2(date) to service_role;
revoke all on function public.jeudi_doubles_lire_v2(date) from public, anon;
grant execute on function public.jeudi_doubles_lire_v2(date) to authenticated, service_role;

-- 3. Kill d'un compte sur deux : l'autre compte est gardé (plus d'annulation du 2e compte du jeudi).
do $p$
declare
  d text := pg_get_functiondef('public.ckd_arreter_comptes()'::regprocedure);
  debut integer := position('    -- 0756 : le 2e compte du jeudi' in d);
  fin_txt text := $a$or not exists (select 1 from public.passages p where p.compte_id = nouveau_compte_id and p.publie_url is not null));$a$;
  fin integer;
begin
  if position('0761' in d) > 0 then return; end if;
  if debut = 0 then raise exception '0761 : ckd_arreter_comptes ne correspond pas (début)'; end if;
  fin := position(fin_txt in d);
  if fin = 0 or fin < debut then raise exception '0761 : ckd_arreter_comptes ne correspond pas (fin)'; end if;
  execute substring(d from 1 for debut - 1)
       || '    -- 0761 : on ne coupe que ce compte ; l''autre (même le 2e compte du jeudi) est gardé.'
       || substring(d from fin + length(fin_txt));
end
$p$;

-- 4. « expire » : une proposition restée sans décision, close sans action.
do $p$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.ckd_propositions'::regclass
                  and conname = 'ckd_propositions_decision_check' and pg_get_constraintdef(oid) like '%expire%') then
    alter table public.ckd_propositions drop constraint ckd_propositions_decision_check;
    alter table public.ckd_propositions add constraint ckd_propositions_decision_check
      check (decision = any (array['nudge', 'recreer', 'ne_pas_renouveler', 'doubler', 'garder', 'pas_maintenant', 'rien', 'expire']));
  end if;
end
$p$;

-- Une expiration n'est pas une décision de Max : pas d'exemple pour les bots.
do $p$
declare
  d text := pg_get_functiondef('public.exemples_bots_weekly()'::regprocedure);
  avant text := $a$and new.action is not null and new.decision <> new.action then$a$;
begin
  if position('0761' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0761 : exemples_bots_weekly ne correspond pas'; end if;
  execute replace(d, avant, $a$and new.action is not null and new.decision <> new.action and new.decision <> 'expire' /* 0761 */ then$a$);
end
$p$;

-- 5. Le rattrapage du samedi enregistre le rituel du samedi.
do $p$
declare
  d text := pg_get_functiondef('public.samedi_rattrapage_valider(date,jsonb)'::regprocedure);
  avant text := $a$  return jsonb_build_object('kills', v_kills, 'kills_sans_paie', v_np, 'gardes', v_gardes, 'erreurs', to_jsonb(v_err));$a$;
begin
  if position('0761' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0761 : samedi_rattrapage_valider ne correspond pas'; end if;
  execute replace(d, avant, $a$  -- 0761 : le samedi est enregistré (rituels_faits), comme avec Validate.
  if not exists (select 1 from public.rituels_faits rf where rf.rituel = 'samedi' and rf.lundi = p_lundi) then
    insert into public.rituels_faits (rituel, lundi, fait_par, resume)
    values ('samedi', p_lundi, auth.uid(),
            jsonb_build_object('rattrapage', true, 'kills', v_kills + v_np, 'gardes', v_gardes, 'erreurs', coalesce(array_length(v_err, 1), 0)));
  end if;
$a$ || avant);
end
$p$;

-- 6. Bandeaux du posteur : un compte arrêté, ou un 2e compte qui arrive.
create or replace function public.mes_bandeaux_compte()
returns table (cle text, texte text, maj_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select t.cle, t.texte, t.maj_at from public.posteur_textes t
   where t.poster_id = auth.uid() and (t.cle like 'compte_arrete:%' or t.cle like 'compte_double:%') and t.vu_at is null
   order by t.maj_at desc;
$$;
