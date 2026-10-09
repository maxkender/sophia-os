-- 0269 : la vidéo TikTok de référence sur chaque vidéo du pod 3.
--
-- pod_videos.source_url : le TikTok d'origine dont la réaction est reprise. Le
-- créateur le voit sur sa carte « Vidéos à poster » pour caler le rythme, le
-- texte et la musique sur la référence. Copié depuis la livraison à la
-- validation. Additive.

alter table public.pod_videos add column source_url text;
