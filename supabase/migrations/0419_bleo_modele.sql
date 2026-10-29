-- 0419 : BLEO, le modèle de données (docs/bleo.md, « Modèle de données » ; lot L0).
--
-- AJOUT SEULEMENT. Rien de ce qui tourne ne lit ces colonnes ni ces tables :
-- l'assignation, la tierlist, les podz et le relevé de nuit sont inchangés.
-- Les colonnes neuves des tables existantes sont nulles (ou à une constante),
-- donc sans réécriture de table. Les remplir, c'est le lot L1 (0420).
--
-- Écarts assumés avec la spec, notés dans docs/bleo-chantier.md :
--   * `deck_version` est un entier (la spec dit « + 1 » à chaque correction) ;
--   * `contenu_langues.cuit_le` en plus : un deck Sophia n'a aucun horodatage (D9) ;
--   * `bleo_ombre_passages` porte aussi `label_id`, `categorie` et `relache`,
--     lus par le rapport de 22 h ;
--   * pas de garde sur les colonnes BLEO de `passages` (D10) : elle touche le
--     chemin d'écriture des posteurs, elle viendra avec l'A/B ;
--   * les vues `bleo_boite`, `bleo_jauge` et `bleo_mix` viendront avec L2/L4.
--
-- Retour arrière : supprimer les tables `bleo_*`, la vue, la ligne
-- `reglages.bleo` et les colonnes ajoutées (aucune donnée de l'existant n'y vit).

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Tables neuves (avant les colonnes qui les référencent)
-- ---------------------------------------------------------------------------
create table if not exists public.bleo_familles (
  id uuid primary key default gen_random_uuid(),
  label_id uuid not null references public.labels (id) on delete cascade,
  accroche_norm text,
  racine_contenu_id uuid references public.contenus (id) on delete set null,
  verdict text not null default 'en_attente'
    check (verdict in ('gagnante', 'non_gagnante', 'en_attente')),
  verdict_le timestamptz,
  close boolean not null default false,
  close_le timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists bleo_familles_label_accroche_uidx
  on public.bleo_familles (label_id, accroche_norm) where accroche_norm is not null;
comment on table public.bleo_familles is
  'BLEO : une famille d''accroche par label (racine, déclinaisons, reprises mot pour mot). Verdict A3.';

create table if not exists public.bleo_runs (
  id uuid primary key default gen_random_uuid(),
  jour_vise date not null,
  mode text not null check (mode in ('ombre', 'ab', 'actif')),
  demarre_le timestamptz not null default now(),
  fini_le timestamptz,
  resume jsonb,
  erreur text
);
create index if not exists bleo_runs_jour_idx on public.bleo_runs (jour_vise, demarre_le desc);
comment on table public.bleo_runs is 'BLEO : un tirage de 14 h (A7), avec son résumé et ses contrôles.';

create table if not exists public.bleo_valeurs (
  contenu_id uuid not null references public.contenus (id) on delete cascade,
  langue text not null,
  forme numeric not null,
  defaut numeric not null,
  n_r integer not null,
  n_post integer not null,
  n_accroche integer not null,
  facteur_age numeric not null,
  valeur numeric not null,
  calcule_le timestamptz not null default now(),
  primary key (contenu_id, langue)
);
comment on table public.bleo_valeurs is 'BLEO : forme et valeur attendue par contenu × langue (A5), réécrite chaque nuit.';

create table if not exists public.bleo_classes (
  semaine date not null,
  classe text not null
    check (classe in ('import', 'podz', 'accroche_gagnante', 'accroche_non_gagnante', 'livre')),
  valeur numeric not null,
  n integer not null,
  calcule_le timestamptz not null default now(),
  primary key (semaine, classe)
);
comment on table public.bleo_classes is 'BLEO : valeurs par défaut des classes, une ligne par semaine (A5).';

create table if not exists public.bleo_ombre_passages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.bleo_runs (id) on delete cascade,
  compte_id uuid not null references public.comptes (id) on delete cascade,
  contenu_id uuid not null references public.contenus (id) on delete cascade,
  langue text not null,
  application_id uuid references public.applications (id) on delete set null,
  label_id uuid references public.labels (id) on delete set null,
  file_bleo text not null check (file_bleo in ('juger', 'valeur', 'rappel')),
  categorie text
    check (categorie in ('juger', 'recolte', 'gagnant_servi', 'non_gagnant_neuve', 'non_gagnant_servie', 'rappel')),
  valeur_tirage numeric,
  creneau smallint not null,
  relache text,
  created_at timestamptz not null default now()
);
create index if not exists bleo_ombre_passages_run_idx on public.bleo_ombre_passages (run_id);
create index if not exists bleo_ombre_passages_compte_idx on public.bleo_ombre_passages (compte_id, run_id);
comment on table public.bleo_ombre_passages is
  'BLEO : ce que le tirage aurait assigné en mode ombre (à blanc). Rien n''est publié.';

create table if not exists public.bleo_sources_decisions (
  semaine date not null,
  compte_reference_id uuid not null references public.comptes_reference (id) on delete cascade,
  posts integer,
  r_mediane numeric,
  r_vs_label numeric,
  decision text not null check (decision in ('maj', 'pas_maj', 'peu_de_mesures')),
  urls_ajoutees integer,
  primary key (semaine, compte_reference_id)
);
comment on table public.bleo_sources_decisions is 'BLEO : la règle des sources du lundi (A11).';

create table if not exists public.bleo_commandes_langue (
  id uuid primary key default gen_random_uuid(),
  contenu_id uuid not null references public.contenus (id) on delete cascade,
  pod text not null,
  langues text[] not null,
  statut text not null default 'a_faire' check (statut in ('a_faire', 'livree', 'annulee')),
  cree_le timestamptz not null default now(),
  livree_le timestamptz
);
comment on table public.bleo_commandes_langue is 'BLEO : un remake gagnant à refaire dans d''autres langues (voie 2, P4).';

create table if not exists public.bleo_decks_file (
  id uuid primary key default gen_random_uuid(),
  contenu_id uuid not null references public.contenus (id) on delete cascade,
  langue text not null,
  application_id uuid not null references public.applications (id) on delete cascade,
  jour_vise date not null,
  voie_cta text check (voie_cta in ('reprise', 'prouvee', 'essai', 'marquee', 'concurrent')),
  slide_appli smallint,
  statut text not null default 'a_faire' check (statut in ('a_faire', 'en_cours', 'pret', 'echec', 'secours')),
  circuit text check (circuit in ('agent', 'gemini', 'livre')),
  essais integer not null default 0,
  modele text,
  controles jsonb,
  cree_le timestamptz not null default now(),
  fini_le timestamptz,
  unique (contenu_id, langue, application_id, jour_vise)
);
comment on table public.bleo_decks_file is 'BLEO : les commandes de decks du lendemain (D1).';

create table if not exists public.bleo_relectures (
  id uuid primary key default gen_random_uuid(),
  langue text not null,
  label_id uuid references public.labels (id) on delete set null,
  application_id uuid references public.applications (id) on delete set null,
  contenu_id uuid references public.contenus (id) on delete set null,
  slide_position smallint,
  tache text not null check (tache in ('ab_aveugle', 'correction', 'ecriture')),
  version_agent text,
  version_gemini text,
  version_native text,
  choix text,
  type_erreur text check (type_erreur in
    ('tournure_anglaise', 'registre', 'vocabulaire', 'cta_trop_pub', 'cta_mal_place', 'longueur', 'autre')),
  relecteur_id uuid,
  payee_le timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.bleo_relectures is 'BLEO : les micro-tâches des relecteurs natifs (D7).';

create table if not exists public.bleo_banque (
  id uuid primary key default gen_random_uuid(),
  langue text not null,
  label_id uuid references public.labels (id) on delete set null,
  application_id uuid references public.applications (id) on delete set null,
  sorte text not null check (sorte in ('ecrit', 'corrige', 'valide')),
  jeu text not null check (jeu in ('exemple', 'test')),
  slide_source text,
  version_agent text,
  version_finale text,
  type_erreur text check (type_erreur in
    ('tournure_anglaise', 'registre', 'vocabulaire', 'cta_trop_pub', 'cta_mal_place', 'longueur', 'autre')),
  contenu_id uuid references public.contenus (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.bleo_banque is 'BLEO : la banque d''exemples de chaque langue (D7).';

create table if not exists public.bleo_fiches (
  sorte text not null check (sorte in ('langue', 'label', 'appli')),
  cle text not null,
  version integer not null,
  contenu text not null,
  auteur text,
  created_at timestamptz not null default now(),
  primary key (sorte, cle, version)
);
comment on table public.bleo_fiches is 'BLEO : fiches langue, label et appli, versionnées, jamais écrasées (D8).';

-- ---------------------------------------------------------------------------
-- 2. Colonnes ajoutées aux tables existantes
-- ---------------------------------------------------------------------------
alter table public.labels
  add column if not exists voie smallint not null default 1 check (voie in (1, 2));

alter table public.contenus
  add column if not exists famille_id uuid references public.bleo_familles (id) on delete set null,
  add column if not exists generation smallint check (generation between 0 and 2),
  add column if not exists parent_bleo_id uuid references public.contenus (id) on delete set null,
  add column if not exists type_bleo text
    check (type_bleo in ('import', 'reprise', 'full_test', 'declinaison', 'remake', 'historique')),
  add column if not exists classe_defaut text
    check (classe_defaut in ('import', 'podz', 'accroche_gagnante', 'accroche_non_gagnante', 'livre')),
  add column if not exists etat_bleo text check (etat_bleo in ('a_juger', 'en_test', 'juge')),
  add column if not exists juge_le timestamptz,
  add column if not exists verdict text check (verdict in ('gagnant', 'non_gagnant', 'en_attente')),
  add column if not exists slide_appli smallint check (slide_appli >= 2);
create index if not exists contenus_famille_idx on public.contenus (famille_id) where famille_id is not null;

alter table public.passages
  add column if not exists r numeric,
  add column if not exists r_calcule_le timestamptz,
  add column if not exists enregistrements integer,
  add column if not exists file_bleo text check (file_bleo in ('juger', 'valeur', 'rappel')),
  add column if not exists valeur_tirage numeric,
  add column if not exists bleo_run_id uuid references public.bleo_runs (id) on delete set null,
  add column if not exists bras text check (bras in ('bleo', 'temoin')),
  add column if not exists circuit text check (circuit in ('agent', 'gemini', 'livre')),
  add column if not exists voie_cta text check (voie_cta in ('reprise', 'prouvee', 'essai', 'marquee', 'concurrent')),
  add column if not exists forme_cta text,
  add column if not exists deck_version integer;
-- Jamais deux passages BLEO pour un même compte et un même jour (D20).
create unique index if not exists passages_bleo_compte_jour_uidx
  on public.passages (compte_id, date_publication_prevue) where bras = 'bleo';

alter table public.contenu_langues
  add column if not exists circuit text check (circuit in ('agent', 'gemini', 'livre')),
  add column if not exists modele text,
  add column if not exists deck_version integer,
  add column if not exists voie_cta text check (voie_cta in ('reprise', 'prouvee', 'essai', 'marquee', 'concurrent')),
  add column if not exists forme_cta text,
  add column if not exists controles jsonb,
  add column if not exists cuit_le timestamptz;

alter table public.contenu_langue_decks
  add column if not exists circuit text check (circuit in ('agent', 'gemini', 'livre')),
  add column if not exists modele text,
  add column if not exists deck_version integer,
  add column if not exists voie_cta text check (voie_cta in ('reprise', 'prouvee', 'essai', 'marquee', 'concurrent')),
  add column if not exists forme_cta text,
  add column if not exists controles jsonb;

alter table public.pod_livraisons
  add column if not exists type_bleo text check (type_bleo in ('full_test', 'declinaison', 'remake')),
  add column if not exists parent_contenu_id uuid references public.contenus (id) on delete set null,
  add column if not exists slide_appli smallint check (slide_appli >= 2);

-- ---------------------------------------------------------------------------
-- 3. La médiane du compte (glossaire), seuils lus dans reglages.bleo
-- ---------------------------------------------------------------------------
create or replace view public.bleo_mediane_compte
  with (security_invoker = true)
as
  with reg as (
    select (valeur->'mesure'->>'maturite_heures')::int as maturite_h,
           (valeur->'mesure'->>'mediane_jours')::int as jours,
           (valeur->'mesure'->>'mediane_min_posts')::int as min_posts
      from public.reglages where cle = 'bleo'
  )
  select p.compte_id,
         percentile_cont(0.5) within group (order by p.vues)::numeric as mediane,
         count(*)::int as n
    from public.passages p
   cross join reg
   where p.statut = 'publie' and p.vues is not null and not coalesce(p.est_rappel, false)
     and p.publie_at <= now() - make_interval(hours => reg.maturite_h)
     and p.publie_at >= now() - make_interval(days => reg.jours)
   group by p.compte_id, reg.min_posts
  having count(*) >= reg.min_posts;
comment on view public.bleo_mediane_compte is
  'BLEO : médiane des vues des passages mûrs du compte sur la fenêtre de reglages.bleo.mesure, hors rappels, définie à partir de mediane_min_posts passages.';

-- ---------------------------------------------------------------------------
-- 4. RLS : admins et service, comme les tables du moteur (0256). Tables neuves :
--    aucune politique à remplacer, et sans politique pour anon la RLS lui ferme tout.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['bleo_familles', 'bleo_runs', 'bleo_valeurs', 'bleo_classes', 'bleo_ombre_passages',
                           'bleo_sources_decisions', 'bleo_commandes_langue', 'bleo_decks_file',
                           'bleo_relectures', 'bleo_banque', 'bleo_fiches']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
                   t || '_admin', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

grant select on public.bleo_mediane_compte to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Les réglages (docs/bleo.md, « Réglages »), mode off
-- ---------------------------------------------------------------------------
-- `garde_fous.relache` : l'ordre dans lequel le tirage relâche l'anti-répétition
-- plutôt que de laisser un créneau vide (D5 du journal de chantier).
insert into public.reglages (cle, valeur)
values ('bleo', $json${
  "mode": "off",
  "mesure": { "maturite_heures": 72, "mediane_jours": 45, "mediane_min_posts": 5, "r_plafond": 20, "fenetre_initiale_jours": 60 },
  "verdict": { "vues": 10000, "r": 2, "passages_min_non_gagnant": 2 },
  "forme": { "k": 2 },
  "valeur": { "fatigue_post": 0.6, "fatigue_accroche": 0.75, "age_jours": 45, "age_facteur": 0.7, "exposant": 3 },
  "classes": {
    "fenetre_jours": 60, "min_contenus": 30, "borne_min": 0.8, "borne_max": 4,
    "depart": { "import": 2.0, "podz": 2.7, "accroche_gagnante": 3.2, "accroche_non_gagnante": 1.5, "livre": 4.0 }
  },
  "file_juger": { "passages_test": 2, "part_max": 0.4, "age_prioritaire_jours": 30, "attente_un_passage_jours": 7, "sortie_j2_vues": 10000 },
  "garde_fous": { "budget_famille": 0.2, "budget_plancher": 2, "budget_jours": 7, "meme_contenu_jours": 14, "meme_famille_jours": 10, "meme_couverture_jours": 10,
                  "relache": ["meme_couverture", "meme_famille", "meme_contenu"] },
  "boite": { "declinaisons_par_parent": 3, "generation_max": 2, "fermeture_r_median": 1, "fermeture_min_passages": 4 },
  "jauge": { "seuils_semaines": [6, 3, 1], "parts": [0.10, 0.20, 0.30, 0.40] },
  "sources": { "min_posts": 5, "toujours": [] },
  "agent": {
    "langues_actives": [], "reveils": ["14:15", "18:15"], "taille_paquet": 10, "longueur_max": 1.3,
    "voies_depart": { "prouvee": 0.75, "essai": 0.25 }, "essai_min": 0.20,
    "fiche_langue_victoires": 0.55, "fiche_label_min_posts": 20
  },
  "slide_marquee": false,
  "ombre": { "jours": 3, "quota_min": 0.995, "juger_min": 0.25, "juger_max": 0.35, "non_gagnants_max": 0.15, "recolte_min": 0.35, "fin_tirage": "14:30" },
  "ab": {
    "jours": 11, "creneaux_bleo": 1, "jour_decision": 14, "prolongation_jours": 7, "bootstrap": 2000,
    "arret_decks_manquants": 0.01, "arret_creneaux_vides": 0.005, "ecart_publication_max": 0.03,
    "arret_perte": -0.10, "arret_paires_min": 300, "ratio_vues_min": 0.95,
    "label_exclu_perte": -0.10, "label_exclu_paires_min": 50, "labels_exclus": []
  }
}$json$::jsonb)
on conflict (cle) do nothing;
