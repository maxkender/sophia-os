-- 0723 : le label mentalmaxxing est relancé pour Sophia (demande d'Adrien
-- du 15/11), en test.
--
-- Fermé le 5/11 (0651) avec UnSwipe. Sur les comptes UnSwipe, ses tier lists
-- originales de 2 slides ont bien marché (« Dopamine hits », « Dopamine detox
-- moves », « Evening habits » : 5 k vues et r ≥ 5), ses carrousels non. Sophia
-- a le même angle qu'UnSwipe sur ces sujets (son bloqueur : TikTok et Instagram
-- fermés tant qu'on n'a pas lu un cours), donc le podz 6 reprend ses tier
-- lists avec l'élément Sophia à la place de l'élément UnSwipe.
--
-- Ce que fait la migration :
--   1. le label sert Sophia SEUL : `labels.application_id` et
--      `label_applications` (comme Kaja, 0647) ;
--   2. il sort de `reglages.choix_labels -> labels_fermes` (0651) ;
--   3. le podz 6 `remakes_mentalapp` repart : actif, nom « (Sophia) », en
--      anglais seul pour le test, validation automatique 5 h après le dépôt
--      (podz sûrs, 0323, comme Kaja) ;
--   4. les 62 contenus UnSwipe du label passent `rejete` : UnSwipe est
--      incrusté dans leurs images, ils ne doivent jamais aller sur un compte
--      Sophia. Le podz les relivre rendus avec l'élément Sophia.
-- Aucun compte n'est rattaché au label : le test se fait sur 3 ou 4 comptes
-- Sophia anglais (`test_pod_comptes`), donnés par la règle « démarrage d'un
-- podz » du choix de label une fois l'anglais livré, ou choisis par Adrien et
-- Max (Pilotage). Arrêt du test si le r médian reste sous 1 après une semaine.
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-11-15 (MCP) : 62 contenus UnSwipe passés `rejete`.
-- Idempotente.
--
-- Retour arrière : retirer Sophia de `label_applications`, remettre
-- l'application UnSwipe dans `labels.application_id`, rajouter l'identifiant
-- du label à `labels_fermes`, `pods.actif = false`, et repasser `valide` les
-- contenus du label rejetés le 15/11 avec `livre = true`.

-- 1. Sophia seul.
update public.labels l
   set application_id = a.id
  from public.applications a
 where l.slug = 'mentalmaxxing'
   and a.slug = 'sophia'
   and l.application_id is distinct from a.id;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'sophia'
where l.slug = 'mentalmaxxing'
on conflict (label_id, application_id) do nothing;

delete from public.label_applications la
 using public.labels l, public.applications a
 where la.label_id = l.id
   and la.application_id = a.id
   and l.slug = 'mentalmaxxing'
   and a.slug <> 'sophia';

-- 2. Rouvert au choix de label.
update public.reglages r
   set valeur = jsonb_set(
         r.valeur,
         '{labels_fermes}',
         coalesce((select jsonb_agg(x) from jsonb_array_elements(r.valeur -> 'labels_fermes') x
                    where x <> to_jsonb(l.id::text)), '[]'::jsonb)),
       updated_at = now()
  from public.labels l
 where r.cle = 'choix_labels'
   and l.slug = 'mentalmaxxing'
   and coalesce(r.valeur -> 'labels_fermes', '[]'::jsonb) ? l.id::text;

-- 3. Le podz 6 repart, en anglais.
update public.pods
   set actif = true,
       nom = 'Remakes @mentalapp (Sophia)',
       langues = array['en'],
       auto_validation = true,
       auto_validation_heures = 5
 where slug = 'remakes_mentalapp';

-- 4. Les contenus UnSwipe du label ne sont plus servis.
update public.contenus c
   set statut = 'rejete'
  from public.contenu_labels cl, public.labels l
 where cl.contenu_id = c.id
   and cl.label_id = l.id
   and l.slug = 'mentalmaxxing'
   and c.statut = 'valide'
   and c.created_at < '2026-11-15';
