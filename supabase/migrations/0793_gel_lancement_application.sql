-- 0793 : geler le lancement d'une application (décisions de l'admin du 20/11).
--
-- LE BESOIN. Atala a des comptes (25 recrues, et 13 comptes déjà lancés,
-- déplacés le 20/11 depuis classic_study et that_girl_study), mais l'admin ne
-- veut AUCUN post Atala tant qu'il n'a pas dit « go ». Pendant ce temps :
--   * les comptes ne reçoivent rien (l'application est coupée, `actif = false` :
--     le tirage et l'assignation savent déjà la sauter) ;
--   * aucune date de warm-up ne bouge (les cohortes, le lundi et le financement
--     de la semaine suivante les lisent) ;
--   * LA PAIE NE CHANGE PAS : un compte dont le warm-up est fini et qui ne
--     reçoit rien parce que son application est gelée est payé sa semaine,
--     comme s'il postait ;
--   * le posteur voit un warm-up prolongé, pas un calendrier vide ;
--   * les relances ne le prennent pas pour un posteur qui ne poste pas.
-- Au « go », l'application est rallumée et tous ses comptes repartent au tirage
-- suivant (14 h, pour le lendemain).
--
-- POURQUOI UN GEL, ET PAS « application inactive ». Une application inactive
-- peut aussi être une application ARRÊTÉE (UnSwipe le 4/11) : un compte resté
-- dessus ne doit pas être payé à ne rien faire. Le gel est donc un geste à
-- part, daté, qui se ferme tout seul quand l'application est rallumée.
--
-- CE QUE CETTE MIGRATION AJOUTE :
--   1. `applications_gels` : le journal (application, début, fin). La paie est
--      calculée le lundi pour la semaine d'avant, parfois après le « go » : il
--      faut la trace. Un déclencheur ferme le gel ouvert quand `actif` repasse
--      à vrai.
--   2. `application_geler(slug, note)` : coupe l'application et ouvre le gel
--      (admin). Le « go » : rallumer l'application (écran ou SQL).
--   3. `compte_gele(compte)` : vrai pour un compte actif, perso, warm-up fini,
--      pas en rouge, dont l'application est gelée et qu'aucune autre
--      application active ne sert. `mes_comptes_geles()` pour le dashboard du
--      posteur, `poster_gel(poster)` pour le bot support,
--      `comptes_geles_semaine(lundi)` pour la paie.
--   4. LA PAIE (`paie_calculer_v3`) : un compte gelé dans la semaine et SANS
--      AUCUN POST ASSIGNÉ est payé son tarif (« Application pas encore lancée :
--      semaine payée »), sans Kill. Dès qu'il a des posts assignés dans la
--      semaine (avant le gel, ou après le « go »), la règle d'avant s'applique
--      telle quelle : payé s'il en a fait un, rien sinon. Les lecteurs du
--      calcul (page Paie, paie automatique, lot Ruul, fiche du samedi) suivent
--      seuls.
--   5. LES RELANCES : le message du lundi 20 h (`lundi_soir_posteurs`, « today
--      is your first posting day and we don't see any post ») et le contrôle
--      de cohérence n° 6 (« compte actif sans post assigné ») ne voient plus un
--      compte gelé. `support_etat_reel` dit au bot que le posteur est en
--      warm-up prolongé, payé.
--   6. Le gel d'Atala, ouvert au moment où elle a été coupée : le 20/11 à
--      16 h 26 (heure de Paris).
--
-- ✅ Appliquée le 2026-11-20 (MCP), en deux temps : `0793_gel_lancement_application`
-- puis `0793b_gel_paie_sans_post_assigne`. La première version payait un compte
-- gelé « sans post FAIT » : lea.rast951, 10 posts assignés de lundi à vendredi
-- et aucun fait, passait de « rien à payer » à payé pour la semaine du 16/11.
-- La règle est donc « sans post ASSIGNÉ » ; ce fichier porte la version finale.
--
-- VÉRIFIÉ après application. `paie_calculer_v3` rend la même empreinte (poster,
-- comptes, posts, tarif, montant, statut, raison, action) qu'avant pour les
-- semaines du 2/11 (344 lignes, 3 485) et du 9/11 (463 lignes, 3 798). Semaine
-- du 16/11, en cours : mêmes totaux (594 lignes, 5 033, 450 comptes payés) et
-- aucune ligne due au gel. Semaine du 23/11, simulée avec le gel toujours
-- ouvert : 16 posteurs payés (les 13 comptes déplacés et les 3 recrues dont le
-- warm-up finit le 23/11), 179 au total ; sans la règle : 0.
-- 13 comptes gelés à l'instant ; le contrôle de cohérence n'en signale aucun.
--
-- LIMITES CONNUES :
--   * l'application d'un compte est lue à l'instant du calcul
--     (`parts_applications`) : un compte sorti de l'application gelée avant le
--     lundi de paie n'est plus compté comme gelé ;
--   * un posteur arrêté (Kill) pendant le gel suit les règles du Kill.
--
-- Retour arrière : remettre `paie_calculer_v3`, `lundi_soir_posteurs`,
-- `coherence_violations` et `support_etat_reel` (retirer les blocs marqués
-- 0793) ; `drop trigger applications_gel_ferme on public.applications` ; les
-- fonctions et la table peuvent rester.

set lock_timeout = '5s';

-- 1. Le journal.
create table if not exists public.applications_gels (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.applications(id) on delete cascade,
  debut timestamptz not null default now(),
  fin timestamptz,
  note text,
  par uuid,
  constraint applications_gels_ordre check (fin is null or fin > debut)
);
create unique index if not exists applications_gels_ouvert
  on public.applications_gels (application_id) where fin is null;

comment on table public.applications_gels is
  'Journal des gels de lancement d''une application (0793) : tant que le gel est ouvert, ses comptes ne reçoivent rien, restent en warm-up prolongé et sont payés. Ouvert par application_geler(), fermé quand l''application est rallumée.';

alter table public.applications_gels enable row level security;
do $p$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'applications_gels'
                   and policyname = 'applications_gels_admin') then
    create policy applications_gels_admin on public.applications_gels
      for select to authenticated using (public.is_admin());
  end if;
end
$p$;
revoke all on public.applications_gels from public, anon;
grant select on public.applications_gels to authenticated, service_role;

-- Rallumer l'application ferme son gel : c'est le « go ».
create or replace function public.applications_gel_fermer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.actif and not coalesce(old.actif, false) then
    update applications_gels set fin = now() where application_id = new.id and fin is null;
  end if;
  return new;
end;
$function$;

drop trigger if exists applications_gel_ferme on public.applications;
create trigger applications_gel_ferme
  after update of actif on public.applications
  for each row execute function public.applications_gel_fermer();

-- 2. Le geste : couper l'application et ouvrir le gel.
create or replace function public.application_geler(p_slug text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_app public.applications;
  v_id bigint;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'applications : réservé aux admins' using errcode = '42501';
  end if;
  select * into v_app from applications where slug = p_slug for update;
  if not found then
    raise exception 'applications : application % inconnue', p_slug;
  end if;
  if v_app.actif then
    update applications set actif = false where id = v_app.id;
  end if;
  insert into applications_gels (application_id, note, par)
  values (v_app.id, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (application_id) where fin is null do nothing
  returning id into v_id;
  return jsonb_build_object('ok', true, 'application', v_app.slug, 'gel', v_id, 'deja_gelee', v_id is null);
end;
$function$;

revoke all on function public.application_geler(text, text) from public, anon;
grant execute on function public.application_geler(text, text) to authenticated, service_role;

comment on function public.application_geler(text, text) is
  'Gèle le lancement d''une application (0793) : la coupe et ouvre un gel dans applications_gels. Le « go » : rallumer l''application, le gel se ferme seul.';

-- 3. Un compte gelé, à l'instant.
create or replace function public.compte_gele(p_compte uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
      from comptes c
     where c.id = p_compte
       and c.is_active
       and coalesce(c.type_compte, 'perso') = 'perso'
       and c.warmup_ends_at is not null and c.warmup_ends_at <= now()
       and exists (select 1 from applications_gels g
                    where g.fin is null and g.application_id = any (public.compte_applications(c)))
       and not exists (select 1 from applications a
                        where a.actif and a.id = any (public.compte_applications(c)))
       -- Une recrue en rouge pas encore décidée ne recevrait rien de toute façon (0392).
       and not exists (select 1 from recrues_rouges rr
                        where rr.poster_id = c.poster_id and rr.decision is null
                          and rr.etape in ('acces', 'tiktok', 'warmup')));
$function$;

revoke all on function public.compte_gele(uuid) from public, anon, authenticated;
grant execute on function public.compte_gele(uuid) to service_role;

comment on function public.compte_gele(uuid) is
  'Vrai si le compte ne reçoit rien parce que son application est gelée (0793) : actif, perso, warm-up fini, pas en rouge, gel ouvert, aucune autre application active. Lu par les relances, le support et le dashboard du posteur.';

-- Les comptes gelés du posteur connecté (son dashboard affiche le warm-up prolongé).
create or replace function public.mes_comptes_geles()
returns table (compte_id uuid, depuis timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select c.id,
         (select min(g.debut) from applications_gels g
           where g.fin is null and g.application_id = any (public.compte_applications(c)))
    from comptes c
   where c.poster_id = auth.uid() and public.compte_gele(c.id);
$function$;

revoke all on function public.mes_comptes_geles() from public, anon;
grant execute on function public.mes_comptes_geles() to authenticated;

-- Pour le bot support : ce qu'il doit savoir d'un posteur dont un compte est gelé.
create or replace function public.poster_gel(p_poster uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case when count(*) = 0 then null else jsonb_build_object(
           'comptes', jsonb_agg(c.handle_tiktok order by c.created_at),
           'explication', 'Extended warm-up: the app this account promotes is not launched yet. The poster has NO posts to publish for now, and that is expected. They keep scrolling, liking and following accounts in their niche, post nothing, and keep their old posts. Their pay does not change: these weeks are paid like normal weeks. They will be told when the posts are ready.')
         end
    from comptes c
   where c.poster_id = p_poster and public.compte_gele(c.id);
$function$;

revoke all on function public.poster_gel(uuid) from public, anon, authenticated;
grant execute on function public.poster_gel(uuid) to service_role;

-- Pour la paie : les comptes gelés au moins un moment de la semaine (lundi → dimanche, Paris).
create or replace function public.comptes_geles_semaine(p_lundi date)
returns table (compte_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with bornes as (
    select (p_lundi::timestamp at time zone 'Europe/Paris') as debut,
           ((p_lundi + 7)::timestamp at time zone 'Europe/Paris') as fin
  )
  select distinct c.id
    from comptes c
    cross join bornes b
    join applications_gels g on g.application_id = any (public.compte_applications(c))
   where c.is_active
     and coalesce(c.type_compte, 'perso') = 'perso'
     and g.debut < b.fin
     and coalesce(g.fin, 'infinity'::timestamptz) > b.debut
     -- Le compte aurait posté pendant le gel : son warm-up finit avant la fin du gel et de la semaine.
     and c.warmup_ends_at is not null
     and c.warmup_ends_at < least(coalesce(g.fin, 'infinity'::timestamptz), b.fin)
     and not exists (select 1 from recrues_rouges rr
                      where rr.poster_id = c.poster_id and rr.decision is null
                        and rr.etape in ('acces', 'tiktok', 'warmup'));
$function$;

revoke all on function public.comptes_geles_semaine(date) from public, anon, authenticated;
grant execute on function public.comptes_geles_semaine(date) to service_role;

comment on function public.comptes_geles_semaine(date) is
  'Les comptes gelés au moins un moment de la semaine du lundi donné (0793) : leur warm-up était fini et leur application gelée. Lue par paie_calculer_v3.';

-- 4 et 5. Les fonctions existantes : chaque bloc est remplacé une fois, sinon rien n'est changé.
create or replace function pg_temp.fonction_patcher(p_fn regprocedure, p_paires text[])
returns void
language plpgsql
as $function$
declare
  d text;
  i integer;
  n integer;
begin
  d := pg_get_functiondef(p_fn);
  if position('0793' in d) > 0 then
    return; -- déjà passée
  end if;
  for i in 1 .. array_length(p_paires, 1) / 2 loop
    n := (length(d) - length(replace(d, p_paires[2 * i - 1], ''))) / length(p_paires[2 * i - 1]);
    if n <> 1 then
      raise exception '0793 : % : bloc % trouvé % fois (attendu 1), rien n''est changé', p_fn, i, n;
    end if;
    d := replace(d, p_paires[2 * i - 1], p_paires[2 * i]);
  end loop;
  execute d;
end;
$function$;

-- 4. La paie : un compte gelé sans post fait est payé sa semaine.
select pg_temp.fonction_patcher('public.paie_calculer_v3(date)'::regprocedure, array[
$a$  comptes_semaine as ($a$,
$b$  -- 0793 : les comptes dont l'application était gelée dans la semaine.
  geles as materialized (
    select gs.compte_id from public.comptes_geles_semaine(p_lundi) gs
  ),
  comptes_semaine as ($b$,

$a$and c.created_at >= b.debut - interval '21 days'))) as en_warmup$a$,
$b$and c.created_at >= b.debut - interval '21 days'))) as en_warmup,
           exists (select 1 from geles gl where gl.compte_id = c.id) as gel$b$,

$a$greatest(cs.attendus - cs.faits, 0) as rates,$a$,
$b$greatest(cs.attendus - cs.faits, 0) as rates,
           -- 0793 : gelé ET sans aucun post assigné dans la semaine. Avec des posts assignés
           -- (avant le gel, ou après le « go »), la règle d'avant s'applique telle quelle.
           (cs.gel and cs.attendus = 0) as gele,$b$,

$a$(count(*) filter (where pc.attendus > 0))::int as nb_comptes,$a$,
$b$(count(*) filter (where pc.attendus > 0 or pc.gele))::int as nb_comptes,
           bool_or(pc.gele) as gele,$b$,

$a$(count(*) filter (where pc.attendus > 0 and (pc.faits > 0 or pc.pause)))::int as comptes_payes,$a$,
$b$(count(*) filter (where (pc.attendus > 0 and (pc.faits > 0 or pc.pause)) or pc.gele))::int as comptes_payes,$b$,

$a$coalesce(sum(pc.tarif) filter (where pc.attendus > 0 and (pc.faits > 0 or pc.pause)), 0)::numeric as montant,$a$,
$b$coalesce(sum(pc.tarif) filter (where (pc.attendus > 0 and (pc.faits > 0 or pc.pause)) or pc.gele), 0)::numeric as montant,$b$,

$a$bool_or(pc.en_warmup and pc.attendus = 0) as warmup,$a$,
$b$bool_or(pc.en_warmup and pc.attendus = 0 and not pc.gele) as warmup,$b$,

$a$'montant', case when (pc.faits > 0 or pc.pause) and pc.tarif is not null then pc.tarif else 0 end,$a$,
$b$'montant', case when (pc.faits > 0 or pc.pause or pc.gele) and pc.tarif is not null then pc.tarif else 0 end,
             'gele', pc.gele,$b$,

$a$'warmup', pc.en_warmup and pc.attendus = 0)$a$,
$b$'warmup', pc.en_warmup and pc.attendus = 0 and not pc.gele)$b$,

$a$filter (where pc.attendus > 0 or (pc.en_warmup and pc.attendus = 0)), '[]'::jsonb)$a$,
$b$filter (where pc.attendus > 0 or pc.gele or (pc.en_warmup and pc.attendus = 0)), '[]'::jsonb)$b$,

$a$having (count(*) filter (where pc.attendus > 0)) > 0 or bool_or(pc.en_warmup)$a$,
$b$having (count(*) filter (where pc.attendus > 0)) > 0 or bool_or(pc.en_warmup) or bool_or(pc.gele)$b$,

$a$when (e.kill or not e.is_active) and e.faits = 0 and not e.pause and e.deja_financee then 'annuler'$a$,
$b$when (e.kill or not e.is_active) and e.faits = 0 and not e.pause and not e.gele and e.deja_financee then 'annuler'$b$,

$a$when (e.kill or not e.is_active) and e.faits = 0 and not e.pause then 'rien'$a$,
$b$when (e.kill or not e.is_active) and e.faits = 0 and not e.pause and not e.gele then 'rien'$b$,

$a$when e.nb_comptes = 0 or (e.faits = 0 and not e.pause) then 'rien'$a$,
$b$when e.nb_comptes = 0 or (e.faits = 0 and not e.pause and not e.gele) then 'rien'$b$,

$a$case when e.nb_comptes > 0 and e.faits = 0 and not e.pause then '0 post avec lien dans la semaine : rien à payer' end,$a$,
$b$case when e.nb_comptes > 0 and e.faits = 0 and not e.pause and not e.gele then '0 post avec lien dans la semaine : rien à payer' end,
             case when e.gele then 'Application pas encore lancée (warm-up prolongé) : semaine payée' end,$b$
]);

-- 5a. Le lundi 20 h ne relance pas un compte gelé.
select pg_temp.fonction_patcher('public.lundi_soir_posteurs(date)'::regprocedure, array[
$a$where not exists (select 1 from public.hub_posteurs h where h.profile_id = ca.poster_id and h.exclu_suivi /* 0575 */)$a$,
$b$where not exists (select 1 from public.hub_posteurs h where h.profile_id = ca.poster_id and h.exclu_suivi /* 0575 */)
     -- 0793 : un compte dont l'application est gelée n'a rien à poster ce lundi.
     and not public.compte_gele(ca.compte_id)$b$
]);

-- 5b. Le contrôle de cohérence n° 6 (compte actif sans post) ignore un compte gelé.
select pg_temp.fonction_patcher('public.coherence_violations()'::regprocedure, array[
$a$c.type_compte='perso' and c.warmup_ends_at<=now() and not exists(select 1 from ckd_arrets k$a$,
$b$c.type_compte='perso' and c.warmup_ends_at<=now() and not public.compte_gele(c.id) /* 0793 */ and not exists(select 1 from ckd_arrets k$b$
]);

-- 5c. Le bot support sait que le posteur est en warm-up prolongé, payé.
select pg_temp.fonction_patcher('public.support_etat_reel(uuid)'::regprocedure, array[
$a$'cohorte', pr.cohorte_lundi,$a$,
$b$'cohorte', pr.cohorte_lundi, 'gel' /* 0793 */, public.poster_gel(p_poster),$b$
]);

-- 6. Le gel d'Atala, depuis l'instant où elle a été coupée (20/11, 16 h 26 à Paris).
insert into public.applications_gels (application_id, debut, note)
select a.id, timestamptz '2026-11-20 16:26:01.587457+01',
       'Atala coupée à la demande de l''admin, jusqu''à son « go » : warm-up prolongé, paie inchangée.'
  from public.applications a
 where a.slug = 'atala' and not a.actif
on conflict (application_id) where fin is null do nothing;
