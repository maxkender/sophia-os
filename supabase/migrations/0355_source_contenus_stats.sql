-- 0355 : slideshows importés par source, pour « Mettre à jour les sources ».
--
-- Le panneau affichait à côté de chaque source le « stock » de la page
-- Sources, qui compte les SUJETS reproductibles (`sujets` préparés, retenus
-- ou utilisés). Rien à voir avec ce que l'import ramène : @b3tteryou y
-- montrait « 0 en stock » alors que ses 53 slideshows étaient importés
-- (45 validés, 8 rejetés), et la mise à jour disait à juste titre « 53 déjà
-- en stock ». Le panneau lit maintenant cette vue : les contenus de chaque
-- source, tous statuts, et parmi eux les validés prêts.
--
-- security_invoker : la vue lit `contenus` avec les droits de l'appelant.
--
-- Retour arrière : drop view public.source_contenus_stats.

create or replace view public.source_contenus_stats
  with (security_invoker = true)
as
  select c.compte_reference_id,
         count(*) as importes,
         count(*) filter (where c.statut = 'valide'::contenu_statut and c.import_statut = 'done') as valides
    from public.contenus c
   where c.compte_reference_id is not null
   group by c.compte_reference_id;

grant select on public.source_contenus_stats to authenticated;

comment on view public.source_contenus_stats is
  'Slideshows importés par compte source (tous statuts) et validés prêts. Panneau « Mettre à jour les sources ». Voir 0355.';
