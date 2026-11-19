-- 19/11 : la niche du warm-up suit le label du compte.
--
-- Deux textes aux posteurs disaient en dur « the general knowledge niche »,
-- la niche de Sophia, même à un compte micabo (études) ou Atala (running) :
-- la bienvenue Upwork (`accueil_message_texte`) et les nudges de la page
-- Onboarding posters (`onboarding_nudges`, s'ils ont été enregistrés à
-- l'écran). La phrase devient « the {niche} niche » : {niche} est remplie
-- d'après le label du compte (`nicheDuPosteur`, `composerNudge`), avec
-- « general knowledge » pour un label sans thème à lui.
--
-- À PASSER APRÈS LE MERGE, une fois les fonctions et le site déployés : le
-- code d'avant ne connaît pas {niche} et l'enverrait telle quelle au posteur
-- (« une variable inconnue reste telle quelle »). Dans l'autre sens rien ne
-- casse : tant que cette migration n'est pas passée, les deux textes disent
-- « general knowledge » comme avant.
--
-- Rejouable : une fois la phrase remplacée, plus rien ne correspond.

update public.reglages
   set valeur = to_jsonb(replace(valeur #>> '{}', 'the general knowledge niche', 'the {niche} niche')),
       updated_at = now()
 where cle = 'accueil_message_texte'
   and jsonb_typeof(valeur) = 'string'
   and valeur #>> '{}' like '%the general knowledge niche%';

-- Les nudges : un objet { slack, connexion, tiktok, warmup, pret }, un texte
-- par situation. Absent (jamais enregistré à l'écran) : les textes par défaut
-- du code s'appliquent, déjà en {niche}.
update public.reglages r
   set valeur = (
         select jsonb_object_agg(
                  e.key,
                  case when jsonb_typeof(e.value) = 'string'
                       then to_jsonb(replace(e.value #>> '{}', 'the general knowledge niche', 'the {niche} niche'))
                       else e.value
                  end)
           from jsonb_each(r.valeur) e),
       updated_at = now()
 where r.cle = 'onboarding_nudges'
   and jsonb_typeof(r.valeur) = 'object'
   and r.valeur::text like '%the general knowledge niche%';
