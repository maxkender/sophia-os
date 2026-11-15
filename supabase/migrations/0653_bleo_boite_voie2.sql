-- 0653 : BLEO, la boîte et la jauge pour les labels 100 % podz de remakes (lot 2,
-- décision d'Adrien du 5/11).
--
-- Depuis 0652, les remakes (white_bg, Fathomly, that_girl_study, Kaja) ont des
-- familles d'accroche jugées comme celles de la voie 1. Leurs podz font déjà des
-- variantes (des déclinaisons) et des accroches neuves (des full tests) sans que
-- BLEO le sache. Désormais, comme la voie 1 :
--   * la boîte (`bleo_boite`) liste aussi leurs familles gagnantes à décliner ;
--   * la jauge (`bleo_jauge`) les mesure : leur rythme se compte sur leurs
--     livraisons (`nouveau`) comme celui de la voie 1 sur ses originaux ;
--   * le guichet juge un remake qui déclare `type_bleo` (code dans
--     `pods/index.ts`, même PR) ; un remake sans déclaration reste un remake.
-- Et pour que le guichet voie leurs accroches : la vérification « accroche
-- voisine du jour » lit le titre d'une livraison dont la première slide n'a pas
-- de texte (un livré : le texte est dans l'image). La boîte donne aussi
-- l'identifiant du podz du post parent (`source_id`), pour retrouver ses
-- fichiers (« fa-012 »).
--
-- La voie 1 ne change pas : sa boîte et sa jauge rendent les mêmes lignes
-- (vérifié avant application, dans une transaction annulée).
--
-- Retour arrière : remettre dans `bleo_boite` et `bleo_jauge` l'exclusion de la
-- voie 2 (`not (l.id in (select label_id from labels_100_podz where voie = 2))`)
-- et `type = 'original'` dans la jauge ; les deux autres changements sont sans
-- effet sur la voie 1.

set lock_timeout = '5s';

-- Remplacement d'un motif (expression régulière) trouvé exactement une fois
-- dans une vue ; la migration échoue sans rien changer sinon.
create or replace function pg_temp.bleo_patcher_vue(p_vue regclass, p_motifs text[])
returns void
language plpgsql
as $function$
declare
  d text;
  i integer;
  n integer;
begin
  d := pg_get_viewdef(p_vue);
  for i in 1 .. array_length(p_motifs, 1) / 2 loop
    select count(*) into n from regexp_matches(d, p_motifs[2 * i - 1], 'g');
    if n <> 1 then
      raise exception '0653 : % : motif % trouvé % fois (attendu 1), rien n''est changé', p_vue, i, n;
    end if;
    d := regexp_replace(d, p_motifs[2 * i - 1], p_motifs[2 * i]);
  end loop;
  execute format('create or replace view %s with (security_invoker = true) as %s', p_vue, d);
end;
$function$;

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
      raise exception '0653 : % : bloc % trouvé % fois (attendu 1), rien n''est changé', p_fn, i, n;
    end if;
    d := replace(d, p_paires[2 * i - 1], p_paires[2 * i]);
  end loop;
  execute d;
end;
$function$;

-- 1. La boîte : les familles gagnantes de tous les labels.
select pg_temp.bleo_patcher_vue('public.bleo_boite'::regclass, array[
  '\s+AND \(NOT \(l\.id IN \( SELECT v\.label_id\s+FROM labels_100_podz v\s+WHERE \(v\.voie = 2\)\)\)\)', ''
]);

-- 2. La jauge : tous les podz actifs ; le rythme compte les originaux et les livrés.
select pg_temp.bleo_patcher_vue('public.bleo_jauge'::regclass, array[
  '\s+AND \(NOT \(lab\.id IN \( SELECT v\.label_id\s+FROM labels_100_podz v\s+WHERE \(v\.voie = 2\)\)\)\)', '',
  '\(pod_livraisons\.type = ''original''::text\)', '(pod_livraisons.type = ANY (ARRAY[''original''::text, ''nouveau''::text]))'
]);

comment on view public.bleo_jauge is
  'BLEO (A10) : semaines de boîte (familles en boîte ÷ (livraisons par jour × 7 ÷ 3)) et part de full test de chaque podz actif, voie 1 et voie 2 (0653 : rythme mesuré sur les originaux et les livrés).';

-- 3. La boîte des podz : l'identifiant du post parent chez son podz.
select pg_temp.bleo_patcher('public.bleo_boite_posts(uuid, integer)'::regprocedure, array[
$a$'generation', c.generation, 'source_url', c.source_url)$a$,
$b$'generation', c.generation, 'source_url', c.source_url,
                                           -- 0653 : l'identifiant du podz (fa-012, am-o051…), pour retrouver ses fichiers.
                                           'source_id', (select pl.source_id from pod_livraisons pl
                                                          where pl.contenu_id = c.id and pl.type in ('nouveau', 'original')
                                                          order by pl.created_at limit 1))$b$
]);

-- 4. Le guichet : l'accroche d'une livraison du jour sans texte de slide (un livré) est son titre.
select pg_temp.bleo_patcher('public.bleo_verifier_depot(uuid, text, uuid, text, uuid)'::regprocedure, array[
$a$        select s->>'texte_overlay' as accroche$a$,
$b$        -- 0653 : un livré n'a pas de texte de slide (il est dans l'image) : son titre.
        select coalesce(nullif(btrim(s->>'texte_overlay'), ''), pl.titre) as accroche$b$
]);
