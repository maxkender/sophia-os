-- 0275 : decks d'APPLICATIONS (autres que Sophia) dans une livraison de pod.
--
-- Un contenu « livre » (images finies déposées par un pod) n'avait qu'un deck
-- par langue, celui de Sophia (pod_livraisons.decks → contenu_langues.slides).
-- Le pod peut désormais fournir, par application et par langue, une variante
-- du deck où seule la slide de l'app change (les autres reprennent les images
-- Sophia). Validée, chaque variante devient une ligne `contenu_langue_decks`
-- (statut 'pret', placement.origine = 'pod') : l'assignation ne la sert QUE sur
-- les créneaux de cette application, et n'en cuit jamais pour un contenu livré.
--
-- `decks` reste indexé par langue (le front en lit les clés comme les langues
-- livrées) : les variantes d'application vivent dans une colonne à part.
--
-- Additive : colonne nullable, aucune lecture existante ne change. La fonction
-- `pods` ne lit ni n'écrit la colonne tant qu'aucun dépôt n'en porte.
-- Retour arrière : `alter table public.pod_livraisons drop column decks_applications;`
-- (les decks déjà validés restent dans contenu_langue_decks).

alter table public.pod_livraisons add column if not exists decks_applications jsonb;

comment on column public.pod_livraisons.decks_applications is
  '{ "<slug application non-Sophia>": { "<langue>": { "hashtags": "…", "slides": [ { "position", "media_id", "url", "position_sophia" } ] } } } — variantes du deck livré par application (position_sophia = slide de l''app). Validées dans contenu_langue_decks (statut pret, placement.origine = pod).';
