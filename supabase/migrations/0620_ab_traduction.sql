-- 0620 : A/B de la traduction et du placement (30/10, demande d'Adrien).
--
-- L'ancien circuit (traduction Gemini puis placement de l'appli, deux appels)
-- contre le nouveau (la réécriture native : un appel qui voit tout le post et
-- lit les fiches langue, label et appli). Langue par langue : l'allemand
-- d'abord. Tout est COUPÉ : rien ne change en production tant que l'admin n'a
-- pas allumé l'A/B, et il ne peut pas l'allumer tant qu'aucun circuit natif
-- n'est déclaré (`circuit_production`).
--
--   reglages.ab_traduction   actif, langues, part_natif (0,5), graine,
--                            circuit_production (null tant que l'appel unique
--                            n'est pas branché), historique des changements.
--   decks_natifs             le deck du nouveau circuit, par contenu × langue ×
--                            appli, cuit à l'avance (l'après-midi) ; l'assignation
--                            de minuit le prend pour un post du bras `natif`,
--                            sinon le deck actuel part (et le post reste compté
--                            dans son bras). Avec son CTA : la voie et la forme
--                            tirées par l'OS à la commande (pas par le modèle),
--                            et le refus du circuit s'il a repris le CTA de
--                            l'original ; elles passent sur le post servi
--                            (`passages.voie_cta`, `forme_cta`, colonnes de 0600).
--   passages.bras_traduction le bras tiré pour ce post (`temoin` ou `natif`) ;
--                            `circuit` dit le deck réellement parti (`natif` ou
--                            `gemini`) et `deck_version` la version de la fiche
--                            langue. Le tirage se fait POST PAR POST (hash stable
--                            de la graine, du compte, du contenu et du jour) :
--                            l'allemand n'a qu'une trentaine de comptes, et le
--                            tirage par post compare les deux bras à l'intérieur
--                            de chaque compte.
--   ab_traduction_duels      l'A/B en Tests : sur des slideshows déjà publiés,
--                            le deck parti contre celui du nouveau circuit, à
--                            l'aveugle (gauche ou droite tiré au sort), avec le
--                            vote de l'admin.
--   ab_traduction_rapport()  les deux bras côte à côte (r médian, part à
--                            10 000 vues, posts servis en natif), le bras natif
--                            voie de CTA par voie, et le décompte des duels.
--   ab_traduction_regler()   le réglage, par l'admin.
--
-- AJOUT SEULEMENT : deux tables, une colonne, une valeur de plus permise pour
-- `passages.circuit`, une clé de réglage, deux fonctions.
-- Retour arrière :
--   drop function public.ab_traduction_rapport(text, date), public.ab_traduction_regler(jsonb);
--   drop table public.ab_traduction_duels, public.decks_natifs;
--   alter table public.passages drop column bras_traduction;
--   delete from public.reglages where cle = 'ab_traduction';

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Le réglage, coupé
-- ---------------------------------------------------------------------------
insert into public.reglages (cle, valeur)
values ('ab_traduction', jsonb_build_object(
  'actif', false,
  'langues', jsonb_build_array('de'),
  'part_natif', 0.5,
  'graine', 'ab-traduction-1',
  'circuit_production', null,
  'historique', '[]'::jsonb))
on conflict (cle) do nothing;

-- ---------------------------------------------------------------------------
-- Les passages : le bras tiré, et `natif` parmi les circuits
-- ---------------------------------------------------------------------------
alter table public.passages
  add column if not exists bras_traduction text check (bras_traduction in ('temoin', 'natif'));

comment on column public.passages.bras_traduction is
  'A/B traduction (0620) : bras tiré pour ce post, `temoin` (ancien circuit) ou `natif` (réécriture native). Null hors A/B. Le deck réellement parti est dans `circuit`.';

alter table public.passages drop constraint if exists passages_circuit_check;
alter table public.passages
  add constraint passages_circuit_check check (circuit in ('agent', 'gemini', 'livre', 'natif')) not valid;
alter table public.passages validate constraint passages_circuit_check;

-- ---------------------------------------------------------------------------
-- Les decks du nouveau circuit
-- ---------------------------------------------------------------------------
create table if not exists public.decks_natifs (
  id             uuid primary key default gen_random_uuid(),
  contenu_id     uuid not null references public.contenus (id) on delete cascade,
  langue         text not null,
  application_id uuid not null references public.applications (id) on delete cascade,
  circuit        text not null,
  version        text not null,
  version_fiche  integer,
  modele         text,
  statut         text not null check (statut in ('pret', 'echec')),
  raison         text,
  voie_cta       text check (voie_cta in ('reprise', 'prouvee', 'essai', 'marquee', 'concurrent')),
  forme_cta      text,
  cta_refus      text,
  slides         jsonb not null default '[]'::jsonb,
  hashtags       text,
  controles      jsonb,
  cuit_le        timestamptz not null default now(),
  unique (contenu_id, langue, application_id)
);

comment on table public.decks_natifs is
  'A/B traduction (0620) : deck du nouveau circuit par contenu × langue × appli, cuit à l''avance. Mêmes positions que le deck actuel ; `slides` au format de contenu_langues.slides ({position, texte_overlay, position_sophia}). L''assignation ne le sert que si `version` est la version du circuit de production.';

alter table public.decks_natifs enable row level security;
create policy decks_natifs_admin on public.decks_natifs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.decks_natifs to authenticated;
grant all on public.decks_natifs to service_role;

-- ---------------------------------------------------------------------------
-- Les duels à l'aveugle (Tests)
-- ---------------------------------------------------------------------------
create table if not exists public.ab_traduction_duels (
  id                uuid primary key default gen_random_uuid(),
  passage_id        uuid references public.passages (id) on delete set null,
  post_id           uuid references public.posts (id) on delete set null,
  contenu_id        uuid not null references public.contenus (id) on delete cascade,
  langue            text not null,
  application_id    uuid references public.applications (id) on delete set null,
  candidat          text not null,
  version           text not null,
  statut            text not null default 'pret' check (statut in ('pret', 'echec')),
  erreur            text,
  voie_cta          text check (voie_cta in ('reprise', 'prouvee', 'essai', 'marquee', 'concurrent')),
  forme_cta         text,
  cta_refus         text,
  slides_source     jsonb not null default '[]'::jsonb,
  slides_actuel     jsonb not null default '[]'::jsonb,
  slides_candidat   jsonb not null default '[]'::jsonb,
  hashtags_actuel   text,
  hashtags_candidat text,
  vues_actuel       bigint,
  gauche            text not null check (gauche in ('actuel', 'candidat')),
  choix             text check (choix in ('actuel', 'candidat', 'egal')),
  remarque          text,
  vote_par          uuid references public.profiles (id) on delete set null,
  vote_le           timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists ab_traduction_duels_langue on public.ab_traduction_duels (langue, candidat, version, created_at desc);

comment on table public.ab_traduction_duels is
  'A/B traduction en Tests (0620) : un slideshow déjà publié, son deck parti (`actuel`) contre celui du nouveau circuit (`candidat`), montrés à gauche ou à droite au hasard (`gauche`), et le vote de l''admin. Rien ne part en production.';

alter table public.ab_traduction_duels enable row level security;
create policy ab_traduction_duels_admin on public.ab_traduction_duels for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.ab_traduction_duels to authenticated;
grant all on public.ab_traduction_duels to service_role;

-- ---------------------------------------------------------------------------
-- Le réglage, par l'admin
-- ---------------------------------------------------------------------------
create or replace function public.ab_traduction_regler(p_reglage jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_avant jsonb;
  v_apres jsonb;
  v_part numeric;
  v_langues jsonb;
begin
  if not (public.is_admin_strict() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'ab_traduction_regler : réservé à l''admin' using errcode = '42501';
  end if;
  select valeur into v_avant from reglages where cle = 'ab_traduction' for update;
  if not found then
    raise exception 'reglages.ab_traduction absent';
  end if;

  v_apres := v_avant;
  if p_reglage ? 'langues' then
    select coalesce(jsonb_agg(distinct lower(trim(l))), '[]'::jsonb) into v_langues
      from jsonb_array_elements_text(p_reglage->'langues') l
     where trim(l) <> '';
    v_apres := jsonb_set(v_apres, '{langues}', v_langues);
  end if;
  if p_reglage ? 'part_natif' then
    v_part := (p_reglage->>'part_natif')::numeric;
    if v_part is null or v_part < 0.05 or v_part > 0.95 then
      raise exception 'ab_traduction_regler : part_natif entre 0,05 et 0,95 (reçu %)', p_reglage->>'part_natif' using errcode = '22023';
    end if;
    v_apres := jsonb_set(v_apres, '{part_natif}', to_jsonb(v_part));
  end if;
  if p_reglage ? 'actif' then
    v_apres := jsonb_set(v_apres, '{actif}', to_jsonb(coalesce((p_reglage->>'actif')::boolean, false)));
  end if;

  if (v_apres->>'actif')::boolean then
    if coalesce(v_apres->>'circuit_production', '') = '' then
      raise exception 'ab_traduction_regler : aucun circuit natif branché en production (circuit_production vide)' using errcode = '22023';
    end if;
    if jsonb_array_length(coalesce(v_apres->'langues', '[]'::jsonb)) = 0 then
      raise exception 'ab_traduction_regler : aucune langue' using errcode = '22023';
    end if;
  end if;

  v_apres := jsonb_set(v_apres, '{historique}',
    (select coalesce(jsonb_agg(h order by (h->>'le') desc), '[]'::jsonb)
       from (select h
               from jsonb_array_elements(
                      jsonb_build_array(jsonb_build_object(
                        'le', now(), 'par', auth.uid(),
                        'actif', v_apres->'actif', 'langues', v_apres->'langues', 'part_natif', v_apres->'part_natif'))
                      || coalesce(v_avant->'historique', '[]'::jsonb)) h
              order by (h->>'le') desc
              limit 20) d));

  update reglages
     set valeur = v_apres, updated_at = now(), updated_by = coalesce(auth.uid(), updated_by)
   where cle = 'ab_traduction';
  return v_apres - 'historique';
end;
$$;

revoke all on function public.ab_traduction_regler(jsonb) from public, anon;
grant execute on function public.ab_traduction_regler(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Le rapport
-- ---------------------------------------------------------------------------
create or replace function public.ab_traduction_rapport(p_langue text default null, p_depuis date default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public'
as $$
declare
  v_bras jsonb;
  v_duels jsonb;
  v_ecart jsonb;
  v_voies jsonb;
begin
  with base as (
    select p.bras_traduction as bras, p.langue, p.statut, p.r, p.vues, p.circuit
      from passages p
      left join posts po on po.id = p.post_id
     where p.bras_traduction is not null
       and not coalesce(p.est_rappel, false)
       and not coalesce(po.est_test, false)
       and (p_langue is null or p.langue = p_langue)
       and (p_depuis is null or p.date_publication_prevue >= p_depuis)
  ),
  par_bras as (
    select bras,
           count(*) as assignes,
           count(*) filter (where statut = 'publie') as publies,
           count(r) filter (where statut = 'publie') as mesures,
           round((percentile_cont(0.5) within group (order by r) filter (where statut = 'publie'))::numeric, 2) as r_median,
           avg((vues >= 10000)::int) filter (where statut = 'publie' and vues is not null) as part_10k,
           count(*) filter (where statut = 'publie' and vues is not null) as avec_vues,
           round(avg(vues) filter (where statut = 'publie' and vues is not null)) as vues_par_post,
           count(*) filter (where circuit = 'natif') as servis_natif
      from base
     group by bras
  )
  select coalesce(jsonb_object_agg(bras, jsonb_build_object(
           'assignes', assignes, 'publies', publies, 'mesures', mesures, 'r_median', r_median,
           'part_10k', round(part_10k, 3), 'vues_par_post', vues_par_post, 'servis_natif', servis_natif)), '{}'::jsonb),
         (select case when t.avec_vues > 0 and n.avec_vues > 0 then
                   jsonb_build_object(
                     'part_10k', round(n.part_10k - t.part_10k, 3),
                     'marge_95', round(1.96 * sqrt(n.part_10k * (1 - n.part_10k) / n.avec_vues
                                                 + t.part_10k * (1 - t.part_10k) / t.avec_vues), 3))
                 end
            from par_bras n, par_bras t
           where n.bras = 'natif' and t.bras = 'temoin')
    into v_bras, v_ecart
    from par_bras;

  -- Le bras natif, voie de CTA par voie (posts servis en natif seulement).
  select coalesce(jsonb_object_agg(voie, jsonb_build_object(
           'publies', publies, 'mesures', mesures, 'r_median', r_median, 'part_10k', round(part_10k, 3))), '{}'::jsonb)
    into v_voies
    from (select coalesce(p.voie_cta, 'inconnue') as voie,
                 count(*) filter (where p.statut = 'publie') as publies,
                 count(p.r) filter (where p.statut = 'publie') as mesures,
                 round((percentile_cont(0.5) within group (order by p.r) filter (where p.statut = 'publie'))::numeric, 2) as r_median,
                 avg((p.vues >= 10000)::int) filter (where p.statut = 'publie' and p.vues is not null) as part_10k
            from passages p
            left join posts po on po.id = p.post_id
           where p.bras_traduction = 'natif' and p.circuit = 'natif'
             and not coalesce(p.est_rappel, false) and not coalesce(po.est_test, false)
             and (p_langue is null or p.langue = p_langue)
             and (p_depuis is null or p.date_publication_prevue >= p_depuis)
           group by 1) v;

  select coalesce(jsonb_agg(jsonb_build_object(
           'langue', langue, 'candidat', candidat, 'version', version,
           'duels', duels, 'votes', votes, 'candidat_gagne', candidat_gagne,
           'actuel_gagne', actuel_gagne, 'egal', egal) order by langue, candidat, version), '[]'::jsonb)
    into v_duels
    from (select langue, candidat, version,
                 count(*) filter (where statut = 'pret') as duels,
                 count(choix) as votes,
                 count(*) filter (where choix = 'candidat') as candidat_gagne,
                 count(*) filter (where choix = 'actuel') as actuel_gagne,
                 count(*) filter (where choix = 'egal') as egal
            from ab_traduction_duels
           where p_langue is null or langue = p_langue
           group by langue, candidat, version) d;

  return jsonb_build_object(
    'reglage', (select valeur - 'historique' from reglages where cle = 'ab_traduction'),
    'langue', p_langue,
    'depuis', p_depuis,
    'bras', v_bras,
    'ecart', v_ecart,
    'natif_par_voie', v_voies,
    'duels', v_duels);
end;
$$;

grant execute on function public.ab_traduction_rapport(text, date) to authenticated, service_role;

comment on function public.ab_traduction_rapport(text, date) is
  'A/B traduction (0620) : les deux bras (r médian, part à 10 000 vues avec sa marge à 95 %, posts servis en natif) et le décompte des duels de Tests.';
