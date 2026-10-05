-- 0261 : originaux traduisibles + pod 2 « Originaux weird_alpha ».
--   original : slideshow écrit par l'agent du pod (texte dans la langue source
--              + images de la banque du label). Validé, il devient un contenu
--              CLASSIQUE, traduit et placé à l'assignation, au rang B.
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-10-05 (MCP). Additive.

alter table public.pod_livraisons drop constraint pod_livraisons_type_check;
alter table public.pod_livraisons add constraint pod_livraisons_type_check
  check (type in ('nouveau', 'langues', 'original'));

insert into public.pods (slug, nom, label_id)
select 'originaux_weird_alpha', 'Originaux weird_alpha', l.id
from public.labels l
where l.slug = 'weird-alpha'
on conflict (slug) do nothing;
