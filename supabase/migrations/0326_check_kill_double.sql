-- 0326 : Check, Kill or Double (PROMPT 5), PR 1 en lecture seule.
--
-- POURQUOI. On paie les posters à la semaine. Chaque semaine, l'OS propose les
-- comptes à tuer et les posteurs à doubler ; un admin décide, compte par compte.
-- Cette PR pose le moteur et la page, sans aucune action : les propositions se
-- calculent et s'affichent, rien n'est créé, désactivé ni envoyé (PR 2).
--
-- LE CALENDRIER (heure de Paris). Les vues viennent du relevé de NUIT
-- (`rattrapage-elo`, à partir de minuit) : chaque post y est relevé les 3 nuits
-- qui suivent sa date, puis plus jamais. Les contrôles tournent donc le matin :
--   * jeudi 6 h  : check des comptes dans leur première semaine → des NUDGES
--     (réveil, à surveiller, discipline), jamais de kill ;
--   * samedi 6 h : kill, recréer ou doubler, sur les posts du lundi au vendredi.
--     Le posteur a le week-end pour créer un compte et lancer le warm-up, qui
--     finit toujours au lundi suivant le clic (0301).
--
-- LES RÈGLES (tous les chiffres sont des réglages, voir `ckd_reglages`) :
--   * jeudi : les 4 premiers posts d'un compte parti entre le vendredi d'avant
--     et le lundi. Réveil si au moins 3 sont relevés et qu'aucun n'atteint
--     `vues_min_j2` ; à surveiller s'il y a un post mort ; discipline s'il manque
--     un post ou un lien ;
--   * première semaine (samedi) : au moins `morts_premiere_semaine` posts morts
--     sur ses 5 premiers jours → Ne pas renouveler ;
--   * comptes anciens (samedi) : au moins `anciennete_semaines` de posts et
--     `posts_min_anciens` posts relevés sur les 28 jours qui finissent le
--     vendredi, aucun post au-dessus du seuil d'un bon post, médiane sous
--     `part_mediane_pays` de la médiane du pays → Recréer (Ne pas renouveler si
--     le posteur a déjà été recréé pour cette raison) ;
--   * doubler (samedi) : posteur à un seul compte actif, au moins
--     `bons_posts_doubler` bons posts du lundi au vendredi, au plus
--     `manques_max_doubler` posts manqués ou sans lien, doublement autorisé.
--     Le label du 2ᵉ compte viendra de la répartition existante (PR 2).
--   Exclus : comptes CM, comptes vidéo UGC, posters désactivés, comptes déjà
--   « ne pas renouveler », cohorte Ruul, et « Garder / Pas maintenant » pour la
--   même règle il y a moins de 14 jours.
--
-- LES RÉGLAGES marchent par niveaux : défaut, pays, label, pays + label ; le
-- plus précis gagne. Le seuil d'un bon post vaut par défaut celui des comment
-- masters du pays (`comment_master_pays.seuil_vues`).
--
-- À CÔTÉ : la tâche `metriques-soir` (17 h UTC) est désactivée. Elle s'arrêtait
-- après 9 à 20 comptes et payait Apify pour rien : le relevé de nuit couvre tout.
--
-- Retour arrière : `cron.unschedule('ckd-jeudi')`, `cron.unschedule('ckd-samedi')`,
-- drop des tables `ckd_*` et `hm_slack` et des fonctions `ckd_*`, puis
-- `cron.alter_job(<id de metriques-soir>, active := true)`.

set lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Réglages par niveaux
-- ---------------------------------------------------------------------------
create table if not exists public.ckd_reglages (
  id        uuid primary key default gen_random_uuid(),
  cle       text not null check (cle in (
              'seuil_bon_post', 'vues_min_j2', 'seuil_mort', 'morts_premiere_semaine',
              'age_min_heures', 'part_mediane_pays', 'anciennete_semaines', 'posts_min_anciens',
              'bons_posts_doubler', 'manques_max_doubler', 'doublement_autorise', 'comptes_min_mediane')),
  pays      text check (pays is null or pays ~ '^[A-Z]{2}$'),
  -- Pas de clé étrangère : `labels` est lu partout, un label supprimé laisse
  -- une exception orpheline sans effet.
  label_id  uuid,
  valeur    jsonb not null,
  maj_par   uuid,
  maj_at    timestamptz not null default now()
);

create unique index if not exists ckd_reglages_niveau
  on public.ckd_reglages (cle, coalesce(pays, ''), coalesce(label_id, '00000000-0000-0000-0000-000000000000'::uuid));

comment on table public.ckd_reglages is
  'Check, Kill or Double : réglages par niveaux (défaut, pays, label, pays + label ; le plus précis gagne). Voir 0326.';

create table if not exists public.ckd_reglages_journal (
  id        bigint generated always as identity primary key,
  cle       text not null,
  pays      text,
  label_id  uuid,
  ancienne  jsonb,
  nouvelle  jsonb,
  par       uuid,
  at        timestamptz not null default now()
);

-- Valeurs par défaut. `seuil_bon_post` à null = celui des comment masters.
insert into public.ckd_reglages (cle, pays, valeur)
select v.cle, v.pays, v.valeur
  from (values
    ('seuil_bon_post',          null::text, 'null'::jsonb),
    ('vues_min_j2',             null,       '200'),
    ('seuil_mort',              null,       '50'),
    ('morts_premiere_semaine',  null,       '3'),
    ('age_min_heures',          null,       '10'),
    ('part_mediane_pays',       null,       '0.6'),
    ('anciennete_semaines',     null,       '4'),
    ('posts_min_anciens',       null,       '20'),
    ('bons_posts_doubler',      null,       '3'),
    ('manques_max_doubler',     null,       '1'),
    ('doublement_autorise',     null,       'true'),
    ('doublement_autorise',     'PT',       'false'),
    ('doublement_autorise',     'RO',       'false'),
    ('comptes_min_mediane',     null,       '5')
  ) as v(cle, pays, valeur)
 where not exists (
   select 1 from public.ckd_reglages r
    where r.cle = v.cle and r.pays is not distinct from v.pays and r.label_id is null);

create or replace function public.ckd_reglages_avant_maj()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.maj_par := auth.uid();
  new.maj_at := now();
  return new;
end;
$$;

create or replace trigger ckd_reglages_avant_maj
  before insert or update on public.ckd_reglages
  for each row execute function public.ckd_reglages_avant_maj();

create or replace function public.ckd_reglages_journaliser()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.ckd_reglages_journal (cle, pays, label_id, ancienne, nouvelle, par)
    values (old.cle, old.pays, old.label_id, old.valeur, null, auth.uid());
    return old;
  end if;
  if tg_op = 'UPDATE' and new.valeur is not distinct from old.valeur then
    return new;
  end if;
  insert into public.ckd_reglages_journal (cle, pays, label_id, ancienne, nouvelle, par)
  values (new.cle, new.pays, new.label_id,
          case when tg_op = 'UPDATE' then old.valeur end, new.valeur, auth.uid());
  return new;
end;
$$;

create or replace trigger ckd_reglages_journal
  after insert or update or delete on public.ckd_reglages
  for each row execute function public.ckd_reglages_journaliser();

-- La valeur qui s'applique et d'où elle vient : pays + label, puis label, puis
-- pays, puis défaut.
create or replace function public.ckd_reglage(p_cle text, p_pays text, p_label uuid)
returns table (valeur jsonb, source text)
language sql
stable
set search_path = public
as $$
  select r.valeur,
         case when r.pays is not null and r.label_id is not null then 'pays_label'
              when r.label_id is not null then 'label'
              when r.pays is not null then 'pays'
              else 'defaut' end
    from public.ckd_reglages r
   where r.cle = p_cle
     and (r.pays is null or r.pays = p_pays)
     and (r.label_id is null or r.label_id = p_label)
   order by (r.pays is not null and r.label_id is not null) desc,
            (r.label_id is not null) desc,
            (r.pays is not null) desc
   limit 1;
$$;

-- Écrire ou retirer un réglage depuis la page. Valeur null sur un niveau
-- précis = retirer l'exception (on retombe sur le niveau au-dessus). Le défaut
-- ne se retire pas.
create or replace function public.ckd_regler(p_cle text, p_pays text, p_label uuid, p_valeur jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'ckd_regler : réservé à l''admin';
  end if;
  -- Un oui/non pour le doublement, un nombre positif pour le reste (une part
  -- entre 0 et 1 pour la médiane du pays).
  if p_valeur is not null and p_valeur <> 'null'::jsonb then
    if p_cle = 'doublement_autorise' and jsonb_typeof(p_valeur) <> 'boolean' then
      raise exception 'ckd_regler : % attend oui ou non', p_cle;
    end if;
    if p_cle <> 'doublement_autorise'
       and (jsonb_typeof(p_valeur) <> 'number' or (p_valeur #>> '{}')::numeric < 0) then
      raise exception 'ckd_regler : % attend un nombre positif', p_cle;
    end if;
    if p_cle = 'part_mediane_pays' and (p_valeur #>> '{}')::numeric > 1 then
      raise exception 'ckd_regler : % attend une part entre 0 et 1', p_cle;
    end if;
  end if;

  select r.id into v_id
    from public.ckd_reglages r
   where r.cle = p_cle and r.pays is not distinct from p_pays and r.label_id is not distinct from p_label;

  if p_valeur is null or (p_valeur = 'null'::jsonb and (p_pays is not null or p_label is not null)) then
    if p_pays is null and p_label is null then
      -- Seul `seuil_bon_post` accepte null au niveau défaut (= comment masters).
      if p_cle <> 'seuil_bon_post' then
        raise exception 'ckd_regler : la valeur par défaut de % ne se retire pas', p_cle;
      end if;
      update public.ckd_reglages set valeur = 'null'::jsonb where id = v_id;
      return;
    end if;
    delete from public.ckd_reglages where id = v_id;
    return;
  end if;

  if v_id is null then
    insert into public.ckd_reglages (cle, pays, label_id, valeur) values (p_cle, p_pays, p_label, p_valeur);
  else
    update public.ckd_reglages set valeur = p_valeur where id = v_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- ID Slack des HMs (le manager du poster dans l'OS)
-- ---------------------------------------------------------------------------
-- Pas de clé étrangère vers `profiles`, lue et écrite partout.
create table if not exists public.hm_slack (
  profile_id    uuid primary key,
  slack_user_id text check (slack_user_id is null or slack_user_id ~ '^[UW][A-Z0-9]{6,}$'),
  maj_par       uuid,
  maj_at        timestamptz not null default now()
);

comment on table public.hm_slack is
  'ID Slack des HMs (managers des posters), pour leur écrire depuis l''OS. Voir 0326.';

create or replace function public.hm_slack_avant_maj()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.maj_par := auth.uid();
  new.maj_at := now();
  return new;
end;
$$;

create or replace trigger hm_slack_avant_maj
  before insert or update on public.hm_slack
  for each row execute function public.hm_slack_avant_maj();

-- Ceux de la page Recrutements, puis ceux retrouvés dans Slack le 20/10.
-- « Sara B » (France) reste à confirmer : 3 « Sara » dans Slack.
insert into public.hm_slack (profile_id, slack_user_id)
select h.profile_id, h.slack_user_id
  from public.recrutement_hms h
 where h.profile_id is not null and h.slack_user_id ~ '^[UW][A-Z0-9]{6,}$'
on conflict (profile_id) do nothing;

insert into public.hm_slack (profile_id, slack_user_id)
select v.id, v.slack
  from (values
    ('7036791d-e2dd-4637-913c-247afc65d1b3'::uuid, 'U0BN41ZNGNS'), -- Lucia D
    ('77aef269-2432-4df7-be5b-84666b556f74'::uuid, 'U0BKT6SC8JE'), -- Regina N
    ('9b05fd3b-1124-4c09-ad39-d96fcc9e63ba'::uuid, 'U0BUX18ER44'), -- Rana Barakli
    ('1b9c219e-9e62-47df-9f4d-e2b1fb9a5cc2'::uuid, 'U0C6YV1U80G'), -- Nana Baghirova
    ('feadcf40-e449-4717-884f-5099ce31f772'::uuid, 'U0C7HD0NPDG'), -- Margherita Pilia
    ('e47ae922-d8c9-4b62-902d-8d6fd6e99d9f'::uuid, 'U0C7DLQB011'), -- Olizhia Mairuhu
    ('5a9f7d2b-d057-4f14-b6c2-f9f269b6b63e'::uuid, 'U0C61CLD82E'), -- Afaf Waali
    ('f1cf328a-8530-4348-815e-67c7b1249c3b'::uuid, 'U0C7MA95LE7'), -- Heema Savsani
    ('e328238b-b9d0-4dd8-bd27-dda46d7a9b34'::uuid, 'U0C1XD6N79S')  -- Erla Menaj
  ) as v(id, slack)
 where exists (select 1 from public.profiles p where p.id = v.id)
on conflict (profile_id) do nothing;

-- ---------------------------------------------------------------------------
-- Contrôles, propositions, recréations
-- ---------------------------------------------------------------------------
create table if not exists public.ckd_controles (
  id              uuid primary key default gen_random_uuid(),
  type            text not null check (type in ('jeudi', 'samedi')),
  -- Le jeudi ou le samedi du contrôle (date de Paris).
  jour            date not null,
  lance_at        timestamptz not null default now(),
  lance_par       uuid,
  nb_propositions integer not null default 0,
  unique (type, jour)
);

create table if not exists public.ckd_propositions (
  id            uuid primary key default gen_random_uuid(),
  controle_id   uuid not null references public.ckd_controles(id) on delete cascade,
  type          text not null check (type in ('jeudi', 'samedi')),
  jour          date not null,
  regle         text not null check (regle in ('jeudi', 'premiere_semaine', 'anciens', 'doubler')),
  action        text not null check (action in ('nudge', 'recreer', 'ne_pas_renouveler', 'doubler')),
  -- Pas de clé étrangère vers `comptes` ni `profiles` (tables très écrites).
  compte_id     uuid not null,
  poster_id     uuid not null,
  hm_id         uuid,
  pays          text,
  langue        text,
  label_id      uuid,
  application   text,
  -- La photo des chiffres qui ont déclenché la proposition.
  donnees       jsonb not null default '{}'::jsonb,
  -- La décision (PR 2). Tant qu'elle est vide, rien ne se passe.
  decision      text check (decision in ('nudge', 'recreer', 'ne_pas_renouveler', 'doubler',
                                         'garder', 'pas_maintenant', 'rien')),
  decision_par  uuid,
  decision_at   timestamptz,
  note          text,
  envoye_at     timestamptz,
  fait_at       timestamptz,
  created_at    timestamptz not null default now(),
  unique (compte_id, regle, jour)
);

create index if not exists ckd_propositions_controle on public.ckd_propositions (controle_id);

comment on table public.ckd_propositions is
  'Check, Kill or Double : une proposition par compte et par règle et par contrôle, avec la photo de ses chiffres. Voir 0326.';

create table if not exists public.ckd_recreations (
  id                uuid primary key default gen_random_uuid(),
  poster_id         uuid not null,
  ancien_compte_id  uuid not null,
  nouveau_compte_id uuid,
  regle             text not null,
  proposition_id    uuid,
  decide_par        uuid,
  created_at        timestamptz not null default now()
);

create index if not exists ckd_recreations_poster on public.ckd_recreations (poster_id);

comment on table public.ckd_recreations is
  'Historique des recréations de compte par posteur, avec la règle en cause (écrit par la PR 2). Voir 0326.';

-- ---------------------------------------------------------------------------
-- Calcul
-- ---------------------------------------------------------------------------

-- Les chiffres d'un compte sur une période : posts prévus, publiés, relevés,
-- morts, bons, médiane, moyenne, post le plus bas et le plus haut, liens
-- manquants, et la liste des posts. `p_limite` = les N premiers posts (J+2).
create or replace function public.ckd_detail(
  p_compte uuid, p_du date, p_au date,
  p_age_min numeric, p_seuil_mort numeric, p_seuil_bon numeric,
  p_limite integer default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  with p as (
    select x.id, x.date_publication_prevue as jour, x.vues, x.publie_url as url, x.created_at,
           round(extract(epoch from (x.stats_maj_at - coalesce(x.tiktok_publie_at, x.publie_at))) / 3600) as age_h,
           (x.publie_url is not null and x.vues is not null and x.stats_maj_at is not null
             and x.stats_maj_at - coalesce(x.tiktok_publie_at, x.publie_at)
                 >= p_age_min::double precision * interval '1 hour') as mesure
      from public.passages x
     where x.compte_id = p_compte
       and not coalesce(x.est_rappel, false)
       and x.statut <> 'brouillon'
       and x.date_publication_prevue between p_du and p_au
     order by x.date_publication_prevue, x.created_at
     limit p_limite
  )
  select jsonb_build_object(
    'du', p_du,
    'au', p_au,
    'attendus', count(*),
    'publies', count(*) filter (where url is not null),
    'mesures', count(*) filter (where mesure),
    'morts', count(*) filter (where mesure and vues < p_seuil_mort),
    'bons', count(*) filter (where mesure and vues >= p_seuil_bon),
    'mediane', round((percentile_cont(0.5) within group (order by vues) filter (where mesure))::numeric),
    'moyenne', round(avg(vues) filter (where mesure)),
    'bas', (select jsonb_build_object('vues', b.vues, 'url', b.url, 'jour', b.jour)
              from p b where b.mesure order by b.vues asc, b.jour limit 1),
    'haut', (select jsonb_build_object('vues', h.vues, 'url', h.url, 'jour', h.jour)
               from p h where h.mesure order by h.vues desc, h.jour limit 1),
    'liens_manquants', coalesce(jsonb_agg(jsonb_build_object('jour', jour) order by jour)
                                  filter (where url is null), '[]'::jsonb),
    'posts', coalesce(jsonb_agg(jsonb_build_object('jour', jour, 'vues', vues, 'url', url,
                                                   'mesure', mesure, 'age_h', age_h)
                                order by jour, created_at), '[]'::jsonb)
  )
  from p;
$$;

-- Le dernier jeudi (ou samedi) à la date donnée ou avant.
create or replace function public.ckd_jour_controle(p_type text, p_date date)
returns date
language sql
immutable
as $$
  select p_date - ((extract(isodow from p_date)::int
                    - case p_type when 'jeudi' then 4 else 6 end + 7) % 7);
$$;

-- Les propositions d'un contrôle, calculées sans rien écrire.
create or replace function public.ckd_calculer(p_type text, p_jour date)
returns table (
  regle       text,
  action      text,
  compte_id   uuid,
  poster_id   uuid,
  hm_id       uuid,
  pays        text,
  langue      text,
  label_id    uuid,
  application text,
  donnees     jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_lundi     date;
  v_vendredi  date;
  v_min       integer;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'ckd_calculer : réservé à l''admin';
  end if;
  if p_type not in ('jeudi', 'samedi') then
    raise exception 'ckd_calculer : type inconnu %', p_type;
  end if;

  -- Samedi : la semaine du lundi au vendredi. Jeudi : jusqu'au mercredi.
  v_lundi := p_jour - case p_type when 'samedi' then 5 else 3 end;
  v_vendredi := p_jour - 1;
  select coalesce((r.valeur #>> '{}')::integer, 5) into v_min
    from public.ckd_reglage('comptes_min_mediane', null, null) r;
  v_min := coalesce(v_min, 5);

  return query
  with
  base as (
    select c.id, c.poster_id, c.pays, c.langue, c.handle_tiktok, c.parts_applications,
           coalesce(c.non_renouveler, false) as non_renouveler,
           pr.manager_id as hm_id,
           exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id) as ruul
      from public.comptes c
      join public.profiles pr on pr.id = c.poster_id
     where c.is_active
       and coalesce(pr.is_active, true)
       and c.type_compte = 'perso'
       and not coalesce(c.ugc_ai_video, false)
       and not coalesce(c.videos_uniquement, false)
  ),
  -- Le label du compte : celui de la majorité de ses posts sur 28 jours.
  lab as (
    select b.id as compte_id,
           (select cl.label_id
              from public.compte_labels cl
              left join lateral (
                select count(*) as n
                  from public.passages p2
                  join public.contenu_labels x on x.contenu_id = p2.contenu_id and x.label_id = cl.label_id
                 where p2.compte_id = cl.compte_id
                   and p2.date_publication_prevue between v_vendredi - 27 and v_vendredi
              ) k on true
             where cl.compte_id = b.id
             order by k.n desc, cl.label_id
             limit 1) as label_id
      from base b
  ),
  cles as (
    select unnest(array[
      'seuil_bon_post', 'vues_min_j2', 'seuil_mort', 'morts_premiere_semaine', 'age_min_heures',
      'part_mediane_pays', 'anciennete_semaines', 'posts_min_anciens', 'bons_posts_doubler',
      'manques_max_doubler', 'doublement_autorise']) as cle
  ),
  reg as (
    select b.id as compte_id,
           jsonb_object_agg(k.cle, jsonb_build_object('v', r.valeur, 's', r.source)) as r
      from base b
      join lab l on l.compte_id = b.id
      cross join cles k
      left join lateral public.ckd_reglage(k.cle, b.pays, l.label_id) r on true
     group by b.id
  ),
  cpt as (
    select b.*, l.label_id, g.r,
           coalesce((g.r->'age_min_heures'->>'v')::numeric, 10) as age_min,
           coalesce((g.r->'seuil_mort'->>'v')::numeric, 50) as seuil_mort,
           coalesce((g.r->'seuil_bon_post'->>'v')::numeric, cm.seuil_vues, 5000) as seuil_bon,
           case when g.r->'seuil_bon_post'->>'v' is not null then g.r->'seuil_bon_post'->>'s'
                when cm.seuil_vues is not null then 'comment_masters'
                else 'repli' end as seuil_bon_source,
           public.application_principale(b.parts_applications) as application
      from base b
      join lab l on l.compte_id = b.id
      join reg g on g.compte_id = b.id
      left join lateral (
        select m.seuil_vues from public.comment_master_pays m
         where m.pays = b.pays order by (m.langue = b.langue) desc limit 1
      ) cm on true
  ),
  pp as (
    select x.compte_id, x.date_publication_prevue as jour, x.vues,
           (x.publie_url is not null and x.vues is not null and x.stats_maj_at is not null
             and x.stats_maj_at - coalesce(x.tiktok_publie_at, x.publie_at)
                 >= c.age_min::double precision * interval '1 hour') as mesure
      from public.passages x
      join cpt c on c.id = x.compte_id
     where not coalesce(x.est_rappel, false)
       and x.statut <> 'brouillon'
       and x.date_publication_prevue <= v_vendredi
  ),
  j0 as (select pp.compte_id, min(pp.jour) as j0 from pp group by pp.compte_id),
  -- Médianes de référence : posts relevés des 28 jours qui finissent le vendredi.
  m28 as (
    select pp.compte_id, pp.vues, c.pays, c.langue, c.label_id
      from pp join cpt c on c.id = pp.compte_id
     where pp.mesure and pp.jour between v_vendredi - 27 and v_vendredi
  ),
  med_pays as (
    select m.pays, percentile_cont(0.5) within group (order by m.vues) as med,
           count(distinct m.compte_id) as n
      from m28 m group by m.pays
  ),
  med_pays_label as (
    select m.pays, m.label_id, percentile_cont(0.5) within group (order by m.vues) as med,
           count(distinct m.compte_id) as n
      from m28 m group by m.pays, m.label_id
  ),
  med_langue as (
    select m.langue, percentile_cont(0.5) within group (order by m.vues) as med,
           count(distinct m.compte_id) as n
      from m28 m group by m.langue
  ),
  med_flotte as (
    select percentile_cont(0.5) within group (order by m.vues) as med,
           count(distinct m.compte_id) as n
      from m28 m
  ),
  ref as (
    select c.id as compte_id,
           case
             when (c.r->'part_mediane_pays'->>'s') in ('label', 'pays_label') and mpl.n >= v_min
               then jsonb_build_object('valeur', round(mpl.med), 'source', 'pays_label', 'n_comptes', mpl.n)
             when mp.n >= v_min
               then jsonb_build_object('valeur', round(mp.med), 'source', 'pays', 'n_comptes', mp.n)
             when ml.n >= v_min
               then jsonb_build_object('valeur', round(ml.med), 'source', 'langue', 'n_comptes', ml.n)
             else jsonb_build_object('valeur', round(mf.med), 'source', 'flotte', 'n_comptes', mf.n)
           end as mediane_ref
      from cpt c
      left join med_pays mp on mp.pays = c.pays
      left join med_pays_label mpl on mpl.pays = c.pays and mpl.label_id is not distinct from c.label_id
      left join med_langue ml on ml.langue = c.langue
      cross join med_flotte mf
  ),
  elig as (
    select c.*, j.j0
      from cpt c join j0 j on j.compte_id = c.id
     where not c.non_renouveler and not c.ruul
  ),
  cand as (
    select e.id, 'jeudi'::text as regle,
           public.ckd_detail(e.id, e.j0, v_vendredi, e.age_min, e.seuil_mort, e.seuil_bon, 4) as d
      from elig e
     where p_type = 'jeudi' and e.j0 between p_jour - 9 and p_jour - 3
    union all
    select e.id, 'premiere_semaine',
           public.ckd_detail(e.id, e.j0, e.j0 + 4, e.age_min, e.seuil_mort, e.seuil_bon)
      from elig e
     where p_type = 'samedi' and e.j0 between v_lundi - 6 and v_lundi
    union all
    select e.id, 'anciens',
           public.ckd_detail(e.id, v_vendredi - 27, v_vendredi, e.age_min, e.seuil_mort, e.seuil_bon)
      from elig e
     where p_type = 'samedi'
       and e.j0 <= v_vendredi - (7 * coalesce((e.r->'anciennete_semaines'->>'v')::integer, 4) - 1)
    union all
    select e.id, 'doubler',
           public.ckd_detail(e.id, v_lundi, v_vendredi, e.age_min, e.seuil_mort, e.seuil_bon)
      from elig e
     where p_type = 'samedi'
       and e.j0 <= v_lundi
       and coalesce((e.r->'doublement_autorise'->>'v')::boolean, true)
       and (select count(*) from public.comptes c2 where c2.poster_id = e.poster_id and c2.is_active) = 1
  ),
  mot as (
    select k.*, c.r,
           array_remove(array[
             case when (k.d->>'mesures')::int >= 3
                   and coalesce((k.d->'haut'->>'vues')::numeric, 0)
                       < coalesce((c.r->'vues_min_j2'->>'v')::numeric, 200) then 'reveil' end,
             case when (k.d->>'morts')::int >= 1
                   and not ((k.d->>'mesures')::int >= 3
                            and coalesce((k.d->'haut'->>'vues')::numeric, 0)
                                < coalesce((c.r->'vues_min_j2'->>'v')::numeric, 200)) then 'surveiller' end,
             case when (k.d->>'attendus')::int > (k.d->>'publies')::int then 'discipline' end
           ], null) as motifs
      from cand k join cpt c on c.id = k.id
     where k.regle = 'jeudi'
  ),
  dec as (
    select k.id, k.regle, k.d,
           case k.regle
             when 'jeudi' then
               case when cardinality(m.motifs) > 0 then 'nudge' end
             when 'premiere_semaine' then
               case when (k.d->>'morts')::int >= coalesce((c.r->'morts_premiere_semaine'->>'v')::numeric, 3)
                    then 'ne_pas_renouveler' end
             when 'anciens' then
               case when (k.d->>'mesures')::int >= coalesce((c.r->'posts_min_anciens'->>'v')::numeric, 20)
                     and coalesce((k.d->'haut'->>'vues')::numeric, 0) < c.seuil_bon
                     and (k.d->>'mediane')::numeric
                         < coalesce((c.r->'part_mediane_pays'->>'v')::numeric, 0.6) * (rf.mediane_ref->>'valeur')::numeric
                    then case when exists (select 1 from public.ckd_recreations x
                                            where x.poster_id = c.poster_id and x.regle = 'anciens')
                              then 'ne_pas_renouveler' else 'recreer' end end
             when 'doubler' then
               case when (k.d->>'bons')::int >= coalesce((c.r->'bons_posts_doubler'->>'v')::numeric, 3)
                     and (k.d->>'attendus')::int >= 1
                     and (k.d->>'attendus')::int - (k.d->>'publies')::int
                         <= coalesce((c.r->'manques_max_doubler'->>'v')::numeric, 1)
                    then 'doubler' end
           end as action,
           m.motifs
      from cand k
      join cpt c on c.id = k.id
      join ref rf on rf.compte_id = k.id
      left join mot m on m.id = k.id and m.regle = k.regle
  ),
  retenus as (
    select d.*,
           bool_or(d.action in ('recreer', 'ne_pas_renouveler')) over (partition by d.id) as a_un_kill
      from dec d
     where d.action is not null
       -- « Garder » ou « Pas maintenant » pour la même règle : rien pendant 14 jours.
       and not exists (
         select 1 from public.ckd_propositions o
          where o.compte_id = d.id and o.regle = d.regle
            and o.decision in ('garder', 'pas_maintenant')
            and o.decision_at > p_jour - 14)
  )
  select t.regle, t.action, c.id, c.poster_id, c.hm_id, c.pays, c.langue, c.label_id, c.application,
         jsonb_build_object(
           'handle', c.handle_tiktok,
           'abonnes', (select cp.abonnes from public.compte_profils cp where cp.compte_id = c.id),
           'j0', j.j0,
           'periode', t.d,
           'motifs', to_jsonb(coalesce(t.motifs, array[]::text[])),
           'mediane_ref', rf.mediane_ref,
           'seuil_bon_post', jsonb_build_object('valeur', c.seuil_bon, 'source', c.seuil_bon_source),
           'reglages', c.r,
           'recreations', (select count(*) from public.ckd_recreations x where x.poster_id = c.poster_id),
           'autres_comptes', coalesce((
             select jsonb_agg(jsonb_build_object('id', c2.id, 'handle', c2.handle_tiktok, 'actif', c2.is_active)
                              order by c2.is_active desc, c2.created_at)
               from public.comptes c2
              where c2.poster_id = c.poster_id and c2.id <> c.id), '[]'::jsonb)
         )
    from retenus t
    join cpt c on c.id = t.id
    join j0 j on j.compte_id = t.id
    join ref rf on rf.compte_id = t.id
   -- Un posteur qui sort aussi en kill n'est pas proposé au doublement.
   where not (t.regle = 'doubler' and t.a_un_kill);
end;
$$;

-- Le contrôle : calcule et enregistre les propositions. Les propositions déjà
-- décidées ne bougent pas ; les autres sont recalculées.
create or replace function public.ckd_controle(p_type text, p_jour date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jour date;
  v_ctrl uuid;
  v_n    integer;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'ckd_controle : réservé à l''admin';
  end if;
  v_jour := coalesce(p_jour, public.ckd_jour_controle(p_type, (now() at time zone 'Europe/Paris')::date));

  insert into public.ckd_controles as k (type, jour, lance_par)
  values (p_type, v_jour, auth.uid())
  on conflict (type, jour) do update set lance_at = now(), lance_par = excluded.lance_par
  returning k.id into v_ctrl;

  delete from public.ckd_propositions where controle_id = v_ctrl and decision is null;

  insert into public.ckd_propositions
    (controle_id, type, jour, regle, action, compte_id, poster_id, hm_id, pays, langue, label_id, application, donnees)
  select v_ctrl, p_type, v_jour, c.regle, c.action, c.compte_id, c.poster_id, c.hm_id, c.pays, c.langue,
         c.label_id, c.application, c.donnees
    from public.ckd_calculer(p_type, v_jour) c
  on conflict (compte_id, regle, jour) do nothing;

  select count(*) into v_n from public.ckd_propositions where controle_id = v_ctrl;
  update public.ckd_controles set nb_propositions = v_n where id = v_ctrl;
  return v_n;
end;
$$;

-- Pour le cron, qui passe à 4 h et 5 h UTC : ne tourne qu'à 6 h à Paris, été
-- comme hiver.
create or replace function public.ckd_controle_planifie(p_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if extract(hour from (now() at time zone 'Europe/Paris')) <> 6 then
    return;
  end if;
  perform public.ckd_controle(p_type, (now() at time zone 'Europe/Paris')::date);
end;
$$;

-- Part des posts au-dessus du seuil d'un bon post, par pays, sur 28 jours
-- (onglet Réglages : pour voir si un seuil est trop dur ou trop mou).
create or replace function public.ckd_part_bons_posts()
returns table (pays text, seuil numeric, source text, posts bigint, au_dessus bigint, mediane numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'ckd_part_bons_posts : réservé à l''admin';
  end if;
  return query
  with s as (
    select distinct c.pays,
           coalesce((select (r.valeur #>> '{}')::numeric from public.ckd_reglage('seuil_bon_post', c.pays, null) r),
                    (select m.seuil_vues from public.comment_master_pays m where m.pays = c.pays limit 1),
                    5000)::numeric as seuil,
           case when (select r.valeur #>> '{}' from public.ckd_reglage('seuil_bon_post', c.pays, null) r) is not null
                then (select r.source from public.ckd_reglage('seuil_bon_post', c.pays, null) r)
                else 'comment_masters' end as source
      from public.comptes c
     where c.is_active and c.pays is not null
  )
  select s.pays, s.seuil, s.source,
         count(p.id),
         count(p.id) filter (where p.vues >= s.seuil),
         round((percentile_cont(0.5) within group (order by p.vues))::numeric)
    from s
    join public.comptes c on c.pays = s.pays and c.is_active and c.type_compte = 'perso'
    join public.passages p on p.compte_id = c.id
   where p.vues is not null and p.publie_url is not null and not coalesce(p.est_rappel, false)
     and p.date_publication_prevue between (now() at time zone 'Europe/Paris')::date - 30
                                       and (now() at time zone 'Europe/Paris')::date - 3
   group by s.pays, s.seuil, s.source;
end;
$$;

-- Les HMs (managers des posters actifs), leur zone et leur ID Slack.
create or replace function public.ckd_hms()
returns table (profile_id uuid, nom text, zone text, posters bigint, slack_user_id text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'ckd_hms : réservé à l''admin';
  end if;
  return query
  select m.id, trim(coalesce(m.prenom, '') || ' ' || coalesce(m.nom, '')), m.zone_recrutement,
         count(distinct c.poster_id), s.slack_user_id
    from public.comptes c
    join public.profiles p on p.id = c.poster_id
    join public.profiles m on m.id = p.manager_id
    left join public.hm_slack s on s.profile_id = m.id
   where c.is_active
     and not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)
   group by m.id, m.prenom, m.nom, m.zone_recrutement, s.slack_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------
alter table public.ckd_reglages enable row level security;
alter table public.ckd_reglages_journal enable row level security;
alter table public.ckd_controles enable row level security;
alter table public.ckd_propositions enable row level security;
alter table public.ckd_recreations enable row level security;
alter table public.hm_slack enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['ckd_reglages', 'ckd_reglages_journal', 'ckd_controles', 'ckd_propositions',
                           'ckd_recreations', 'hm_slack'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t
                    and policyname = t || ' lecture admin') then
      execute format('create policy %I on public.%I for select to authenticated using ((select public.is_admin()))',
                     t || ' lecture admin', t);
    end if;
  end loop;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hm_slack'
                  and policyname = 'hm_slack ecriture admin') then
    create policy "hm_slack ecriture admin" on public.hm_slack
      for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;
end $$;

revoke all on public.ckd_reglages, public.ckd_reglages_journal, public.ckd_controles,
              public.ckd_propositions, public.ckd_recreations, public.hm_slack from anon, authenticated;
grant select on public.ckd_reglages, public.ckd_reglages_journal, public.ckd_controles,
                public.ckd_propositions, public.ckd_recreations, public.hm_slack to authenticated;
-- La page enregistre ou vide un ID (upsert) ; elle ne supprime pas de ligne.
grant insert, update on public.hm_slack to authenticated;
grant all on public.ckd_reglages, public.ckd_reglages_journal, public.ckd_controles,
             public.ckd_propositions, public.ckd_recreations, public.hm_slack to service_role;

revoke all on function public.ckd_calculer(text, date) from public, anon;
revoke all on function public.ckd_controle(text, date) from public, anon;
revoke all on function public.ckd_controle_planifie(text) from public, anon, authenticated;
revoke all on function public.ckd_regler(text, text, uuid, jsonb) from public, anon;
revoke all on function public.ckd_part_bons_posts() from public, anon;
revoke all on function public.ckd_hms() from public, anon;
grant execute on function public.ckd_calculer(text, date) to authenticated, service_role;
grant execute on function public.ckd_controle(text, date) to authenticated, service_role;
grant execute on function public.ckd_controle_planifie(text) to service_role;
grant execute on function public.ckd_regler(text, text, uuid, jsonb) to authenticated, service_role;
grant execute on function public.ckd_part_bons_posts() to authenticated, service_role;
grant execute on function public.ckd_hms() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tâches planifiées (UTC ; la fonction ne tourne qu'à 6 h à Paris)
-- ---------------------------------------------------------------------------
do $$
declare
  v_id bigint;
begin
  if exists (select 1 from cron.job where jobname = 'ckd-jeudi') then
    perform cron.unschedule('ckd-jeudi');
  end if;
  perform cron.schedule('ckd-jeudi', '0 4,5 * * 4', 'select public.ckd_controle_planifie(''jeudi'')');

  if exists (select 1 from cron.job where jobname = 'ckd-samedi') then
    perform cron.unschedule('ckd-samedi');
  end if;
  perform cron.schedule('ckd-samedi', '0 4,5 * * 6', 'select public.ckd_controle_planifie(''samedi'')');

  -- La tâche de 17 h : coupée, pas supprimée (réactivable).
  select jobid into v_id from cron.job where jobname = 'metriques-soir';
  if v_id is not null then
    perform cron.alter_job(v_id, active := false);
  end if;
end $$;

notify pgrst, 'reload schema';
