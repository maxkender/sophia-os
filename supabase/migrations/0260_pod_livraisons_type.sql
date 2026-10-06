-- 0260 : type de livraison des pods.
--   nouveau : un post neuf → la validation crée le contenu ;
--   langues : de nouvelles langues pour un post déjà validé → la validation
--             les ajoute au contenu existant (contenu_id renseigné au dépôt).
-- ✅ Appliquée le 2026-10-05 (MCP). Additive.

alter table public.pod_livraisons add column type text not null default 'nouveau';
alter table public.pod_livraisons add constraint pod_livraisons_type_check check (type in ('nouveau', 'langues'));
