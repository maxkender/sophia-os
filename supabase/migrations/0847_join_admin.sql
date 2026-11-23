-- 0847 : Join — dashboard admin (/admin sur join), acceptation automatique, décisions de l'admin (23/11, Max).
-- Uniquement des ajouts : un réglage, des colonnes sur join_candidatures, des valeurs de plus dans deux contraintes
-- CHECK des tables join_* (élargies, jamais restreintes). Aucune autre table, fonction ou cron touché.
--
-- 1. Réglage `join_auto_acceptation` : { "actif": false } par défaut (OFF). ON : une candidature qui remplit les
--    conditions de l'OS est acceptée seule et, après la signature, l'identité OS est créée tout de suite (par
--    hub-posteurs `creer_posteur`, le chemin existant) — seulement si join_mode est « live » : en test, la création
--    reste SIMULÉE. Chaque changement est journalisé par le déclencheur existant de `reglages` (reglages_journal,
--    0411) avec l'admin dans `updated_by`, et dans join_evenements (type « reglage »).
-- 2. Décisions de l'admin : `decision` accepte « refusee » ; qui a décidé (`decision_par`) et une note.
-- 3. L'identité OS créée (live seulement) : `profile_id`, `email_os`.
--
-- Retour arrière : supprimer le réglage et les colonnes ; remettre les deux CHECK de 0840/0841.

insert into public.reglages (cle, valeur)
values ('join_auto_acceptation', '{"actif": false}'::jsonb)
on conflict (cle) do nothing;

alter table public.join_candidatures add column if not exists decision_par uuid;      -- l'admin (null = règles de l'OS)
alter table public.join_candidatures add column if not exists decision_note text;     -- note libre de l'admin
alter table public.join_candidatures add column if not exists profile_id uuid;        -- identité OS créée (live)
alter table public.join_candidatures add column if not exists email_os text;          -- login de l'OS (live)

create index if not exists join_candidatures_decision_idx on public.join_candidatures (decision, cree_at desc);

do $c$
begin
  if exists (select 1 from pg_constraint where conname = 'join_candidatures_decision_check') then
    alter table public.join_candidatures drop constraint join_candidatures_decision_check;
  end if;
  alter table public.join_candidatures add constraint join_candidatures_decision_check
    check (decision in ('auto', 'a_traiter', 'refusee'));

  if exists (select 1 from pg_constraint where conname = 'join_evenements_type_check') then
    alter table public.join_evenements drop constraint join_evenements_type_check;
  end if;
  alter table public.join_evenements add constraint join_evenements_type_check check (type in (
    'visite', 'candidature', 'verifiee', 'acceptee', 'a_traiter', 'signee', 'connectee', 'tiktok_ok', 'warmup', 'slack',
    'premier_post', 'ruul_ready', 'simule', 'expiree', 'refusee', 'compte_os', 'reglage'));
end
$c$;
