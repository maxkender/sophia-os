-- 0278 : @supermaxing est un compte source FRANÇAIS déclaré `en`.
--
-- LE PROBLÈME. `comptes_reference.langue = 'en'` pour @supermaxing (label
-- alpha_male_yellow), alors que ses slideshows sont en français. Ses
-- 197 contenus (126 valides, 71 rejetés) sont donc nés avec
-- `langue_source = 'en'`, et leur ligne `contenu_langues` « en » porte le
-- texte OCR… français. Conséquence dans `assurerDeckPourLangue` : un compte
-- anglais tombe dans la branche « langue du compte = langue source », donc
-- AUCUNE traduction. Il reçoit le texte français tel quel, plus une slide
-- Sophia placée en anglais (`3cb235a5` : 5 slides en français, 1 en anglais).
-- Exemple publié : `91ad57c2` sur ethan.mindset5052, 25 vues.
-- Les autres langues, traduites depuis cette base française, sont correctes.
--
-- POURQUOI ON NE PEUT PAS SEULEMENT CHANGER `langue_source`. Le moteur lit la
-- base de traduction dans la ligne de la langue source. Les lignes « fr » de
-- ces contenus sont absentes (115) ou vides (70 sur 82) : passer
-- `langue_source` à 'fr' sans les remplir ferait échouer toute nouvelle
-- traduction (« Deck langue source vide »), et `import-contenu` (backfill)
-- remettrait ces contenus en file d'import, donc hors du pool.
--
-- CE QUE FAIT LA MIGRATION, dans une seule transaction :
--   1. Base propre = `slides_base` de la ligne « en » (le texte OCR sauvegardé
--      avant toute pub, présent sur 125 des 126 valides), sinon ses `slides`
--      si elles ne portent pas de pub.
--   2. Ligne « fr » : `slides_base` = base propre. Si elle n'a pas de texte,
--      `slides` = base propre aussi (un compte français postera le texte
--      d'origine, avec Sophia placée à la prochaine assignation). Une ligne
--      « fr » déjà cuite (12, texte français + Sophia) garde ses `slides`.
--      Ligne « fr » absente : créée avec la base propre.
--   3. `contenus.langue_source = 'fr'` (valides ET rejetés, pour un réimport juste).
--   4. Ligne « en » remise à vide (`slides = []`, `slides_base` et `hashtags`
--      à null) : le prochain compte anglais déclenche une vraie traduction
--      (prompt `traduction_en`) puis le placement.
--   5. `comptes_reference.langue = 'fr'` : les prochains imports naissent justes.
--
-- LE CAS `3cb235a5`. Sa ligne « en » porte déjà une pub et aucune base
-- sauvegardée : le texte d'origine de la slide remplacée est perdu. Sa ligne
-- « fr » est un deck français cuit et correct : elle devient la source telle
-- quelle (base « polluée », cas que le moteur gère déjà : la slide Sophia est
-- traduite avec le reste, aucun second placement).
--
-- CE QU'ON NE TOUCHE PAS :
--   * les passages DÉJÀ PUBLIÉS (1 en anglais) : leur texte est en ligne sur
--     TikTok, le réécrire désynchroniserait l'enregistrement de la réalité ;
--   * le passage anglais « assigné » du 19/09 (`1fc31ac9`) : jamais publié,
--     déjà rendu au pool par le moteur ;
--   * les decks des autres langues (cs, de, es…) : traduits depuis le texte
--     français, ils sont corrects ;
--   * le rang des contenus (`tier`) : il ne dépend pas de la langue source.
--
-- IDEMPOTENTE : rejouée, elle ne trouve plus de contenu @supermaxing en `en`
-- et ne fait rien.

do $$
declare
  id_source  constant uuid := '67bb952d-67a2-43a7-b218-4f2cd3392ca7';
  cibles     uuid[];
  n_fr_maj   int;
  n_fr_crees int;
  n_contenus int;
  n_en_vides int;
  n_sans_fr  int;
  n_en_reste int;
begin
  if not exists (select 1 from public.comptes_reference where id = id_source and handle_tiktok = 'supermaxing') then
    raise exception '0278 : compte source @supermaxing introuvable — annulé.';
  end if;

  -- Les contenus concernés, figés avant toute écriture.
  select coalesce(array_agg(id), '{}') into cibles
  from public.contenus
  where compte_reference_id = id_source and langue_source = 'en';

  if cardinality(cibles) = 0 then
    update public.comptes_reference set langue = 'fr' where id = id_source and langue <> 'fr';
    raise notice '0278 : aucun contenu @supermaxing en `en` — rien à faire.';
    return;
  end if;

  -- Base propre par contenu (ligne « en »), seulement pour les contenus qui
  -- ont une ligne « en » avec du texte.
  create temporary table t_0278_base on commit drop as
  select en.contenu_id,
         case
           when coalesce(jsonb_array_length(en.slides_base), 0) > 0 then en.slides_base
           when coalesce(jsonb_array_length(en.slides), 0) > 0
                and not exists (select 1 from jsonb_array_elements(en.slides) s
                                 where coalesce((s->>'position_sophia')::boolean, false))
             then en.slides
         end as base
  from public.contenu_langues en
  where en.contenu_id = any(cibles) and en.langue = 'en'
    and exists (select 1 from jsonb_array_elements(coalesce(en.slides, '[]'::jsonb)) s
                 where coalesce(s->>'texte_overlay', '') <> '');

  -- 2a) Lignes « fr » existantes.
  update public.contenu_langues fr
  set slides_base = coalesce(b.base, fr.slides_base),
      slides = case
                 when b.base is not null
                      and not exists (select 1 from jsonb_array_elements(coalesce(fr.slides, '[]'::jsonb)) s
                                       where coalesce(s->>'texte_overlay', '') <> '')
                   then b.base
                 else fr.slides
               end
  from t_0278_base b
  where fr.contenu_id = b.contenu_id and fr.langue = 'fr';
  get diagnostics n_fr_maj = row_count;

  -- 2b) Lignes « fr » absentes.
  insert into public.contenu_langues (contenu_id, langue, slides, slides_base, nb_passages)
  select b.contenu_id, 'fr', b.base, b.base, 0
  from t_0278_base b
  where b.base is not null
  on conflict (contenu_id, langue) do nothing;
  get diagnostics n_fr_crees = row_count;

  -- Garde-fou avant de basculer : chaque contenu qui avait un deck « en »
  -- doit maintenant avoir une ligne « fr » avec du texte.
  select count(*) into n_sans_fr
  from t_0278_base b
  where not exists (
    select 1 from public.contenu_langues fr
    where fr.contenu_id = b.contenu_id and fr.langue = 'fr'
      and exists (select 1 from jsonb_array_elements(coalesce(fr.slides, '[]'::jsonb)) s
                   where coalesce(s->>'texte_overlay', '') <> ''));
  if n_sans_fr > 0 then
    raise exception '0278 : % contenu(s) sans deck français après copie — annulé.', n_sans_fr;
  end if;

  -- 3) Langue source.
  update public.contenus set langue_source = 'fr' where id = any(cibles);
  get diagnostics n_contenus = row_count;

  -- 4) Ligne « en » remise à vide : la prochaine assignation anglaise traduira.
  update public.contenu_langues
  set slides = '[]'::jsonb, slides_base = null, hashtags = null
  where contenu_id in (select contenu_id from t_0278_base) and langue = 'en';
  get diagnostics n_en_vides = row_count;

  -- 5) Compte source.
  update public.comptes_reference set langue = 'fr' where id = id_source;

  -- Garde-fou final : plus aucun deck « en » de ces contenus ne garde du texte.
  select count(*) into n_en_reste
  from public.contenu_langues en
  where en.contenu_id = any(cibles) and en.langue = 'en'
    and exists (select 1 from jsonb_array_elements(coalesce(en.slides, '[]'::jsonb)) s
                 where coalesce(s->>'texte_overlay', '') <> '');
  if n_en_reste > 0 then
    raise exception '0278 : % deck(s) « en » encore rempli(s) — annulé.', n_en_reste;
  end if;

  raise notice '0278 : % contenu(s) passés en fr — % ligne(s) fr mises à jour, % créée(s), % deck(s) en remis à vide.',
    n_contenus, n_fr_maj, n_fr_crees, n_en_vides;
end $$;
