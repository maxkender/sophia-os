-- 0266 : comptes du pod 3 « Réactions UGC » — TikTok + Instagram, vidéos uniquement.
--
--   comptes.handle_instagram  : le @ Instagram du compte (stocké sans '@',
--                               comme handle_tiktok).
--   comptes.videos_uniquement : posé à la validation du persona (pods →
--                               deciderPersona). L'assignation slideshow de
--                               minuit saute ces comptes.
--   pod_videos.instagram_url  : le lien du Reel. La vidéo ne passe 'publie'
--                               qu'une fois les DEUX liens posés (TikTok + Reel).
-- Additive.

alter table public.comptes add column handle_instagram text;
alter table public.comptes add column videos_uniquement boolean not null default false;
comment on column public.comptes.videos_uniquement is
  'Compte du pod 3 : ne publie que les vidéos du pod (une par jour, TikTok + Instagram), jamais de slideshow.';

-- Les comptes qui ont déjà un persona validé sont des comptes du pod 3.
update public.comptes c
   set videos_uniquement = true
 where exists (
   select 1 from public.pod_personas p
    where p.compte_id = c.id and p.statut = 'valide'
 );

alter table public.pod_videos add column instagram_url text;

-- Même principe que maj_mon_handle (0116, 0200) : le poster met à jour le @
-- Instagram d'UN de ses comptes, sans ouvrir l'écriture de la table.
create function public.maj_mon_handle_instagram(nouveau text, cible uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.comptes
     set handle_instagram = nullif(trim(both from replace(nouveau, '@', '')), '')
   where poster_id = auth.uid()
     and (
       (cible is null and type_compte = 'perso')
       or id = cible
     );
end;
$$;

grant execute on function public.maj_mon_handle_instagram(text, uuid) to authenticated;
