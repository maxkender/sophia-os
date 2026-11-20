-- 0786 : Bible · « à podzer » se marque sur le LABEL (son bloc), plus sur chaque
-- compte (décision d'Adrien du 20/11 : « ce ne sont plus les comptes source qui
-- doivent être proposés en "à podzer", mais les labels »).
--
-- Avant (0759, 0767) : `bible_comptes.a_podzer`, une case par compte ; un compte
-- validé prenait l'étape `importe` sans source, et se rangeait seul dans
-- « Weekly update », catégorie Podz.
--
-- Désormais :
--   * `labels_proposes.a_podzer` : ce label est à faire en podz (des originaux),
--     pas à importer. Tous ses comptes servent d'inspiration et ne sont jamais
--     importés, que le label existe déjà dans l'OS ou non.
--   * `labels_proposes.podz_valide_at` : le podz est validé ; le bloc et ses
--     comptes se rangent dans « Weekly update », catégorie Podz.
--   * `bible_lancer_batch` refuse un compte d'après son label (« label à
--     podzer : pas d'import »), plus d'après la case du compte.
--
-- Reprise des marques existantes (10 comptes le 20/11) : un bloc dont les
-- comptes étaient à podzer devient à podzer, validé si tous ses comptes
-- l'étaient. Aucun bloc ne mêlait les deux le 20/11 ; la migration s'arrête si
-- c'est le cas. Un compte à podzer sans label garde l'information dans sa
-- remarque. `bible_comptes.a_podzer` n'est ni vidée ni supprimée : plus rien ne
-- la lit.
--
-- À appliquer AVANT le déploiement du front (il lit les deux colonnes).
--
-- ✅ Appliquée le 2026-11-20 (MCP).
--
-- Retour arrière : `bible_lancer_batch` de 0767 ; le front d'avant relit
-- `bible_comptes.a_podzer`, intacte (remettre l'étape `importe` aux comptes
-- validés : @hannah.run5 et @katrina.run le 20/11). Les deux colonnes peuvent
-- rester.

set lock_timeout = '5s';

alter table public.labels_proposes add column if not exists a_podzer boolean not null default false;
alter table public.labels_proposes add column if not exists podz_valide_at timestamptz;

comment on column public.labels_proposes.a_podzer is
  'Bible (0786) : ce label est à faire en podz (des originaux), pas à importer. Ses comptes servent d''inspiration et ne sont jamais importés.';
comment on column public.labels_proposes.podz_valide_at is
  'Bible (0786) : le podz de ce label est validé ; le bloc et ses comptes se rangent dans « Weekly update », catégorie Podz. Nul : pas validé.';
comment on column public.bible_comptes.a_podzer is
  'Abandonnée (0786) : « à podzer » se marque sur le label (labels_proposes.a_podzer). Gardée pour le retour arrière, plus rien ne la lit.';

-- Garde-fou : un bloc qui mêle comptes à podzer et comptes ordinaires se tranche à la main.
do $garde$
declare
  v_meles text;
begin
  select string_agg(lp.nom, ', ' order by lp.nom) into v_meles
    from labels_proposes lp
   where exists (select 1 from bible_comptes b where b.label_propose_id = lp.id and b.supprime_at is null and b.a_podzer)
     and exists (select 1 from bible_comptes b where b.label_propose_id = lp.id and b.supprime_at is null and not b.a_podzer);
  if v_meles is not null then
    raise exception '0786 : des blocs mêlent comptes à podzer et comptes ordinaires (%) : à trancher avant la reprise', v_meles;
  end if;
end
$garde$;

-- Reprise : le bloc prend la marque de ses comptes ; validé si tous l'étaient.
update public.labels_proposes lp
   set a_podzer = true,
       podz_valide_at = case
         when not exists (select 1 from bible_comptes b
                           where b.label_propose_id = lp.id and b.supprime_at is null and b.a_podzer and b.etape <> 'importe')
         then now() end
 where not lp.a_podzer
   and exists (select 1 from bible_comptes b where b.label_propose_id = lp.id and b.supprime_at is null and b.a_podzer);

-- Un compte à podzer sans label : la marque n'a plus de bloc où aller, elle reste lisible dans sa remarque.
update public.bible_comptes b
   set remarque = case when coalesce(btrim(b.remarque), '') = '' then 'à podzer (marque du compte, avant le 20/11)'
                       else b.remarque || ' · à podzer (marque du compte, avant le 20/11)' end
 where b.a_podzer and b.supprime_at is null
   and coalesce(b.remarque, '') not like '%à podzer (marque du compte%'
   and not exists (select 1 from labels_proposes lp where lp.id = b.label_propose_id and lp.statut <> 'refuse');

-- Un compte validé à l'ancienne portait l'étape « importe » sans source : c'est le bloc qui porte la validation.
update public.bible_comptes b
   set etape = 'a_importer', etape_at = now()
 where b.a_podzer and b.etape = 'importe' and b.compte_reference_id is null;

-- L'import refuse d'après le label.
do $patch$
declare
  d text := pg_get_functiondef('public.bible_lancer_batch(jsonb)'::regprocedure);
  v_condition constant text := 'elsif b.a_podzer then';
  v_message constant text := $m$'à podzer : pas d''import'$m$;
begin
  if (length(d) - length(replace(d, v_condition, ''))) / length(v_condition) <> 1
     or (length(d) - length(replace(d, v_message, ''))) / length(v_message) <> 1 then
    raise exception '0786 : bible_lancer_batch n''a plus la forme attendue, rien n''est changé';
  end if;
  d := replace(d, v_condition,
    'elsif exists (select 1 from labels_proposes lpz where lpz.id = b.label_propose_id and lpz.statut <> ''refuse'' and lpz.a_podzer) then');
  d := replace(d, v_message, $m$'label à podzer : pas d''import'$m$);
  execute d;
end
$patch$;

comment on function public.bible_lancer_batch(jsonb) is
  'Bible (0763, 0767, 0786) : lance l''import de comptes de la Bible ([{id, langue}]), d''où qu''ils soient (un clic sur la tuile, ou tout le prochain batch). Crée chaque source avec le label de sa carte et la passe par maj_sources_ajouter. Refusés, avec la raison : label à podzer, label à créer, déjà une source, langue manquante. Rend {resultats: [{id, handle, statut, …}]}.';

notify pgrst, 'reload schema';
