-- 0248: `contenu_langues.slides_base` — la base de traduction, à l'abri du
-- placement publicitaire.
--
-- LE BUG. Quand un compte publie dans la langue SOURCE du slideshow,
-- `assurerDeckPourLangue` prend la ligne source telle quelle et y pose la slide
-- Sophia. Or cette même ligne sert de base de traduction à TOUTES les autres
-- langues. Résultat mesuré avant correctif :
--   * 517 lignes en langue source sur 2 609 (20 %) portaient déjà une pub ;
--   * 2 063 decks traduits ont été produits depuis une base polluée ;
--   * 23 d'entre eux ont fini avec DEUX mentions Sophia dans le même carrousel.
--
-- LE CORRECTIF. `slides_base` garde la version brute (OCR, sans Sophia). Le code
-- traduit désormais depuis `slides_base` quand elle existe, `slides` sinon.
--
-- RÉTROCOMPATIBLE : colonne nullable, `slides` reste la source de vérité de ce
-- qui est publié. Une ligne sans `slides_base` se comporte exactement comme
-- avant.

alter table public.contenu_langues
  add column if not exists slides_base jsonb;

comment on column public.contenu_langues.slides_base is
  'Deck SOURCE brut (OCR, sans placement Sophia) — base de traduction des autres langues. Null = `slides` fait foi.';

-- Backfill : on met à l'abri les lignes sources ENCORE VIERGES de tout
-- placement. Les 517 déjà polluées ne sont pas récupérables (le texte d'origine
-- de la slide remplacée est perdu) : on les laisse à null plutôt que de figer
-- la pub comme si c'était la base. Le code reporte leur `position_sophia` sur la
-- traduction, ce qui empêche la seconde pub.
update public.contenu_langues cl
set slides_base = cl.slides
from public.contenus c
where c.id = cl.contenu_id
  and c.langue_source = cl.langue
  and cl.slides_base is null
  and jsonb_array_length(coalesce(cl.slides, '[]'::jsonb)) > 0
  and not exists (
    select 1
    from jsonb_array_elements(cl.slides) s
    where coalesce((s->>'position_sophia')::boolean, false)
  );

notify pgrst, 'reload schema';
