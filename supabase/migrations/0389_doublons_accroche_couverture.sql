-- 0389 : doublons d'accroche et de couverture (décision d'Adrien du 28/10).
--
-- Un compte ne doit pas recevoir, à moins de 10 jours, deux posts qui portent
-- la même accroche (texte de la slide 1) ou la même image de couverture, même
-- quand ils viennent de deux contenus différents. Constat : 27 originaux
-- weird_alpha titrés « hobbies that will make you dangerously confident », et
-- 11 images de couverture présentes sous plusieurs `media_id`. La règle 0271
-- (`ecart_min_meme_contenu`) ne voyait que le MÊME contenu.
--
-- Comme 0271, ce n'est PAS une exclusion : le candidat en doublon part dans les
-- deux dernières bandes de tirage et reste servi si le compte n'a rien d'autre.
--
-- Ce que l'assignation compare est calculé À L'AVANCE par la fonction
-- `empreintes` (cron toutes les 10 minutes, les plus récents d'abord) :
--  - `accroche_norm` : le texte de la slide 1 dans la langue source, sans
--    casse, accents, ponctuation ni émojis ;
--  - `couverture_empreinte` : l'empreinte visuelle (dHash, 64 bits en 16
--    caractères hexadécimaux) de l'image de la slide 1, lue sur une miniature
--    de 64 px. Deux empreintes à 8 bits ou moins = la même image ;
--  - `empreintes_le` : quand c'est fait. `null` = à faire (une limite du
--    stockage est retentée au passage suivant).
-- Une empreinte absente ne change rien : la règle ne relègue que sur une
-- égalité prouvée.
--
-- Le code lit `tierlist.ecart_min_meme_accroche` (défaut 10) ; la ligne
-- ci-dessous rend le réglage visible dans Réglages > Assignation. 0 désactive.
--
-- Les colonnes sont à appliquer AVANT le déploiement : le moteur les lit. Le
-- cron, APRÈS le déploiement de la fonction `empreintes` (sinon 404 toutes les
-- 10 minutes, sans effet). Le secret n'est écrit NULLE PART : on clone la
-- commande d'un job existant, comme 0323.
--
-- Retour arrière : `select cron.unschedule('empreintes');`, régler l'écart à 0,
-- puis supprimer les colonnes.

alter table public.contenus
  add column if not exists accroche_norm text,
  add column if not exists couverture_empreinte text,
  add column if not exists empreintes_le timestamptz;

create index if not exists contenus_empreintes_a_faire_idx
  on public.contenus (statut, created_at)
  where empreintes_le is null and import_statut = 'done';

-- Un rejeu ne réécrase JAMAIS une valeur réglée à la main depuis l'interface.
update public.reglages
   set valeur = valeur || jsonb_build_object('ecart_min_meme_accroche', 10)
 where cle = 'tierlist'
   and not (valeur ? 'ecart_min_meme_accroche');

do $empreintes$
declare
  template text;
  cmd text;
begin
  select c.command into template
  from cron.job c
  where position('x-cron-secret' in c.command) > 0
    and position('functions/v1/' in c.command) > 0
  order by case when c.jobname = 'pods-auto-validation' then 0 else 1 end
  limit 1;

  if template is null then
    raise notice 'empreintes : aucun cron modèle avec secret, schedule manuelle requise';
    return;
  end if;

  begin
    perform cron.unschedule('empreintes');
  exception when others then
    null;
  end;

  cmd := regexp_replace(template, 'functions/v1/[a-z0-9-]+', 'functions/v1/empreintes', 'i');
  cmd := regexp_replace(cmd, 'body\s*:=\s*''[^'']*''::jsonb', 'body := ''{}''::jsonb', 'i');

  if position('functions/v1/empreintes' in cmd) = 0 or position('''{}''::jsonb' in cmd) = 0 then
    raise notice 'empreintes : réécriture de la commande échouée';
    return;
  end if;

  perform cron.schedule('empreintes', '3-59/10 * * * *', cmd);
end
$empreintes$;
