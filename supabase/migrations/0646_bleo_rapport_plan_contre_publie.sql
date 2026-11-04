-- 0646 : BLEO, le rapport de 22 h compare le plan à ce qui a été servi et publié (D50).
--
-- Depuis la bascule (1/11), le rapport comparait encore le plan à l'ancien système
-- (`passages.bras is null`) : le 3/11, il n'a comparé qu'un seul compte, et sa porte
-- « valeur du plan au-dessus de minuit » ne voulait plus rien dire. Il lisait aussi le
-- dernier run fini du jour même s'il avait été remplacé (`erreur` non nulle) ; minuit,
-- lui, prend le dernier run fini SANS erreur.
--
-- Le rapport du jour J (22 h) dit maintenant :
--   * execution : les créneaux du plan (hors rappels) servis tels quels (même compte,
--     même contenu), les posts BLEO hors plan sur les comptes du plan (remplacements de
--     la journée, D49), les posts de la tierlist (`bras = 'temoin'`), les posts hors
--     BLEO (`bras` vide : voie UGC, assignations à la main), les créneaux non servis
--     (rappels compris dans le quota ; comptes arrêtés ou bloqués à part : inactif, recrue
--     rouge pas décidée, demande d'arrêt ouverte ; les comptes sans aucun post listés), et
--     les publiés à l'heure du rapport ;
--   * infractions : sur les posts réellement posés ce jour (hors rappels), le même
--     contenu sur le compte à moins de `meme_contenu_jours`, le même thème à moins de
--     `meme_famille_jours`, la même couverture (8 bits près) à moins de
--     `meme_couverture_jours`. Une infraction couverte par le repli déclaré au plan
--     compte à part (`declarees`), comme celles des posts hors BLEO (`hors_bleo`) ;
--   * mix_reel et valeurs : la catégorie et la valeur du jour des posts réels, contre
--     celles du plan ;
--   * portes : celles du plan (inchangées), plus `plan_servi` (au plus 1 % des créneaux
--     non servis hors comptes bloqués : une recrue reportée dans la journée perd ses posts), `aucune_tierlist` et `aucune_repetition` (aucune infraction
--     non déclarée sur un post BLEO). La porte `valeur_plan_superieure` disparaît.
--
-- Retour arrière : réappliquer la définition de `bleo_rapport` d'avant (0642).

create or replace function public.bleo_rapport(p_jour date default null)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  reg jsonb;
  v_jour date := coalesce(p_jour, (now() at time zone 'Europe/Paris')::date);
  v_run uuid;
  v_resume jsonb;
  v_rapport jsonb;
  v_creneaux numeric;
  v_portes jsonb;
  v_j_contenu integer;
  v_j_theme integer;
  v_j_couverture integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'bleo : réservé aux admins' using errcode = '42501';
  end if;
  select valeur into reg from reglages where cle = 'bleo';
  v_j_contenu := (reg->'garde_fous'->>'meme_contenu_jours')::int;
  v_j_theme := (reg->'garde_fous'->>'meme_famille_jours')::int;
  v_j_couverture := (reg->'garde_fous'->>'meme_couverture_jours')::int;

  -- Le plan que minuit a suivi : le dernier run fini sans erreur (un run remplacé ou
  -- un essai porte une erreur).
  select id, resume into v_run, v_resume from bleo_runs
   where jour_vise = v_jour and fini_le is not null and erreur is null
   order by demarre_le desc limit 1;
  if v_run is null then
    return jsonb_build_object('jour', v_jour, 'erreur', 'aucun plan BLEO pour ce jour');
  end if;

  with plan as materialized (
    select o.compte_id, o.contenu_id, o.langue, o.file_bleo, o.categorie, o.relache
      from bleo_ombre_passages o
     where o.run_id = v_run and o.file_bleo in ('juger', 'valeur') and o.contenu_id is not null
  ),
  reel as materialized (
    select p.id, p.compte_id, p.contenu_id, p.langue, p.bras, p.statut,
           c.etat_bleo, c.couverture_empreinte as couv,
           coalesce(f.theme_id, c.famille_id) as theme,
           case when coalesce(c.verdict, 'en_attente') = 'en_attente' and f.verdict = 'gagnante'
                then 'gagnant' else c.verdict end as verdict,
           (select pl.relache from plan pl where pl.compte_id = p.compte_id and pl.contenu_id = p.contenu_id limit 1) as relache,
           exists (select 1 from plan pl where pl.compte_id = p.compte_id and pl.contenu_id = p.contenu_id) as au_plan
      from passages p
      join contenus c on c.id = p.contenu_id
      left join bleo_familles f on f.id = c.famille_id
     where p.date_publication_prevue = v_jour and not coalesce(p.est_rappel, false)
  ),
  hist as materialized (
    select h.id, h.compte_id, h.contenu_id, h.date_publication_prevue as jour,
           c.couverture_empreinte as couv, coalesce(f.theme_id, c.famille_id) as theme
      from passages h
      join contenus c on c.id = h.contenu_id
      left join bleo_familles f on f.id = c.famille_id
     where h.compte_id in (select compte_id from reel)
       and h.date_publication_prevue between v_jour - (greatest(v_j_contenu, v_j_theme, v_j_couverture) - 1) and v_jour
  ),
  bloques as materialized (
    select co.id as compte_id
      from comptes co
     where co.id in (select compte_id from plan)
       and (not co.is_active
            or exists (select 1 from recrues_rouges r where r.poster_id = co.poster_id and r.decision is null
                                                         and r.etape in ('acces', 'tiktok', 'warmup'))
            or exists (select 1 from demandes_arret d where d.poster_id = co.poster_id and d.decision is null))
  ),
  par_compte as (
    -- Le quota se compte rappels compris : un rappel posé à minuit prend un créneau du plan.
    select k.compte_id,
           (select count(*) from bleo_ombre_passages o where o.run_id = v_run and o.compte_id = k.compte_id) as n_plan,
           (select count(*) from passages p where p.compte_id = k.compte_id and p.date_publication_prevue = v_jour) as n_reel,
           (select count(*) from plan pl where pl.compte_id = k.compte_id
               and exists (select 1 from reel r where r.compte_id = pl.compte_id and r.contenu_id = pl.contenu_id)) as n_au_plan,
           k.compte_id in (select compte_id from bloques) as bloque
      from (select distinct compte_id from plan) k
  ),
  qual as (
    select r.*,
           exists (select 1 from hist h where h.compte_id = r.compte_id and h.contenu_id = r.contenu_id and h.id <> r.id
                     and h.jour > v_jour - v_j_contenu) as meme_contenu,
           (r.theme is not null and exists (
              select 1 from hist h where h.compte_id = r.compte_id and h.theme = r.theme and h.contenu_id <> r.contenu_id
                and h.jour > v_jour - v_j_theme)) as meme_theme,
           (length(r.couv) = 16 and exists (
              select 1 from hist h where h.compte_id = r.compte_id and h.id <> r.id and h.contenu_id <> r.contenu_id
                and h.jour > v_jour - v_j_couverture and length(h.couv) = 16
                and bit_count(('x' || h.couv)::bit(64) # ('x' || r.couv)::bit(64)) <= 8)) as meme_couverture
      from reel r
  ),
  inf as (
    select q.*,
           (q.meme_contenu and coalesce(q.relache, '') <> 'tout')
           or (q.meme_theme and coalesce(q.relache, '') not in ('budget+couverture+famille', 'hors_file', 'tout'))
           or (q.meme_couverture and coalesce(q.relache, '') not in ('budget+couverture', 'budget+couverture+famille', 'hors_file', 'tout'))
             as non_declaree
      from qual q
     where q.meme_contenu or q.meme_theme or q.meme_couverture
  )
  select jsonb_build_object(
    'jour', v_jour,
    'execution', jsonb_build_object(
      'creneaux_plan', (select count(*) from plan),
      'comptes_plan', (select count(*) from par_compte),
      'servis_au_plan', (select coalesce(sum(n_au_plan), 0) from par_compte),
      'remplaces_bleo', (select count(*) from reel r where r.bras = 'bleo' and not r.au_plan
                                                       and r.compte_id in (select compte_id from plan)),
      'bleo_hors_plan', (select count(*) from reel r where r.bras = 'bleo' and r.compte_id not in (select compte_id from plan)),
      'tierlist', (select count(*) from reel r where r.bras = 'temoin'),
      'hors_bleo', (select count(*) from reel r where r.bras is null),
      'non_servis', (select coalesce(sum(greatest(n_plan - n_reel, 0)), 0) from par_compte where not bloque),
      'non_servis_comptes_bloques', (select coalesce(sum(greatest(n_plan - n_reel, 0)), 0) from par_compte where bloque),
      'comptes_bloques', (select count(*) from bloques),
      -- Les comptes du plan sans aucun post ce jour, hors comptes bloqués (20 au plus) : une
      -- recrue reportée dans la journée perd ses posts, une panne de minuit aussi.
      'comptes_sans_post', (select coalesce(jsonb_agg(compte_id order by compte_id), '[]'::jsonb) from (
                              select compte_id from par_compte where n_reel = 0 and not bloque order by compte_id limit 20) z),
      'posts', (select count(*) from reel),
      'publies', (select count(*) from reel where statut = 'publie')
    ),
    'valeur_plan', (select round(sum(coalesce(bleo_valeur_au_jour(contenu_id, langue, v_jour), 0)), 1) from plan),
    'valeur_reel', (select round(sum(coalesce(bleo_valeur_au_jour(contenu_id, langue, v_jour), 0)), 1) from reel),
    'passages_plan', (select count(*) from plan),
    'passages_reel', (select count(*) from reel),
    'couples_identiques', (select count(*) from reel where au_plan),
    'mix_reel', (select jsonb_object_agg(cat, n) from (
                   select case when r.etat_bleo is distinct from 'juge' then 'juger'
                               when r.verdict = 'gagnant' and not s.servi then 'recolte'
                               when r.verdict = 'gagnant' then 'gagnant_servi'
                               when not s.servi then 'non_gagnant_neuve'
                               else 'non_gagnant_servie' end as cat, count(*) as n
                     from reel r
                     cross join lateral (select exists (select 1 from passages p2 where p2.contenu_id = r.contenu_id
                                                          and p2.langue = r.langue and p2.date_publication_prevue < v_jour) as servi) s
                    group by 1) z),
    'infractions', jsonb_build_object(
      'meme_contenu', (select count(*) from inf where meme_contenu and non_declaree and bras = 'bleo'),
      'meme_theme', (select count(*) from inf where meme_theme and non_declaree and bras = 'bleo'),
      'meme_couverture', (select count(*) from inf where meme_couverture and non_declaree and bras = 'bleo'),
      'declarees', (select count(*) from inf where not non_declaree and bras = 'bleo'),
      'hors_bleo', (select count(*) from inf where bras is distinct from 'bleo'),
      'relaches_declares', (select count(*) from plan where relache is not null)
    )
  ) into v_rapport;

  v_creneaux := greatest((v_resume->>'creneaux')::numeric, 1);
  v_portes := jsonb_build_object(
    'quota', round((v_resume->>'comptes_complets')::numeric / greatest((v_resume->>'comptes')::numeric, 1), 4)
             >= (reg->'ombre'->>'quota_min')::numeric,
    'aucun_creneau_vide', (v_resume->>'creneaux_vides')::int = 0,
    'part_juger', round(coalesce((v_resume->'par_file'->>'juger')::numeric, 0) / v_creneaux, 3),
    'part_juger_ok', coalesce((v_resume->'par_file'->>'juger')::numeric, 0) / v_creneaux
                     between (reg->'ombre'->>'juger_min')::numeric and (reg->'ombre'->>'juger_max')::numeric,
    'part_non_gagnants', round((coalesce((v_resume->'par_categorie'->>'non_gagnant_neuve')::numeric, 0)
                               + coalesce((v_resume->'par_categorie'->>'non_gagnant_servie')::numeric, 0)) / v_creneaux, 3),
    'part_recolte', round(coalesce((v_resume->'par_categorie'->>'recolte')::numeric, 0) / v_creneaux, 3),
    'tests_recents_complets', (v_resume->>'testables_recents_complets')::int >= (v_resume->>'testables_recents')::int,
    'fini_avant', (select (fini_le at time zone 'Europe/Paris')::time <= (reg->'ombre'->>'fin_tirage')::time
                     from bleo_runs where id = v_run),
    -- Au plus 1 % des créneaux du plan non servis, hors comptes bloqués.
    'plan_servi', (v_rapport->'execution'->>'non_servis')::int
                  <= greatest(1, floor(0.01 * (v_rapport->'execution'->>'creneaux_plan')::numeric)),
    'aucune_tierlist', (v_rapport->'execution'->>'tierlist')::int = 0,
    'aucune_repetition', (v_rapport->'infractions'->>'meme_contenu')::int
                         + (v_rapport->'infractions'->>'meme_theme')::int
                         + (v_rapport->'infractions'->>'meme_couverture')::int = 0
  );
  v_portes := v_portes || jsonb_build_object(
    'non_gagnants_ok', (v_portes->>'part_non_gagnants')::numeric <= (reg->'ombre'->>'non_gagnants_max')::numeric,
    'recolte_ok', (v_portes->>'part_recolte')::numeric >= (reg->'ombre'->>'recolte_min')::numeric
  );
  v_rapport := v_rapport || jsonb_build_object('portes', v_portes, 'run_id', v_run, 'calcule_le', now());
  update bleo_runs set resume = resume || jsonb_build_object('rapport', v_rapport) where id = v_run;
  return v_rapport;
end;
$function$;

comment on function public.bleo_rapport(date) is
  'BLEO (0646, D50) : le rapport de 22 h du plan suivi par minuit (dernier run fini sans erreur) contre ce qui a été servi et publié ce jour : exécution du plan, répétitions réelles, mix et valeurs, portes.';
