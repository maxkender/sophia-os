-- 0651 : le label mentalmaxxing est fermé (décision d'Adrien du 5/11).
--
-- UnSwipe est arrêté depuis le 4/11 : mentalmaxxing ne sert plus aucune
-- application (`label_applications` vide), n'a plus aucun compte, et son podz
-- (6, `remakes_mentalapp`) est arrêté (`pods.actif = false`). Il restait :
--   * ouvert au choix de label : rien ne le fermait, il n'était écarté que
--     faute d'application ;
--   * 8 livraisons du 4/11 en attente dans la file de validation, et la
--     validation automatique encore cochée pour son podz.
--
-- Ce que fait la migration :
--   1. ferme le label pour toutes les applications : `labels_fermes` de
--      `reglages.choix_labels` (la liste globale lue par
--      `choix_label_equilibre.ts`) : plus aucun compte ne le reçoit, et la nuit
--      le retirerait à un compte qui le porterait ;
--   2. décoche la validation automatique de son podz ;
--   3. rejette ses livraisons en attente, avec le motif.
-- Ses 62 contenus validés restent en base, sans compte pour les servir.
-- Idempotente.
--
-- Retour arrière : retirer l'identifiant de mentalmaxxing de
-- `reglages.choix_labels -> labels_fermes`, recocher `pods.auto_validation`,
-- et remettre les livraisons en `a_valider` (motif nul).

update public.reglages r
   set valeur = jsonb_set(
         r.valeur,
         '{labels_fermes}',
         coalesce(r.valeur -> 'labels_fermes', '[]'::jsonb) || to_jsonb(l.id::text)),
       updated_at = now()
  from public.labels l
 where r.cle = 'choix_labels'
   and l.slug = 'mentalmaxxing'
   and not (coalesce(r.valeur -> 'labels_fermes', '[]'::jsonb) ? l.id::text);

update public.pods
   set auto_validation = false
 where slug = 'remakes_mentalapp';

update public.pod_livraisons
   set statut = 'rejetee',
       motif = 'Label mentalmaxxing fermé le 5/11 : UnSwipe arrêté le 4/11, podz 6 arrêté.',
       decide_le = now()
 where pod = 'remakes_mentalapp'
   and statut = 'a_valider';
