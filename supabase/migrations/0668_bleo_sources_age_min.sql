-- 0668 : BLEO, la mise à jour des sources n'importe pas un slideshow source de
-- moins de 7 jours, et ses seuils sont dans les réglages (10/11).
--
-- 1. Premier lot du 10/11 (0667) : 14 slideshows enfilés, 1 validé, 10 rejetés.
--    Sept rejets sont justes (posts de 13 à 16 jours restés sous 7 500 vues chez
--    la source). Mais trois posts avaient moins de 1,2 jour : le score d'import
--    les a jugés sur des vues pas encore faites (702 à 7 291), et une URL connue
--    n'est jamais reprise, même rejetée. Ils étaient perdus pour toujours.
--    Désormais (`listerUrlsCompteReference`, option `ageMinJours`, passée par
--    `tickMajSources`) : un slideshow publié depuis moins de `age_min_jours` (7)
--    reste manquant et part à la mise à jour suivante. Âge lu sur le
--    `createTime` du listing, sinon sur l'identifiant TikTok. 0 : désactivé.
-- 2. `reglages.bleo.sources` existait déjà (spec : `toujours`, `min_posts`) :
--    0667 ne l'a pas complété, ses seuils tournaient sur les valeurs par défaut
--    du code. Les clés manquantes sont ajoutées (les valeurs déjà là restent), et
--    `bleo_lundi_sources` lit `min_posts`, le nom de la spec.
--
-- Retour arrière : `age_min_jours` à 0 ; la fonction lit `posts_min` (défaut 5).

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
      raise exception '0668 : % : bloc % trouvé % fois (attendu 1), rien n''est changé', p_fn, i, n;
    end if;
    d := replace(d, p_paires[2 * i - 1], p_paires[2 * i]);
  end loop;
  execute d;
end;
$function$;

update public.reglages
   set valeur = jsonb_set(valeur, '{sources}',
         jsonb_build_object('min_posts', 5, 'r_min', 1, 'r_vs_label_min', 1, 'vues_coup', 100000,
                            'lot_max', 6, 'age_min_jours', 7, 'toujours', '[]'::jsonb)
         || coalesce(valeur->'sources', '{}'::jsonb), true)
 where cle = 'bleo';

select pg_temp.bleo_patcher('public.bleo_lundi_sources(boolean)'::regprocedure, array[
$a$  v_posts_min := coalesce((reg->>'posts_min')::integer, 5);$a$,
$b$  v_posts_min := coalesce((coalesce(reg->>'min_posts', reg->>'posts_min'))::integer, 5);$b$
]);
