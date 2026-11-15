-- 0652 : BLEO voit les accroches des labels 100 % podz (lot 1, décision d'Adrien du 5/11).
--
-- LE TROU. Un contenu de label 100 % podz (white_bg, Fathomly, that_girl_study,
-- Kaja) n'avait pas d'accroche : son texte est dans l'image, et la fonction
-- `empreintes` les exempte (couvertures reprises à dessein). Chaque contenu
-- formait donc sa propre famille : ni « pas la même famille avant 10 jours sur
-- un compte », ni la fatigue d'accroche dans une langue (× 0,75), ni le budget
-- de famille, ni les thèmes ne jouaient. Fathomly tourne pourtant sur 2 ou 3
-- schémas (« 10/10 Skills You Can Learn In A Day / Week / Month »), et
-- that_girl_study fait 70 % de variantes de 10 posts.
--
-- CE QUE FAIT LA MIGRATION.
--   1. L'accroche d'un contenu de label 100 % podz = son titre (le hook dans la
--      langue source, tel que le podz le dépose), normalisé par
--      `bleo_normaliser_accroche`, le miroir SQL de `normaliserAccroche`
--      (`_shared/doublons.ts`) : NFKD, accents retirés, minuscules, ı → i, tout
--      ce qui n'est ni lettre ni chiffre → espace, au moins 3 caractères.
--      Vérifié identique au TypeScript le 5/11 sur les 263 titres du stock et
--      sur des cas turcs, allemands, ligatures, fractions et japonais.
--      `empreintes_le` est posé en même temps : la fonction `empreintes` ne
--      repasse pas dessus (elle les laisserait sans accroche). Les couvertures
--      restent exemptées (pas d'empreinte de couverture).
--   2. Les familles : deux contenus d'un même label 100 % podz sont de la même
--      famille s'ils ont la même accroche, ou s'ils refont le même post du
--      compte modèle (même `source_url` avant le `?variante=`), de proche en
--      proche. La famille gardée est celle du plus ancien contenu (la racine).
--      Un contenu rattaché garde son type s'il a l'accroche de la racine
--      (génération 0, une reprise), sinon il devient une déclinaison
--      (génération 1, parent = la racine). Sa classe de départ suit le verdict
--      de la famille : `accroche_gagnante` ou `accroche_non_gagnante`, comme
--      les reprises de la voie 1 ; famille en attente : inchangée. Le verdict
--      des familles agrandies est recalculé comme la nuit (A3). Les familles
--      vidées sont supprimées. Les thèmes de ces labels sont recalculés.
--      Fonction `bleo_regrouper_podz`, relancée à chaque rattachement.
--   3. Le rattachement des nouveaux contenus (`bleo_rattacher_nouveaux`, appelé
--      par la nuit et avant le tirage de 14 h) pose d'abord ces accroches, puis
--      regroupe en fin de passage. Un livré qui reprend une accroche jugée
--      prend la classe et l'état d'une reprise (avant : toujours `livre`, à
--      juger ; aucun livré n'avait d'accroche, rien ne change pour l'existant).
--   4. L'écart « même famille » se règle par label :
--      `reglages.bleo.garde_fous.meme_famille_jours_labels` ({slug: jours}),
--      sinon `meme_famille_jours` (10). Fathomly et Kaja à 6 jours : leurs
--      comptes modèles reprennent une accroche tous les 5 à 7,5 jours (médiane),
--      et chez nous une reprise à 3 jours ou moins n'a jamais percé (0 sur 61).
--      Lu par le tirage (file valeur et tests), les remplaçants de minuit et le
--      rapport. Un écart de label au-delà de `meme_contenu_jours` (14) n'est
--      pas pris en compte : l'historique lu s'arrête là.
--
-- CE QUI NE CHANGE PAS. La voie 1 : ses contenus, ses familles, ses écarts.
-- La boîte et la jauge (toujours voie 1 seulement : lot 2). Le choix de label.
--
-- Vérifié avant application (5/11), dans une transaction annulée : tirage à
-- blanc du 7/11 avant, migration, même tirage après. Comptes sans label
-- 100 % podz : 590 créneaux, 0 différence. Comptes à label 100 % podz : 11 des
-- 32 créneaux changent, 0 créneau vide. 269 accroches posées, 42 contenus
-- rattachés (17 Fathomly, 23 that_girl_study, 1 white_bg, 1 mentalmaxxing),
-- 42 familles vidées supprimées ; thèmes : white_bg 113 familles → 91 thèmes,
-- Fathomly 39 → 30. ka-003 et ka-004 rejoignent la famille de ka-001 au
-- rattachement suivant. Remplaçants de minuit inchangés (jakob 1, clara 20,
-- zoe 0). Le rapport d'un jour passé relit ses posts avec les nouvelles
-- familles : le 4/11 compte 5 « même thème » de plus (des reprises que le plan
-- du jour ne pouvait pas voir).
--
-- Retour arrière : les blocs remplacés sont écrits au § 4 (texte `$a$`) ; les
-- remettre avec le même patcher, en échangeant ancien et nouveau ; retirer
-- `meme_famille_jours_labels` du réglage. Les familles regroupées le restent
-- (les remettre à part : une famille par contenu, puis `bleo_regrouper_themes`).

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Réglage : l'écart « même famille » par label
-- ---------------------------------------------------------------------------
update public.reglages
   set valeur = jsonb_set(valeur, '{garde_fous,meme_famille_jours_labels}', '{"fathomly": 6, "kaja": 6}'::jsonb)
 where cle = 'bleo' and not coalesce(valeur->'garde_fous' ? 'meme_famille_jours_labels', false);

-- ---------------------------------------------------------------------------
-- 2. L'accroche d'un titre
-- ---------------------------------------------------------------------------
create or replace function public.bleo_normaliser_accroche(p_texte text)
returns text
language sql
immutable
as $function$
  -- Les signes diacritiques combinants (ce que \p{M} retire côté TypeScript pour
  -- l'alphabet latin, grec et cyrillique) : U+0300-036F, U+1AB0-1AFF,
  -- U+1DC0-1DFF, U+20D0-20FF, U+FE20-FE2F, écrits avec chr() pour rester lisibles.
  select case when length(t) >= 3 then t end
    from (select btrim(regexp_replace(
                   replace(lower(regexp_replace(normalize(coalesce(p_texte, ''), NFKD),
                                                '[' || chr(768) || '-' || chr(879)
                                                    || chr(6832) || '-' || chr(6911)
                                                    || chr(7616) || '-' || chr(7679)
                                                    || chr(8400) || '-' || chr(8447)
                                                    || chr(65056) || '-' || chr(65071) || ']',
                                                '', 'g')),
                           chr(305), 'i'),
                   '[^[:alnum:]]+', ' ', 'g')) as t) x
$function$;

comment on function public.bleo_normaliser_accroche(text) is
  'BLEO (0652) : miroir SQL de normaliserAccroche (_shared/doublons.ts) : NFKD, accents retirés, minuscules, ı → i, hors lettres et chiffres → espace ; null sous 3 caractères. Les deux doivent rester identiques.';

-- Pose l'accroche (depuis le titre) des contenus valides des labels 100 % podz qui n'en ont pas.
create or replace function public.bleo_accroches_podz()
returns integer
language plpgsql
set search_path to 'public'
as $function$
declare
  k integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'bleo : réservé aux admins' using errcode = '42501';
  end if;
  with cibles as (
    select distinct x.contenu_id
      from contenu_labels x
     where x.label_id in (select label_id from labels_100_podz)
  )
  update contenus c
     set accroche_norm = public.bleo_normaliser_accroche(c.titre),
         -- `empreintes` ne repasse pas dessus (elle les exempte, et poserait une accroche nulle).
         empreintes_le = coalesce(c.empreintes_le, now())
    from cibles
   where c.id = cibles.contenu_id
     and c.statut = 'valide' and c.accroche_norm is null
     and public.bleo_normaliser_accroche(c.titre) is not null;
  get diagnostics k = row_count;
  return k;
end;
$function$;

comment on function public.bleo_accroches_podz() is
  'BLEO (0652) : accroche des contenus valides des labels 100 % podz = leur titre normalisé (bleo_normaliser_accroche). Appelée par bleo_regrouper_podz et bleo_rattacher_nouveaux.';

-- ---------------------------------------------------------------------------
-- 3. Les familles des labels 100 % podz
-- ---------------------------------------------------------------------------
create or replace function public.bleo_regrouper_podz(p_themes boolean default true)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  reg jsonb;
  v_maturite interval;
  v_seuil_vues numeric;
  v_seuil_r numeric;
  v_min integer;
  v_accroches integer;
  v_deplaces integer := 0;
  v_verdicts integer := 0;
  v_supprimees integer := 0;
  v_accroches_familles integer := 0;
  v_themes jsonb := '[]'::jsonb;
  lab record;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'bleo : réservé aux admins' using errcode = '42501';
  end if;
  select valeur into reg from reglages where cle = 'bleo';
  v_maturite := make_interval(hours => (reg->'mesure'->>'maturite_heures')::int);
  v_seuil_vues := (reg->'verdict'->>'vues')::numeric;
  v_seuil_r := (reg->'verdict'->>'r')::numeric;
  v_min := (reg->'verdict'->>'passages_min_non_gagnant')::int;

  v_accroches := public.bleo_accroches_podz();

  -- Les contenus valides des labels 100 % podz qui ont une famille.
  drop table if exists pg_temp.rp_noeuds;
  create temp table rp_noeuds on commit drop as
  select distinct on (c.id) c.id, x.label_id, c.accroche_norm as a,
         nullif(split_part(coalesce(c.source_url, ''), '?', 1), '') as s,
         c.created_at, c.famille_id
    from contenus c
    join contenu_labels x on x.contenu_id = c.id
   where x.label_id in (select label_id from labels_100_podz)
     and c.statut = 'valide' and c.famille_id is not null
   order by c.id, x.label_id;

  -- De proche en proche : même accroche, ou même post du compte modèle. La racine
  -- d'un groupe est son contenu le plus ancien.
  drop table if exists pg_temp.rp_comp;
  create temp table rp_comp on commit drop as
  with recursive e as (
    select a.id as x, b.id as y
      from rp_noeuds a
      join rp_noeuds b on b.label_id = a.label_id and b.id <> a.id and (b.a = a.a or b.s = a.s)
  ),
  atteint(id, autre) as (
    select id, id from rp_noeuds
    union
    select e.y, t1.autre from atteint t1 join e on e.x = t1.id
  )
  select t1.id,
         (select n2.id from atteint t2 join rp_noeuds n2 on n2.id = t2.autre
           where t2.id = t1.id order by n2.created_at, n2.id limit 1) as racine
    from atteint t1
   group by t1.id;

  drop table if exists pg_temp.rp_moves;
  create temp table rp_moves on commit drop as
  select n.id, n.famille_id as ancienne, rn.famille_id as gardee, cp.racine,
         (n.a is not distinct from rn.a) as meme_accroche
    from rp_comp cp
    join rp_noeuds n on n.id = cp.id
    join rp_noeuds rn on rn.id = cp.racine
   where n.famille_id is distinct from rn.famille_id;

  update contenus c
     set famille_id = m.gardee,
         generation = case when m.meme_accroche then 0 else 1 end,
         parent_bleo_id = case when m.meme_accroche then null else m.racine end,
         type_bleo = case when m.meme_accroche then c.type_bleo else 'declinaison' end
    from rp_moves m
   where c.id = m.id;
  get diagnostics v_deplaces = row_count;

  -- Le verdict des familles agrandies, comme la nuit (A3).
  with mes as (
    select c.famille_id, p.vues, p.r
      from passages p
      join contenus c on c.id = p.contenu_id
     where c.famille_id in (select gardee from rp_moves)
       and p.statut = 'publie' and not coalesce(p.est_rappel, false) and p.vues is not null
       and p.publie_at <= now() - v_maturite
  ),
  v as (
    select famille_id,
           bool_or(vues >= v_seuil_vues or coalesce(r, 0) >= v_seuil_r) as gagne,
           count(r) as n_r
      from mes group by famille_id
  )
  update bleo_familles f
     set verdict = case when v.gagne then 'gagnante'
                        when v.n_r >= v_min then 'non_gagnante'
                        else 'en_attente' end,
         verdict_le = case when v.gagne then now() else f.verdict_le end
    from v
   where v.famille_id = f.id and f.verdict <> 'gagnante'
     and f.verdict <> case when v.gagne then 'gagnante'
                           when v.n_r >= v_min then 'non_gagnante'
                           else 'en_attente' end;
  get diagnostics v_verdicts = row_count;

  -- La classe de départ d'un contenu rattaché suit le verdict de sa famille (comme une reprise).
  update contenus c
     set classe_defaut = case f.verdict when 'gagnante' then 'accroche_gagnante' else 'accroche_non_gagnante' end
    from rp_moves m
    join bleo_familles f on f.id = m.gardee
   where c.id = m.id and f.verdict in ('gagnante', 'non_gagnante');

  delete from bleo_familles f
   where f.id in (select ancienne from rp_moves where ancienne is not null)
     and not exists (select 1 from contenus c where c.famille_id = f.id);
  get diagnostics v_supprimees = row_count;

  -- L'accroche des familles : celle de leur racine (une famille par accroche et par label).
  with cand as (
    select distinct on (f.label_id, c.accroche_norm) f.id, c.accroche_norm
      from bleo_familles f
      join contenus c on c.id = f.racine_contenu_id and c.famille_id = f.id
     where f.accroche_norm is null and c.accroche_norm is not null
       and f.label_id in (select label_id from labels_100_podz)
       and not exists (select 1 from bleo_familles f2
                        where f2.label_id = f.label_id and f2.accroche_norm = c.accroche_norm)
     order by f.label_id, c.accroche_norm, f.created_at, f.id
  )
  update bleo_familles f
     set accroche_norm = cand.accroche_norm
    from cand
   where f.id = cand.id;
  get diagnostics v_accroches_familles = row_count;

  if p_themes then
    for lab in select distinct label_id from labels_100_podz loop
      v_themes := v_themes || public.bleo_regrouper_themes(lab.label_id);
    end loop;
  end if;

  return jsonb_build_object(
    'accroches', v_accroches,
    'deplaces', v_deplaces,
    'verdicts', v_verdicts,
    'familles_supprimees', v_supprimees,
    'accroches_familles', v_accroches_familles,
    'themes', v_themes);
end;
$function$;

comment on function public.bleo_regrouper_podz(boolean) is
  'BLEO (0652) : familles des labels 100 % podz. Même accroche (le titre normalisé) ou même post du compte modèle (source_url avant ?variante=), de proche en proche ; famille gardée = celle du contenu le plus ancien ; classe des rattachés selon le verdict ; familles vidées supprimées ; p_themes : recalcule les thèmes de ces labels.';

do $droits$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('bleo_normaliser_accroche', 'bleo_accroches_podz', 'bleo_regrouper_podz')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end;
$droits$;

-- ---------------------------------------------------------------------------
-- 4. Patchs en place (blocs exacts : la migration échoue sans rien changer
--    si un bloc n'est pas trouvé exactement une fois)
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
      raise exception '0652 : % : bloc % trouvé % fois (attendu 1), rien n''est changé', p_fn, i, n;
    end if;
    d := replace(d, p_paires[2 * i - 1], p_paires[2 * i]);
  end loop;
  execute d;
end;
$function$;

-- 4a. Le rattachement : accroches d'abord, reprises de livrés comme les autres, regroupement à la fin.
select pg_temp.bleo_patcher('public.bleo_rattacher_nouveaux()'::regprocedure, array[
$a$  end if;
  update contenus c
     set famille_id = p.famille_id,$a$,
$b$  end if;
  -- 0652 : l'accroche des contenus des labels 100 % podz (leur titre), avant tout rattachement.
  perform public.bleo_accroches_podz();

  update contenus c
     set famille_id = p.famille_id,$b$,
$a$         classe_defaut = case when m.est_livre then 'livre'
                              when f.verdict = 'gagnante' then 'accroche_gagnante'
                              when f.verdict = 'non_gagnante' then 'accroche_non_gagnante'
                              else 'import' end,
         etat_bleo = case when not m.est_livre and f.verdict <> 'en_attente' then 'juge' else 'a_juger' end,
         juge_le = case when not m.est_livre and f.verdict <> 'en_attente' then now() end,$a$,
$b$         -- 0652 : un livré qui reprend une accroche jugée est une reprise comme une autre.
         classe_defaut = case when f.verdict = 'gagnante' then 'accroche_gagnante'
                              when f.verdict = 'non_gagnante' then 'accroche_non_gagnante'
                              when m.est_livre then 'livre'
                              else 'import' end,
         etat_bleo = case when f.verdict <> 'en_attente' then 'juge' else 'a_juger' end,
         juge_le = case when f.verdict <> 'en_attente' then now() end,$b$,
$a$  return n;
end;$a$,
$b$  -- 0652 : les variantes d'un même post du compte modèle rejoignent la famille de son remake.
  perform public.bleo_regrouper_podz(false);

  return n;
end;$b$
]);

-- 4b. Le tirage : l'écart « même famille » du label.
select pg_temp.bleo_patcher('public.bleo_tirage(date, text)'::regprocedure, array[
$a$ as label_id
    from bleo_valeurs v$a$,
$b$ as label_id,
         -- 0652 : l'écart « même famille » du label (garde_fous.meme_famille_jours_labels), sinon le global.
         coalesce((select (reg->'garde_fous'->'meme_famille_jours_labels'->>l.slug)::int
                     from contenu_labels cl join labels l on l.id = cl.label_id
                    where cl.contenu_id = c.id order by cl.label_id::text limit 1), v_j_famille) as j_famille
    from bleo_valeurs v$b$,
$a$abs(h.jour - v_jour) < v_j_famille))$a$,
$b$abs(h.jour - v_jour) < v.j_famille))$b$,
$a$abs(h.jour - v_jour) < v_j_famille)$a$,
$b$abs(h.jour - v_jour) < coalesce((select (reg->'garde_fous'->'meme_famille_jours_labels'->>l.slug)::int
                                                                from labels l where l.id = rt.label_id), v_j_famille))$b$
]);

-- 4c. Les remplaçants de minuit : le même écart.
select pg_temp.bleo_patcher('public.bleo_remplacants(uuid, date, uuid, uuid[], integer)'::regprocedure, array[
$a$abs(h.jour - p_jour) < v_j_famille) as v_theme$a$,
$b$abs(h.jour - p_jour) < coalesce((select (reg->'garde_fous'->'meme_famille_jours_labels'->>l.slug)::int
                                                                                   from labels l where l.id = cand.label_id), v_j_famille)) as v_theme$b$
]);

-- 4d. Le rapport : une reprise à 6 jours chez Fathomly n'est pas une infraction.
select pg_temp.bleo_patcher('public.bleo_rapport(date)'::regprocedure, array[
$a$and h.jour > v_jour - v_j_theme)) as meme_theme$a$,
$b$and h.jour > v_jour - coalesce((select (reg->'garde_fous'->'meme_famille_jours_labels'->>l.slug)::int
                                                  from contenu_labels cl join labels l on l.id = cl.label_id
                                                 where cl.contenu_id = r.contenu_id order by cl.label_id::text limit 1),
                                                v_j_theme))) as meme_theme$b$
]);

-- ---------------------------------------------------------------------------
-- 5. Le stock actuel : accroches, familles, thèmes
-- ---------------------------------------------------------------------------
select public.bleo_regrouper_podz(true);
