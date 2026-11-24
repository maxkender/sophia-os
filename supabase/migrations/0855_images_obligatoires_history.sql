-- 0855 · Le label History rejoint les labels à image d'origine obligatoire (0853).
--
-- ✅ Appliquée le 24/11/2026 (MCP), vers 21 h 30 (Paris), pendant l'import de @lhistorien2852.
--
-- Demande du 24/11 : « surveille histoire aussi, ça doit absolument marcher, pas de remplacement là aussi ».
-- Dans History (Sophia ; @thehistoryvault52, @datoshistoricos6708, @historydecoded25, @lhistorien2852), l'image
-- illustre le fait raconté : une image d'un autre post ne colle plus au texte. Comme pour art_analyse et
-- art_histoire, une slide qui ne se nettoie pas n'est jamais remplacée ni gardée brute ; après ses 4 essais, le
-- slideshow est écarté (`nettoyage_rate`).
--
-- À la date, History avait déjà 52 slides remplacées dans 44 slideshows gardés, et 3 slides brutes : non touchées
-- par cette migration (elles sont en distribution).
--
-- Retour arrière :
--   update public.reglages
--      set valeur = jsonb_set(valeur, '{images_obligatoires_labels}',
--            (valeur->'images_obligatoires_labels') - 'ab9aafde-b80b-460a-bf94-9016a59f39f4')
--    where cle = 'nettoyage';

update public.reglages
   set valeur = jsonb_set(valeur, '{images_obligatoires_labels}',
         (select jsonb_agg(distinct x)
            from jsonb_array_elements_text(coalesce(valeur->'images_obligatoires_labels', '[]'::jsonb)
                                           || '["ab9aafde-b80b-460a-bf94-9016a59f39f4"]'::jsonb) x))
 where cle = 'nettoyage';
