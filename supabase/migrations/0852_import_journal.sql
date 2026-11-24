-- 0852 · Journal de l'import : ce qui arrive à une source neuve, ligne par ligne, avec l'heure.
--
-- ⏳ À appliquer (MCP). Sans elle, l'onglet « En import » de la Bible montre déjà l'avancement de chaque source
-- (lu dans import_file et contenus) ; avec elle, il montre aussi le journal horodaté, le rythme et le temps restant.
--
-- Demande du 24/11 : « suivre plus précisément depuis la page En import les logs, l'avancement ».
-- Jusqu'ici, la base ne gardait que l'ÉTAT présent : l'étape d'un slideshow (`contenus.import_etape`), sa dernière
-- erreur, le dernier essai du relevé (`bleo_sources_decisions.echec`). Rien ne disait quand une étape avait été
-- franchie, ni combien de fois un relevé ou un nettoyage avait raté avant de passer.
--
-- Trois triggers écrivent dans `import_journal`, sans toucher à la fonction d'import :
--   * bleo_sources_decisions (raison « ajout », les sources neuves) : source ajoutée, relevé du profil lancé (essai
--     n sur 5), relevé raté (raison), profil relevé (n slideshows mis dans la file) ;
--   * import_file (une ligne par post) : post récupéré, récupération reportée (Apify saturé), ratée (tentative
--     n sur 5), ignoré. Le passage à « running » n'est pas noté (bruit) ;
--   * contenus (le pipeline) : chaque CHANGEMENT d'étape (lecture, pertinence, note, nettoyage, description), chaque
--     échec (tentative n sur 8), et l'issue : gardé (validé), ou écarté (pertinence, note trop basse, trop court,
--     sticker pub).
-- Seules les lignes d'une source (compte_reference_id) sont notées. Les conditions des triggers (WHEN) écartent
-- toutes les autres mises à jour avant d'appeler quoi que ce soit.
--
-- Rétention : 30 jours (cron `import-journal-purge`, chaque nuit à 4 h 17).
--
-- Retour arrière :
--   drop trigger if exists import_journal_decisions on public.bleo_sources_decisions;
--   drop trigger if exists import_journal_file on public.import_file;
--   drop trigger if exists import_journal_contenus on public.contenus;
--   select cron.unschedule('import-journal-purge');
--   (la table et les fonctions peuvent rester.)

set lock_timeout = '5s';

create table if not exists public.import_journal (
  id bigint generated always as identity primary key,
  at timestamptz not null default clock_timestamp(),
  compte_reference_id uuid not null references public.comptes_reference (id) on delete cascade,
  contenu_id uuid,
  import_file_id uuid,
  post_url text,
  niveau text not null check (niveau in ('info', 'ok', 'warn', 'erreur')),
  -- releve | recuperation | ocr | pertinence | elo | nettoyage | caption | fin | echec
  etape text not null,
  message text not null
);

create index if not exists import_journal_compte_at_idx on public.import_journal (compte_reference_id, at desc);
create index if not exists import_journal_at_idx on public.import_journal (at);

alter table public.import_journal enable row level security;
drop policy if exists import_journal_admin on public.import_journal;
create policy import_journal_admin on public.import_journal for select to authenticated using (public.is_admin());
revoke all on public.import_journal from anon, authenticated;
grant select on public.import_journal to authenticated;
grant all on public.import_journal to service_role;

comment on table public.import_journal is
  '0852 : journal de l''import des sources, écrit par des triggers (bleo_sources_decisions, import_file, contenus). Lu par l''onglet « En import » de la Bible. 30 jours.';

-- Le numéro de la vidéo d'un lien TikTok (« …/video/7600… » ou « …/photo/7600… »), pour des lignes courtes.
create or replace function public.import_journal_post(p_url text)
returns text
language sql
immutable
as $$
  select coalesce('post ' || right(substring(p_url from '/(?:video|photo)/(\d+)'), 6), 'post');
$$;

-- 1. Les sources neuves : ajout, relevé du profil.
create or replace function public.import_journal_decisions()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.raison is distinct from 'ajout' then
    return new;
  end if;

  -- Ajoutée (ou rajoutée : `maj_sources_ajouter` remet tout à zéro).
  if tg_op = 'INSERT' then
    insert into import_journal (compte_reference_id, niveau, etape, message)
    values (new.compte_reference_id, 'info', 'releve', 'Source ajoutée : relevé du profil dans la minute');
    return new;
  end if;
  if new.essais = 0 and new.lancee_le is null and new.urls_ajoutees is null
     and (old.raison is distinct from 'ajout' or old.essais > 0 or old.urls_ajoutees is not null or old.lancee_le is not null) then
    insert into import_journal (compte_reference_id, niveau, etape, message)
    values (new.compte_reference_id, 'info', 'releve', 'Source ajoutée : relevé du profil dans la minute');
  end if;

  if new.lancee_le is not null and new.lancee_le is distinct from old.lancee_le then
    insert into import_journal (compte_reference_id, niveau, etape, message)
    values (new.compte_reference_id, 'info', 'releve',
            case when new.essais is distinct from old.essais and new.essais between 1 and 5
                 then format('Relevé du profil lancé (essai %s sur 5)', new.essais)
                 else 'Relevé du profil repris avec le lot du matin' end);
  end if;

  if new.echec is not null and new.echec is distinct from old.echec then
    insert into import_journal (compte_reference_id, niveau, etape, message)
    values (new.compte_reference_id, 'erreur', 'releve',
            format('Relevé du profil raté : %s', new.echec)
            || case when new.essais < 5 then ', nouvel essai dans 10 minutes' else ', la source repart avec le lot du matin' end);
  end if;

  if new.urls_ajoutees is not null and new.urls_ajoutees is distinct from old.urls_ajoutees then
    insert into import_journal (compte_reference_id, niveau, etape, message)
    values (new.compte_reference_id,
            case when new.urls_ajoutees > 0 then 'ok' else 'warn' end, 'releve',
            case when new.urls_ajoutees > 0
                 then format('Profil relevé : %s slideshow%s mis dans la file', new.urls_ajoutees, case when new.urls_ajoutees > 1 then 's' else '' end)
                 else 'Profil relevé : aucun slideshow à importer' end);
  end if;

  return new;
end;
$$;

drop trigger if exists import_journal_decisions on public.bleo_sources_decisions;
create trigger import_journal_decisions
  after insert or update of lancee_le, echec, urls_ajoutees, essais, raison on public.bleo_sources_decisions
  for each row
  when (new.raison = 'ajout')
  execute function public.import_journal_decisions();

-- 2. La récupération des posts (import_file).
create or replace function public.import_journal_file()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_post text := public.import_journal_post(new.post_url);
begin
  if new.statut = 'done' then
    insert into import_journal (compte_reference_id, contenu_id, import_file_id, post_url, niveau, etape, message)
    values (new.compte_reference_id, new.contenu_id, new.id, new.post_url, 'info', 'recuperation',
            format('%s récupéré, lecture à venir', initcap(v_post)));
  elsif new.statut = 'failed' then
    insert into import_journal (compte_reference_id, contenu_id, import_file_id, post_url, niveau, etape, message)
    values (new.compte_reference_id, new.contenu_id, new.id, new.post_url, 'erreur', 'recuperation',
            format('Récupération du %s ratée (tentative %s sur 5) : %s', v_post, new.tentatives, coalesce(new.erreur, 'erreur inconnue')));
  elsif new.statut = 'pending' and new.erreur like 'Report%' then
    insert into import_journal (compte_reference_id, contenu_id, import_file_id, post_url, niveau, etape, message)
    values (new.compte_reference_id, new.contenu_id, new.id, new.post_url, 'warn', 'recuperation',
            format('Récupération du %s reportée de quelques minutes (fournisseur saturé)', v_post));
  elsif new.statut = 'skipped' then
    insert into import_journal (compte_reference_id, contenu_id, import_file_id, post_url, niveau, etape, message)
    values (new.compte_reference_id, new.contenu_id, new.id, new.post_url, 'warn', 'recuperation',
            format('%s ignoré%s', initcap(v_post), coalesce(' : ' || new.erreur, '')));
  end if;
  return new;
end;
$$;

drop trigger if exists import_journal_file on public.import_file;
create trigger import_journal_file
  after update of statut, erreur on public.import_file
  for each row
  when (new.compte_reference_id is not null
        and (old.statut is distinct from new.statut or old.erreur is distinct from new.erreur)
        and new.statut in ('done', 'failed', 'pending', 'skipped'))
  execute function public.import_journal_file();

-- 3. Le pipeline (contenus) : changements d'étape, échecs, issue.
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
    else
      return new;
  end case;

  insert into import_journal (compte_reference_id, contenu_id, post_url, niveau, etape, message)
  values (new.compte_reference_id, new.id, new.source_url, v_niveau, v_etape, initcap(v_post) || ' : ' || v_message);
  return new;
end;
$$;

drop trigger if exists import_journal_contenus on public.contenus;
create trigger import_journal_contenus
  after update of import_etape, import_statut, import_erreur on public.contenus
  for each row
  when (new.compte_reference_id is not null
        and (old.import_etape is distinct from new.import_etape
             or (new.import_statut = 'failed' and (old.import_statut is distinct from new.import_statut or old.import_erreur is distinct from new.import_erreur))))
  execute function public.import_journal_contenus();

revoke all on function public.import_journal_decisions() from public, anon, authenticated;
revoke all on function public.import_journal_file() from public, anon, authenticated;
revoke all on function public.import_journal_contenus() from public, anon, authenticated;

-- 4. Rétention : 30 jours.
do $cron$
begin
  perform cron.unschedule('import-journal-purge') where exists (select 1 from cron.job where jobname = 'import-journal-purge');
  perform cron.schedule('import-journal-purge', '17 4 * * *',
    $c$delete from public.import_journal where at < now() - interval '30 days'$c$);
end
$cron$;
