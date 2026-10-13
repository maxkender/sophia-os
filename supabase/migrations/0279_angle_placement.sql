-- 0279 : angle de placement par label × application (retour de l'angle).
--
-- L'angle est une consigne libre par paire label × application
-- (`label_applications.angle`, colonne de 0256 restée en base), ajoutée au
-- prompt de placement de l'application pour les contenus de ce label. Vide =
-- prompt identique à celui d'avant. Décision du 2026-10-13 : placement
-- seulement (pas la pertinence), toutes les applications, Sophia comprise, et
-- seulement pour les prochaines préparations (voir angle_placement.ts).
--
-- Trace : un deck d'application (contenu_langue_decks) garde l'angle utilisé
-- dans `placement.angle`. Le deck Sophia vit dans contenu_langues.slides, sans
-- métadonnées : cette colonne garde l'angle qui a servi à y poser Sophia, pour
-- comparer plus tard les posts avec et sans angle. NULL = posé sans angle (ou
-- avant 0279).
--
-- Additive : colonne nullable, aucune lecture existante ne change. Le code
-- l'écrit à part, après le deck : si elle manque, seul le traçage est perdu.
-- Retour arrière : `alter table public.contenu_langues drop column angle_placement;`

alter table public.contenu_langues add column if not exists angle_placement text;

comment on column public.contenu_langues.angle_placement is
  'Angle (label_applications.angle du label du contenu × Sophia) ajouté au prompt de placement quand Sophia a été posée sur ce deck. NULL = sans angle.';

comment on column public.label_applications.angle is
  'Angle de placement : consigne libre ajoutée au prompt de placement de cette application pour les contenus du label (placement seulement, pas la pertinence). Vide = prompt de placement seul. Voir supabase/functions/_shared/angle_placement.ts.';
