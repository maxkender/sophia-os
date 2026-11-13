-- Podz 14 « Plony » (Sophia, 100 % podz) : le label et sa source d'images.
--
-- Demande d'Adrien du 13/11 : un podz sur le modèle de @_plony_ (TikTok,
-- espagnol, 493 k abonnés). Ce sont des phrases (amour, stoïcisme, anxiété)
-- coupées en 3 slides, sur des illustrations façon estampe japonaise. Le podz
-- écrit ses propres textes en 4 slides (la phrase sur 3, puis Sophia sur la 4e)
-- et mélange les images de @_plony_ avec des images Seedream (fal) du même style.
--
-- Les images de @_plony_ passent par l'import de l'OS, qui retire le texte et
-- les métadonnées IA. Procédure validée par la session de coordination BLEO :
--   1. le label, SANS label_applications : il n'entre dans aucun pool, rien
--      ne peut être diffusé pendant l'import (ici) ;
--   2. la source @_plony_ (sans essai), rattachée au label (ici), puis l'import par la
--      file des sources (`maj_sources_ajouter`, hors migration) ;
--   3. import fini : ses contenus passent `rejete` et la source est désactivée.
--      Les images nettoyées restent dans la banque du label (media_labels) ;
--   4. seulement après : label_applications (Sophia), la ligne pods, les comptes.
-- Ne jamais cliquer « Extraire » sur cette source : ses URL repasseraient dans
-- le pipeline et ses posts pourraient redevenir valides.

insert into public.labels (slug, nom, couleur, genre, application_id)
select 'plony', 'Plony', '#d7261e', null, a.id
  from public.applications a
 where a.slug = 'sophia'
on conflict (slug) do nothing;

-- Pas d'essai de 30 posts (0686) : on veut TOUTES ses images (environ 158
-- posts). La source naît donc « essai levé » (essai_verdict = 'tient'), comme
-- après `sources_essai_lever`. Son catalogue s'importe par tranches de 100
-- (posts_max_par_maj), les plus vus d'abord : on relance `maj_sources_ajouter`
-- une seconde fois pour le reste avant de désactiver la source.
insert into public.comptes_reference (handle_tiktok, niche, langue, essai_verdict, essai_juge_le)
select '_plony_', 'Banque d''images du podz Plony (estampes japonaises) : import seulement, jamais diffusé', 'es', 'tient', now()
 where not exists (select 1 from public.comptes_reference where handle_tiktok = '_plony_');

insert into public.compte_reference_labels (compte_reference_id, label_id)
select r.id, l.id
  from public.comptes_reference r
  join public.labels l on l.slug = 'plony'
 where r.handle_tiktok = '_plony_'
on conflict do nothing;
