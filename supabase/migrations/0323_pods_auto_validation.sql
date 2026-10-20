-- 0323 : validation automatique des podz sûrs.
--
-- Un podz marqué sûr (`pods.auto_validation`, éteint par défaut, l'admin
-- l'allume dans Pilotage → Pods) voit chaque livraison encore en attente
-- `auto_validation_heures` après son dépôt (12 h par défaut) validée au rang B,
-- exactement comme le bouton « Tout valider en B ». L'admin garde la main
-- jusque-là : rejeter ou valider à la main. Les vidéos (pod 3) ne sont jamais
-- validées automatiquement.
--
-- `depose_le` : l'heure du DERNIER dépôt. `created_at` ne convient pas : un
-- redépôt (upsert sur pod, source_id) garde la date de la première livraison,
-- et une livraison « langues » déjà validée revient en attente avec son vieux
-- `created_at` ; elle serait validée dans l'heure, sans fenêtre de relecture.
-- La fonction `pods` l'écrit à chaque dépôt.
--
-- `auto_erreur` : la validation automatique a échoué (409 ou exception). La
-- livraison reste dans la file, à décider à la main, et n'est plus retentée
-- (pas d'appels Gemini répétés toutes les heures). Un redépôt l'efface.
-- `decide_auto` : validée par le cron, pas par une personne.
--
-- Le cron `pods-auto-validation` appelle la fonction `pods` toutes les heures
-- (minute 20 : la plupart des jobs partent à la minute 0). Le secret n'est écrit
-- NULLE PART dans le dépôt : on clone la commande d'un job existant, comme 0283.
-- À appliquer APRÈS le déploiement de la fonction `pods` qui connaît l'action
-- `auto_valider` (sinon le cron reçoit un 400 par heure, sans effet).
--
-- Retour arrière : `select cron.unschedule('pods-auto-validation');` puis
-- supprimer les colonnes.

alter table public.pods
  add column if not exists auto_validation boolean not null default false,
  add column if not exists auto_validation_heures integer not null default 12;

do $$
begin
  alter table public.pods
    add constraint pods_auto_validation_heures_check check (auto_validation_heures between 1 and 168);
exception when duplicate_object then null;
end
$$;

alter table public.pod_livraisons
  add column if not exists depose_le timestamptz,
  add column if not exists decide_auto boolean not null default false,
  add column if not exists auto_erreur text;

update public.pod_livraisons set depose_le = created_at where depose_le is null;

alter table public.pod_livraisons
  alter column depose_le set default now(),
  alter column depose_le set not null;

create index if not exists pod_livraisons_attente_depose_idx
  on public.pod_livraisons (depose_le)
  where statut = 'a_valider';

do $pods_auto$
declare
  template text;
  cmd text;
begin
  select c.command into template
  from cron.job c
  where position('x-cron-secret' in c.command) > 0
    and position('functions/v1/' in c.command) > 0
  order by case when c.jobname = 'comment-masters' then 0 else 1 end
  limit 1;

  if template is null then
    raise notice 'pods-auto-validation : aucun cron modèle avec secret, schedule manuelle requise';
    return;
  end if;

  begin
    perform cron.unschedule('pods-auto-validation');
  exception when others then
    null;
  end;

  cmd := regexp_replace(template, 'functions/v1/[a-z0-9-]+', 'functions/v1/pods', 'i');
  cmd := regexp_replace(cmd, 'body\s*:=\s*''[^'']*''::jsonb', 'body := ''{"action":"auto_valider"}''::jsonb', 'i');

  if position('functions/v1/pods' in cmd) = 0 or position('auto_valider' in cmd) = 0 then
    raise notice 'pods-auto-validation : réécriture de la commande échouée';
    return;
  end if;

  perform cron.schedule('pods-auto-validation', '20 * * * *', cmd);
end
$pods_auto$;
