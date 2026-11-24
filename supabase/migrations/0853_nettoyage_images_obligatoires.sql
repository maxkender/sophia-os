-- 0853 · Nettoyage : plus de remplacement au premier échec ; images obligatoires dans les labels d'art.
--
-- ⏳ À appliquer (MCP) APRÈS le déploiement de `import-contenu` (rotation des chemins, chemins_nettoyage.ts, et
-- règle des images obligatoires, images_obligatoires.ts).
--
-- 24/11 (demandes : « pour noctorya et glacis1 ça tient pas si c'est pas la bonne image » ; « passe par Fal si ça marche
-- pas sur Replicate, change de modèle ; ça sert à rien de retenter 5 fois par le même chemin »).
--
-- Avant : dès le PREMIER échec de nettoyage d'une slide (Replicate puis Fal, dans le même essai), l'import la
-- remplaçait par une image propre d'un autre post du même label. Sur 48 h : 67 slides remplacées dans 46 slideshows
-- gardés, dont 19 chez @noctorya (art_analyse) et 10 chez @glacis1 (art_histoire) ; pour un tableau commenté, la
-- remplaçante ne correspond plus au texte. Les échecs venaient surtout des filtres de sécurité (Replicate E005
-- « sensitive », Fal 422 / image noire) et de la limite de débit Replicate (429, crédit sous 10 $).
--
-- Désormais (code) :
--   * chaque essai d'une slide commence par un autre chemin : Replicate → Fal, puis Fal → effaceur (Gemini Flash
--     repère les rectangles de texte, LaMa les efface : ~0,0004 $, sans modération), puis effaceur → Replicate,
--     puis Replicate → Fal ;
--   * pas de remplacement avant le bout des 4 essais ;
--   * dans les labels de `reglages.nettoyage.images_obligatoires_labels` (et les sources de
--     `images_obligatoires_sources`), jamais de remplacement ni de slide brute : toujours sale après 4 essais, le
--     slideshow est écarté (`import_etape = 'nettoyage_rate'`).
--
-- Ici : la règle pour art_analyse et art_histoire, et la ligne du journal (0852) pour la nouvelle issue.
--
-- Retour arrière :
--   update public.reglages set valeur = valeur - 'images_obligatoires_labels' - 'images_obligatoires_sources' where cle = 'nettoyage';
--   (le journal peut garder le cas 'nettoyage_rate'.)

set lock_timeout = '5s';

-- 1. La règle (le réglage existe déjà, avec `provider_principal` : on ajoute sans écraser).
insert into public.reglages (cle, valeur)
values ('nettoyage', '{}'::jsonb)
on conflict (cle) do nothing;

update public.reglages
   set valeur = valeur || jsonb_build_object(
         'images_obligatoires_labels', jsonb_build_array(
           '10f5d6e0-4e81-4d00-9f93-ee51dfec3958',  -- art_analyse (@noctorya)
           'bb2ef808-eb9a-4acf-8560-cac9be6ff9de'   -- art_histoire (@glacis1)
         ),
         'images_obligatoires_sources', coalesce(valeur->'images_obligatoires_sources', '[]'::jsonb))
 where cle = 'nettoyage';

-- 2. Le journal (0852) : la nouvelle issue.
create or replace function public.import_journal_contenus()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_post text := public.import_journal_post(new.source_url);
  v_niveau text;
  v_etape text;
  v_message text;
begin
  -- Un échec du pipeline (il sera repris : 8 passages ratés de suite au plus).
  if new.import_statut = 'failed' and (old.import_statut is distinct from 'failed' or old.import_erreur is distinct from new.import_erreur) then
    insert into import_journal (compte_reference_id, contenu_id, post_url, niveau, etape, message)
    values (new.compte_reference_id, new.id, new.source_url, 'erreur', 'echec',
            format('%s : échec à l''étape %s (passage %s sur 8) : %s', initcap(v_post), coalesce(new.import_etape, 'lecture'),
                   greatest(new.import_tentatives, 1), coalesce(new.import_erreur, 'erreur inconnue')));
    return new;
  end if;

  if new.import_etape is not distinct from old.import_etape then
    return new;
  end if;

  case new.import_etape
    when 'ocr' then v_niveau := 'info'; v_etape := 'ocr'; v_message := 'lecture des slides (OCR)';
    when 'pertinence' then
      v_niveau := 'info'; v_etape := 'pertinence';
      v_message := case when new.pertinence_score is not null then format('pertinence notée %s/100', new.pertinence_score) else 'pertinence en cours de notation' end;
    when 'elo' then v_niveau := 'info'; v_etape := 'elo'; v_message := 'note de la langue source';
    when 'nettoyage' then v_niveau := 'info'; v_etape := 'nettoyage'; v_message := 'nettoyage des slides';
    when 'caption' then v_niveau := 'info'; v_etape := 'caption'; v_message := 'description des visuels';
    when 'done' then v_niveau := 'ok'; v_etape := 'fin'; v_message := 'gardé : validé, en stock';
    when 'rejete' then
      v_niveau := 'warn'; v_etape := 'fin';
      v_message := format('écarté à la pertinence%s%s', coalesce(' (' || new.pertinence_score || '/100)', ''), coalesce(' : ' || left(new.pertinence_raison, 160), ''));
    when 'elo_insuffisant' then v_niveau := 'warn'; v_etape := 'fin'; v_message := 'écarté : note trop basse' || coalesce(' (' || left(new.import_erreur, 160) || ')', '');
    when 'trop_court' then v_niveau := 'warn'; v_etape := 'fin'; v_message := 'écarté : trop peu de slides' || coalesce(' (' || left(new.import_erreur, 160) || ')', '');
    when 'sticker' then v_niveau := 'warn'; v_etape := 'fin'; v_message := 'écarté : ' || coalesce(left(new.import_erreur, 160), 'sticker pub');
    when 'nettoyage_rate' then v_niveau := 'warn'; v_etape := 'fin'; v_message := 'écarté : image impossible à nettoyer' || coalesce(' (' || left(new.import_erreur, 160) || ')', '');
    else
      return new;
  end case;

  insert into import_journal (compte_reference_id, contenu_id, post_url, niveau, etape, message)
  values (new.compte_reference_id, new.id, new.source_url, v_niveau, v_etape, initcap(v_post) || ' : ' || v_message);
  return new;
end;
$$;
