-- 0642 : BLEO, les familles quasi identiques regroupées en thèmes (D45, D30 ;
-- décision d'Adrien, 2/11 : « fais le regroupement des familles en thèmes »).
--
-- Une famille, c'est un hook exact. Avant BLEO, podz et imports ont multiplié
-- les reprises d'un même hook à un mot près : dans weird_alpha, « hobbies that
-- will make you dangerously confident » (106 contenus), « … disgustingly
-- confident » (16), « … irreversibly confident », « … unnervingly confident »…
-- 32 familles, 166 contenus, 1 037 posts en 60 jours. La fatigue (0,75 par
-- passage de la famille dans la langue), le garde-fou « même famille sur un
-- compte à moins de 10 jours », le budget (20 % du label sur 7 jours), la boîte
-- et la règle « une déclinaison par famille et par jour » voyaient 32 familles
-- distinctes. La semaine du 26/10, 36 % des posts des originaux tombaient dans
-- ces familles très remplies : 9,6 % de posts à 10 k contre ~15 % ailleurs.
--
-- Un thème = des familles d'un même label dont les hooks sont voisins (la règle
-- de 0631, durcie) : au moins `themes.seuil` (0,6) des mots du hook le plus
-- court en commun, dont au moins `themes.mots_min` (2) qui ne sont pas des mots
-- génériques (`themes.mots_faibles` : habit, life, become, man…). Sans ce
-- durcissement, « the 5 theories that actually change your life » et « 5 daily
-- habits that will change your life » faisaient un thème. Regroupement en
-- étoile : chaque famille rejoint la tête la plus proche, une tête étant la plus
-- grosse famille de son thème ; pas de chaîne (A voisin de B voisin de C).
-- Sur les 3 754 familles du 2/11 : 2 841 thèmes, dont 435 de plusieurs familles
-- (1 348 familles regroupées).
--
-- Ce qui passe au thème :
--   * A5 (`bleo_nuit`, `bleo_nouveaux_avant_tirage`) et `bleo_valeur_au_jour` :
--     la fatigue d'accroche compte les passages du thème dans la langue ;
--   * `bleo_tirage` : « même famille sur un compte », budget et fatigue du
--     tirage, tests (colonne `famille_id` des tables du tirage = id du thème) ;
--   * `bleo_rapport` : les infractions « même famille » se lisent au thème ;
--   * la boîte : une ligne par thème, budget au thème ;
--   * le guichet : une déclinaison par thème et par jour (code inchangé
--     `famille_du_jour`) ; et D30 : un full test dont le hook tombe dans un
--     thème qui a déjà gagné est refusé (`theme_gagnant`) : le décliner depuis
--     la boîte, ou une autre idée.
-- Ce qui reste à la famille : verdicts, fermeture, quota de déclinaisons par
-- parent, jauge.
--
-- `bleo_familles.theme_id` = la tête du thème (elle-même pour une tête). Une
-- famille créée prend son thème à l'insertion (déclencheur) ; tout recalculer :
-- `select public.bleo_regrouper_themes();`.
--
-- Les fonctions existantes sont patchées EN PLACE (pg_get_functiondef, puis
-- remplacement de blocs exacts) : la migration échoue si un bloc n'est pas
-- trouvé exactement une fois, sans rien changer.
--
-- Retour arrière : `update bleo_familles set theme_id = id;` remet chaque famille
-- seule dans son thème (le comportement d'avant ; seul reste D30 : le guichet
-- refuse encore un full test au hook voisin d'une famille gagnante). Pour tout
-- défaire : rejouer 0612 (bleo_nuit), 0638 (bleo_nouveaux_avant_tirage), 0630
-- (bleo_valeur_au_jour), 0639 (bleo_tirage), bleo_rapport, 0631
-- (bleo_verifier_depot), 0628 (bleo_boite) et 0611 (bleo_familles_ui).

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Réglages, colonnes, fonctions de thème
-- ---------------------------------------------------------------------------
update reglages
   set valeur = jsonb_set(valeur, '{themes}', jsonb_build_object(
         'seuil', 0.6,
         'mots_min', 2,
         'mots_faibles', jsonb_build_array(
           'habit','habitude','life','become','devenir','feel','feeling','stop','like','today','before','wish',
           'build','day','jour','tip','astuce','conseil','again','start','know','well','better','best','change',
           'time','being','etre','avoir','work','instead','truc','chose','need','improve','simple','want','year',
           'sign','rule','skill','man','woman','girl','guy','person','student','people','comment','pourquoi')))
 where cle = 'bleo' and not (valeur ? 'themes');

alter table public.bleo_familles add column if not exists mots text[];
alter table public.bleo_familles add column if not exists theme_id uuid
  references public.bleo_familles(id) on delete set null;
create index if not exists bleo_familles_theme_idx on public.bleo_familles (theme_id);
create index if not exists bleo_familles_mots_idx on public.bleo_familles using gin (mots);

comment on column public.bleo_familles.theme_id is
  'BLEO (0642) : la tête du thème (familles quasi identiques du label) ; elle-même pour une tête. Fatigue, garde-fous, budget, boîte et « une déclinaison par jour » se lisent au thème.';
comment on column public.bleo_familles.mots is
  'BLEO (0642) : bleo_mots_accroche(accroche_norm), tenu par le déclencheur bleo_familles_theme.';

-- Deux hooks sont-ils du même thème ? Leur proximité si oui, 0 sinon.
create or replace function public.bleo_meme_theme(a text[], b text[], p_faibles text[], p_seuil numeric, p_min integer)
returns numeric
language sql
immutable
as $function$
  select case
           when public.bleo_proximite_accroches(a, b) >= p_seuil
            and (select count(*) from unnest(coalesce(a, '{}')) x
                  where x = any(coalesce(b, '{}')) and not (x = any(coalesce(p_faibles, '{}')))) >= p_min
           then public.bleo_proximite_accroches(a, b)
           else 0 end
$function$;

comment on function public.bleo_meme_theme(text[], text[], text[], numeric, integer) is
  'BLEO (0642) : proximité de deux hooks s''ils sont du même thème (part des mots en commun ≥ seuil, dont ≥ p_min mots non génériques), 0 sinon.';

-- La tête de thème la plus proche dans le label (null : la famille ouvre son propre thème).
create or replace function public.bleo_tete_theme(p_label uuid, p_mots text[], p_exclure uuid default null)
returns uuid
language sql
stable
set search_path to 'public'
as $function$
  with q as (
    select coalesce((valeur->'themes'->>'seuil')::numeric, 0.6) as seuil,
           coalesce((valeur->'themes'->>'mots_min')::int, 2) as mn,
           coalesce(array(select jsonb_array_elements_text(valeur->'themes'->'mots_faibles')), '{}'::text[]) as faibles
      from reglages where cle = 'bleo'
  ),
  p as (
    -- Les mots non génériques du hook : une tête doit en partager au moins un (index GIN).
    select q.*, coalesce(array(select x from unnest(coalesce(p_mots, '{}'::text[])) x where not (x = any(q.faibles))), '{}'::text[]) as forts
      from q
  )
  select h.id
    from bleo_familles h, p
   where h.label_id = p_label and h.theme_id = h.id and h.id is distinct from p_exclure
     and cardinality(p.forts) >= p.mn
     and h.mots && p.forts
     and public.bleo_meme_theme(p_mots, h.mots, p.faibles, p.seuil, p.mn) > 0
   order by public.bleo_meme_theme(p_mots, h.mots, p.faibles, p.seuil, p.mn) desc,
            (select count(*) from contenus c where c.famille_id = h.id) desc, h.created_at, h.id
   limit 1
$function$;

-- Le thème d'une famille (la famille elle-même si elle n'en a pas).
create or replace function public.bleo_theme_famille(p_famille uuid)
returns uuid
language sql
stable
set search_path to 'public'
as $function$
  select coalesce((select coalesce(f.theme_id, f.id) from bleo_familles f where f.id = p_famille), p_famille)
$function$;

create or replace function public.bleo_familles_theme_trg()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.mots := public.bleo_mots_accroche(new.accroche_norm);
  if tg_op = 'INSERT' and new.theme_id is null then
    new.theme_id := coalesce(public.bleo_tete_theme(new.label_id, new.mots, new.id), new.id);
  end if;
  return new;
end;
$function$;

drop trigger if exists bleo_familles_theme on public.bleo_familles;
create trigger bleo_familles_theme
  before insert or update of accroche_norm on public.bleo_familles
  for each row execute function public.bleo_familles_theme_trg();

-- Tout recalculer (un label, ou tous) : les plus grosses familles d'abord (elles
-- deviennent têtes). ~10 à 35 ms par famille : alpha_male (1 074 familles) prend
-- une dizaine de secondes.
create or replace function public.bleo_regrouper_themes(p_label uuid default null)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  r record;
  v_debut timestamptz := clock_timestamp();
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'bleo : réservé aux admins' using errcode = '42501';
  end if;
  update bleo_familles set mots = public.bleo_mots_accroche(accroche_norm), theme_id = null
   where p_label is null or label_id = p_label;
  for r in
    select f.id, f.label_id, f.mots
      from bleo_familles f
     where p_label is null or f.label_id = p_label
     order by f.label_id,
              (select count(*) from contenus c where c.famille_id = f.id and c.statut <> 'rejete') desc,
              f.created_at, f.id
  loop
    update bleo_familles
       set theme_id = coalesce(public.bleo_tete_theme(r.label_id, r.mots, r.id), r.id)
     where id = r.id;
  end loop;
  return jsonb_build_object(
    'label', p_label,
    'familles', (select count(*) from bleo_familles where p_label is null or label_id = p_label),
    'themes', (select count(*) from bleo_familles where theme_id = id and (p_label is null or label_id = p_label)),
    'themes_de_plusieurs_familles', (select count(*) from (select theme_id from bleo_familles
                                       where p_label is null or label_id = p_label group by 1 having count(*) > 1) z),
    'familles_regroupees', (select count(*) from bleo_familles where theme_id <> id and (p_label is null or label_id = p_label)),
    'duree_s', round(extract(epoch from clock_timestamp() - v_debut)::numeric, 1));
end;
$function$;

comment on function public.bleo_regrouper_themes(uuid) is
  'BLEO (0642) : recalcule tous les thèmes (regroupement en étoile par label, les plus grosses familles en tête).';

-- ---------------------------------------------------------------------------
-- 2. Patchs en place
-- ---------------------------------------------------------------------------
create or replace function pg_temp.bleo_patcher(p_fn regprocedure, p_paires text[])
returns void
language plpgsql
as $function$
declare
  d text;
  i integer;
  n integer;
begin
  d := pg_get_functiondef(p_fn);
  for i in 1 .. array_length(p_paires, 1) / 2 loop
    n := (length(d) - length(replace(d, p_paires[2 * i - 1], ''))) / length(p_paires[2 * i - 1]);
    if n <> 1 then
      raise exception '0642 : % : bloc % trouvé % fois (attendu 1), rien n''est changé', p_fn, i, n;
    end if;
    d := replace(d, p_paires[2 * i - 1], p_paires[2 * i]);
  end loop;
  execute d;
end;
$function$;

-- A5 de la nuit : la fatigue d'accroche au thème.
select pg_temp.bleo_patcher('public.bleo_nuit(boolean)'::regprocedure, array[
$a$    select c.id as contenu_id, l.langue, c.created_at, c.famille_id,$a$,
$b$    select c.id as contenu_id, l.langue, c.created_at, public.bleo_theme_famille(c.famille_id) as famille_id,$b$,
$a$    select c.famille_id, e.langue, sum(e.n) as n
      from exp e join contenus c on c.id = e.contenu_id
     where c.famille_id is not null
     group by c.famille_id, e.langue$a$,
$b$    -- 0642 : la fatigue d'accroche compte les passages du THÈME (familles quasi identiques).
    select public.bleo_theme_famille(c.famille_id) as famille_id, e.langue, sum(e.n) as n
      from exp e join contenus c on c.id = e.contenu_id
     where c.famille_id is not null
     group by 1, e.langue$b$]);

-- A5 d'avant tirage (0638), même changement.
select pg_temp.bleo_patcher('public.bleo_nouveaux_avant_tirage()'::regprocedure, array[
$a$    select c.id as contenu_id, l.langue, c.created_at, c.famille_id,$a$,
$b$    select c.id as contenu_id, l.langue, c.created_at, public.bleo_theme_famille(c.famille_id) as famille_id,$b$,
$a$    select c.famille_id, e.langue, sum(e.n) as n
      from exp e join contenus c on c.id = e.contenu_id
     where c.famille_id in (select famille_id from cand)
     group by c.famille_id, e.langue$a$,
$b$    -- 0642 : la fatigue d'accroche compte les passages du THÈME.
    select public.bleo_theme_famille(c.famille_id) as famille_id, e.langue, sum(e.n) as n
      from exp e join contenus c on c.id = e.contenu_id
     where c.famille_id is not null
       and public.bleo_theme_famille(c.famille_id) in (select famille_id from cand)
     group by 1, e.langue$b$]);

-- Le tirage : les tables du tirage portent le thème dans `famille_id`.
select pg_temp.bleo_patcher('public.bleo_tirage(date, text)'::regprocedure, array[
$a$  select v.contenu_id, v.langue, v.valeur, v.n_post, c.famille_id, c.etat_bleo as etat,$a$,
$b$  -- 0642 : `famille_id` porte le THÈME (garde-fous, budget et fatigue au thème).
  select v.contenu_id, v.langue, v.valeur, v.n_post, coalesce(f.theme_id, c.famille_id) as famille_id, c.etat_bleo as etat,$b$,
$a$  select p.compte_id, p.contenu_id, c.famille_id, c.couverture_empreinte as couverture,$a$,
$b$  select p.compte_id, p.contenu_id, public.bleo_theme_famille(c.famille_id) as famille_id, c.couverture_empreinte as couverture,$b$,
$a$  select c.famille_id, count(*)::numeric as n
    from passages p join contenus c on c.id = p.contenu_id
   where p.date_publication_prevue between v_jour - (v_budget_jours - 1) and v_jour
     and not coalesce(p.est_rappel, false) and c.famille_id is not null
   group by c.famille_id;$a$,
$b$  select public.bleo_theme_famille(c.famille_id) as famille_id, count(*)::numeric as n
    from passages p join contenus c on c.id = p.contenu_id
   where p.date_publication_prevue between v_jour - (v_budget_jours - 1) and v_jour
     and not coalesce(p.est_rappel, false) and c.famille_id is not null
   group by 1;$b$,
$a$  select c.id as contenu_id, c.famille_id, c.created_at, c.couverture_empreinte as couverture,$a$,
$b$  select c.id as contenu_id, coalesce(f.theme_id, f.id) as famille_id, c.created_at, c.couverture_empreinte as couverture,$b$]);

-- Le rapport : les infractions « même famille » au thème, comme le tirage.
select pg_temp.bleo_patcher('public.bleo_rapport(date)'::regprocedure, array[
$a$where p.compte_id = o.compte_id and c2.famille_id = c.famille_id and p.contenu_id <> o.contenu_id$a$,
$b$where p.compte_id = o.compte_id and public.bleo_theme_famille(c2.famille_id) = public.bleo_theme_famille(c.famille_id) and p.contenu_id <> o.contenu_id$b$,
$a$               and c3.famille_id = c.famille_id) > 0 as doublon_plan$a$,
$b$               and public.bleo_theme_famille(c3.famille_id) = public.bleo_theme_famille(c.famille_id)) > 0 as doublon_plan$b$]);

-- Le guichet : une déclinaison par thème et par jour ; D30 pour les full tests.
select pg_temp.bleo_patcher('public.bleo_verifier_depot(uuid, text, uuid, text, uuid)'::regprocedure, array[
$a$  v_voisine_mots integer;$a$,
$b$  v_voisine_mots integer;
  v_theme record;$b$,
$a$    return jsonb_build_object('ok', true, 'type_bleo', 'full_test', 'generation', 0);$a$,
$b$    -- 0642, D30 : pas de full test sur un thème qui a déjà gagné (un hook voisin
    -- d'une famille du thème gagnant) : le décliner depuis la boîte, ou une autre idée.
    if p_accroche_norm is not null then
      v_mots := public.bleo_mots_accroche(p_accroche_norm);
      select f.id, t.accroche_norm as theme_accroche
        into v_theme
        from bleo_familles f
        join bleo_familles t on t.id = coalesce(f.theme_id, f.id)
       where f.label_id = p_label_id
         and coalesce(cardinality(v_mots), 0) > 0
         and f.mots && v_mots
         and public.bleo_meme_theme(v_mots, f.mots,
               coalesce(array(select jsonb_array_elements_text(reg->'themes'->'mots_faibles')), '{}'::text[]),
               coalesce((reg->'themes'->>'seuil')::numeric, 0.6),
               coalesce((reg->'themes'->>'mots_min')::int, 2)) > 0
         and exists (select 1 from bleo_familles g
                      where coalesce(g.theme_id, g.id) = coalesce(f.theme_id, f.id) and g.verdict = 'gagnante')
       order by public.bleo_proximite_accroches(v_mots, f.mots) desc, f.id
       limit 1;
      if found then
        return jsonb_build_object('ok', false, 'code', 'theme_gagnant',
          'message', format('cette accroche reprend un thème qui a déjà gagné dans le label (« %s ») : pas de full test sur ce thème ; le décliner depuis la boîte s''il y est, sinon une autre idée',
                            left(coalesce(v_theme.theme_accroche, ''), 80)),
          'famille_id', v_theme.id);
      end if;
    end if;
    return jsonb_build_object('ok', true, 'type_bleo', 'full_test', 'generation', 0);$b$,
$a$     where pc.famille_id = v_fam.id
$a$,
$b$     where public.bleo_theme_famille(pc.famille_id) = public.bleo_theme_famille(v_fam.id)
$b$,
$a$      'message', 'cette famille a déjà une déclinaison aujourd''hui : une par famille et par jour, prendre la ligne suivante de la boîte',$a$,
$b$      'message', 'ce thème (cette famille ou une famille quasi identique) a déjà une déclinaison aujourd''hui : une par thème et par jour, prendre la ligne suivante de la boîte',$b$]);

-- La valeur au jour (rapport) : fatigue d'accroche au thème.
create or replace function public.bleo_valeur_au_jour(p_contenu uuid, p_langue text, p_jour date)
returns numeric
language sql
stable
set search_path to 'public'
as $function$
  with reg as (select valeur from reglages where cle = 'bleo'),
  c as (select id, public.bleo_theme_famille(famille_id) as theme_id, created_at from contenus where id = p_contenu),
  avant as (
    select count(*) filter (where p.contenu_id = p_contenu) as n_post,
           count(*) filter (where p.contenu_id <> p_contenu) as n_accroche
      from passages p
      join contenus c2 on c2.id = p.contenu_id, reg
     where p.langue = p_langue and p.date_publication_prevue < p_jour
       and p.statut in ('assigne', 'valide_par_poster', 'publie')
       and c2.famille_id in (select f.id from bleo_familles f
                              where f.theme_id = (select theme_id from c) or f.id = (select theme_id from c))
       and p.date_publication_prevue >= p_jour - coalesce((reg.valeur->'valeur'->>'fatigue_jours')::int, 60)
       and (p.statut = 'publie'
            or p.date_publication_prevue >= p_jour - coalesce((reg.valeur->'valeur'->>'fatigue_attente_jours')::int, 3))
  )
  select v.forme
         * power((reg.valeur->'valeur'->>'fatigue_post')::numeric, avant.n_post)
         * power((reg.valeur->'valeur'->>'fatigue_accroche')::numeric, avant.n_accroche)
         * case when (select created_at from c) < p_jour::timestamp - make_interval(days => (reg.valeur->'valeur'->>'age_jours')::int)
                then (reg.valeur->'valeur'->>'age_facteur')::numeric else 1 end
    from bleo_valeurs v, reg, avant
   where v.contenu_id = p_contenu and v.langue = p_langue
$function$;

-- ---------------------------------------------------------------------------
-- 3. La boîte : une ligne par thème, budget au thème (0628 + thèmes)
-- ---------------------------------------------------------------------------
create or replace view public.bleo_boite
  with (security_invoker = true)
as
with reg as (
  select reglages.valeur from reglages where reglages.cle = 'bleo'
), fam as (
  select f_1.id, f_1.label_id, f_1.accroche_norm, f_1.racine_contenu_id, f_1.verdict, f_1.verdict_le,
         f_1.close, f_1.close_le, f_1.created_at, coalesce(f_1.theme_id, f_1.id) as theme_id
    from bleo_familles f_1
    join labels l on l.id = f_1.label_id
   where f_1.verdict = 'gagnante' and not f_1.close and l.voie = 1
), enfants as (
  select z.parent, count(*) as n
    from (select c.parent_bleo_id as parent
            from contenus c
           where c.parent_bleo_id is not null and c.statut <> 'rejete'::contenu_statut
          union all
          select pl.parent_contenu_id
            from pod_livraisons pl
           where pl.parent_contenu_id is not null and pl.statut = 'a_valider') z
   group by z.parent
), sept as (
  select public.bleo_theme_famille(c.famille_id) as theme_id, cl.label_id
    from passages p
    join contenus c on c.id = p.contenu_id
    join contenu_labels cl on cl.contenu_id = p.contenu_id
   where p.date_publication_prevue >= ((now() at time zone 'Europe/Paris')::date - 6)
     and p.date_publication_prevue <= (now() at time zone 'Europe/Paris')::date
     and not coalesce(p.est_rappel, false)
), budget as (
  select fam.id as famille_id,
         ((select count(*) from sept s where s.theme_id = fam.theme_id))::numeric
           >= greatest(((reg.valeur -> 'garde_fous') ->> 'budget_plancher')::numeric,
                       (((reg.valeur -> 'garde_fous') ->> 'budget_famille')::numeric)
                         * ((select count(*) from sept s where s.label_id = fam.label_id))::numeric) as au_budget
    from fam, reg
), g1 as (
  select fam.label_id, fam.id as famille_id, 'g1'::text as sorte, fam.racine_contenu_id as parent_contenu_id,
         coalesce((select e.n from enfants e where e.parent = fam.racine_contenu_id), 0::bigint) as faites,
         fam.verdict_le
    from fam
), g2 as (
  select fam.label_id, fam.id as famille_id, 'g2'::text as sorte, c.id as parent_contenu_id,
         coalesce((select e.n from enfants e where e.parent = c.id), 0::bigint) as faites,
         fam.verdict_le
    from fam
    join contenus c on c.famille_id = fam.id and c.generation = 1 and c.statut = 'valide'::contenu_statut
                   and c.verdict = 'gagnant'
), tout as (
  select * from g1
  union all
  select * from g2 where ((select ((reg.valeur -> 'boite') ->> 'generation_max')::integer from reg)) >= 2
), ouvertes as (
  -- Les lignes encore déclinables (quota par parent), avec ce qu'il faut pour les ranger.
  select t.*, b.au_budget, fam.theme_id,
         ((select count(*) from contenus c2 where c2.famille_id = t.famille_id and c2.generation > 0)) = 0 as jamais_declinee
    from tout t
    join budget b on b.famille_id = t.famille_id
    join fam on fam.id = t.famille_id
   where t.faites < ((select ((reg.valeur -> 'boite') ->> 'declinaisons_par_parent')::integer from reg))
), une as (
  -- 0642 : une seule ligne par THÈME : sa G2 d'abord (D35), puis le parent le moins décliné.
  select o.*,
         row_number() over (partition by o.theme_id
                            order by (o.sorte = 'g2') desc, o.faites, o.verdict_le desc nulls last, o.parent_contenu_id) as k
    from ouvertes o
)
select u.label_id,
       u.famille_id,
       coalesce(f.accroche_norm, pc.titre) as accroche,
       u.sorte,
       u.parent_contenu_id,
       u.faites,
       u.verdict_le,
       u.au_budget,
       row_number() over (partition by u.label_id
                          order by u.au_budget, (u.sorte = 'g2') desc, u.jamais_declinee desc,
                                   u.verdict_le desc nulls last, u.parent_contenu_id) as rang,
       case u.sorte when 'g1' then 'identique' else 'reformulee' end as accroche_attendue
  from une u
  join bleo_familles f on f.id = u.famille_id
  left join contenus pc on pc.id = u.parent_contenu_id
 where u.k = 1;

comment on view public.bleo_boite is
  'BLEO, boîte des podz (A9, D35, 0628, 0642) : une ligne par THÈME gagnant et ouvert de la voie 1 (sa G2 d''abord, puis le parent le moins décliné), les thèmes au budget de diffusion en fin de boîte.';

-- ---------------------------------------------------------------------------
-- 4. La page Familles : le thème de chaque famille (colonnes ajoutées à la fin)
-- ---------------------------------------------------------------------------
create or replace view public.bleo_familles_ui
  with (security_invoker = true)
as
 WITH plafond AS (
         SELECT ((reglages.valeur -> 'mesure'::text) ->> 'r_plafond'::text)::numeric AS r_max
           FROM reglages
          WHERE reglages.cle = 'bleo'::text
        ), pas AS (
         SELECT c.famille_id,
            count(*) AS n_passages,
            max(p.vues) AS vues_max,
            sum(p.vues) AS vues_total,
            percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (p.r::double precision)) AS r_median,
            max(p.publie_at) AS dernier_passage,
            avg(LEAST(p.r, ( SELECT plafond.r_max
                   FROM plafond))) FILTER (WHERE p.r IS NOT NULL) AS r_moyen
           FROM passages p
             JOIN contenus c ON c.id = p.contenu_id
          WHERE p.statut = 'publie'::passage_statut AND NOT COALESCE(p.est_rappel, false) AND c.famille_id IS NOT NULL
          GROUP BY c.famille_id
        ), con AS (
         SELECT contenus.famille_id,
            count(*) FILTER (WHERE contenus.statut <> 'rejete'::contenu_statut) AS n_contenus,
            max(contenus.generation) AS gen_max
           FROM contenus
          WHERE contenus.famille_id IS NOT NULL
          GROUP BY contenus.famille_id
        ), th AS (
         SELECT COALESCE(f2.theme_id, f2.id) AS theme_id,
            count(*) AS n_familles
           FROM bleo_familles f2
          GROUP BY (COALESCE(f2.theme_id, f2.id))
        )
 SELECT f.id,
    f.label_id,
    l.slug AS label,
    l.nom AS label_nom,
    l.voie,
    COALESCE(f.accroche_norm, rc.titre) AS accroche,
    f.racine_contenu_id,
    rc.titre AS racine_titre,
    f.verdict,
    f.verdict_le,
    f.close,
    f.close_le,
    f.created_at,
    COALESCE(con.n_contenus, 0::bigint) AS n_contenus,
    COALESCE(con.gen_max::integer, 0) AS gen_max,
    COALESCE(pas.n_passages, 0::bigint) AS n_passages,
    pas.vues_max,
    pas.vues_total,
    round(pas.r_median::numeric, 2) AS r_median,
    pas.dernier_passage,
    round(pas.r_moyen, 2) AS r_moyen,
    COALESCE(f.theme_id, f.id) AS theme_id,
    tf.accroche_norm AS theme_accroche,
    COALESCE(th.n_familles, 1::bigint) AS theme_familles
   FROM bleo_familles f
     LEFT JOIN labels l ON l.id = f.label_id
     LEFT JOIN contenus rc ON rc.id = f.racine_contenu_id
     LEFT JOIN con ON con.famille_id = f.id
     LEFT JOIN pas ON pas.famille_id = f.id
     LEFT JOIN bleo_familles tf ON tf.id = COALESCE(f.theme_id, f.id)
     LEFT JOIN th ON th.theme_id = COALESCE(f.theme_id, f.id);

-- ---------------------------------------------------------------------------
-- 5. Les thèmes des familles existantes (le 2/11 : appliqué label par label,
--    un appel par label, l'API de gestion coupant à 30 s). Tant qu'une famille
--    n'a pas de thème, elle est seule dans le sien (coalesce) : rien ne casse.
-- ---------------------------------------------------------------------------
select public.bleo_regrouper_themes(l.id) from labels l where exists (select 1 from bleo_familles f where f.label_id = l.id);
