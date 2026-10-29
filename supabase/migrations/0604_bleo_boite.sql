-- 0604 : BLEO, la boîte et la jauge des podz (docs/bleo.md, A9 et A10 ; début du lot L4).
--
-- AJOUT SEULEMENT, en lecture pour tout le monde sauf BLEO : deux vues et la
-- fermeture des familles (colonnes `close`, `close_le` de `bleo_familles`). Les
-- podz ne lisent rien de tout ça tant que leur guichet et leurs routines ne sont
-- pas passés à BLEO (reste du lot L4).
--
--   bleo_fermer_familles()  A9 : une famille gagnante est close quand le r médian
--                           des passages mûrs de sa dernière génération passe sous
--                           1, sur au moins 4 passages. Appelée par la nuit.
--   bleo_boite              A9 : ce que chaque podz de la voie 1 peut décliner,
--                           dans l'ordre (jamais déclinées d'abord, puis verdict
--                           le plus récent).
--   bleo_jauge              A10 : semaines de boîte et part de full test du jour.
--
-- Écart assumé : `par_jour` est mesuré (originaux déposés sur 7 jours), pas lu
-- dans pods/rythme.json, qui ne vit que dans le dépôt.

set lock_timeout = '5s';

create or replace function public.bleo_fermer_familles()
returns integer
language plpgsql
set search_path to 'public'
as $$
declare
  reg jsonb;
  n integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'bleo : réservé aux admins' using errcode = '42501';
  end if;
  select valeur into reg from reglages where cle = 'bleo';
  with gen as (
    select c.famille_id, max(c.generation) as gmax
      from contenus c join bleo_familles f on f.id = c.famille_id
     where c.statut = 'valide' and f.verdict = 'gagnante' and not f.close
     group by c.famille_id
  ),
  mes as (
    select g.famille_id, count(*) as n,
           percentile_cont(0.5) within group (order by least(p.r, (reg->'mesure'->>'r_plafond')::numeric)) as med
      from gen g
      join contenus c on c.famille_id = g.famille_id and c.generation = g.gmax and c.statut = 'valide'
      join passages p on p.contenu_id = c.id
     where p.statut = 'publie' and not coalesce(p.est_rappel, false) and p.r is not null
       and p.publie_at <= now() - make_interval(hours => (reg->'mesure'->>'maturite_heures')::int)
     group by g.famille_id
  )
  update bleo_familles f
     set close = true, close_le = now()
    from mes
   where mes.famille_id = f.id
     and mes.n >= (reg->'boite'->>'fermeture_min_passages')::int
     and mes.med < (reg->'boite'->>'fermeture_r_median')::numeric;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace view public.bleo_boite
  with (security_invoker = true)
as
  with reg as (select valeur from public.reglages where cle = 'bleo'),
  fam as (
    select f.*
      from public.bleo_familles f
      join public.labels l on l.id = f.label_id
     where f.verdict = 'gagnante' and not f.close and l.voie = 1
  ),
  -- Déclinaisons déjà faites d'un parent : contenus (hors rejetés) et livraisons en attente.
  enfants as (
    select parent, count(*) as n from (
      select c.parent_bleo_id as parent from public.contenus c
       where c.parent_bleo_id is not null and c.statut <> 'rejete'
      union all
      select pl.parent_contenu_id from public.pod_livraisons pl
       where pl.parent_contenu_id is not null and pl.statut = 'a_valider'
    ) z group by parent
  ),
  -- Passages des 7 derniers jours (budget de famille, A8).
  sept as (
    select c.famille_id, cl.label_id
      from public.passages p
      join public.contenus c on c.id = p.contenu_id
      join public.contenu_labels cl on cl.contenu_id = p.contenu_id
     where p.date_publication_prevue between (now() at time zone 'Europe/Paris')::date - 6
                                         and (now() at time zone 'Europe/Paris')::date
       and not coalesce(p.est_rappel, false)
  ),
  budget as (
    select fam.id as famille_id,
           (select count(*) from sept s where s.famille_id = fam.id)
             >= greatest((reg.valeur->'garde_fous'->>'budget_plancher')::numeric,
                         (reg.valeur->'garde_fous'->>'budget_famille')::numeric
                           * (select count(*) from sept s where s.label_id = fam.label_id)) as au_budget
      from fam, reg
  ),
  g1 as (
    select fam.label_id, fam.id as famille_id, 'g1'::text as sorte, fam.racine_contenu_id as parent_contenu_id,
           coalesce((select n from enfants e where e.parent = fam.racine_contenu_id), 0) as faites, fam.verdict_le
      from fam
  ),
  g2 as (
    select fam.label_id, fam.id as famille_id, 'g2'::text as sorte, c.id as parent_contenu_id,
           coalesce((select n from enfants e where e.parent = c.id), 0) as faites, fam.verdict_le
      from fam
      join public.contenus c on c.famille_id = fam.id and c.generation = 1 and c.statut = 'valide'
                            and c.verdict = 'gagnant'
  ),
  tout as (
    select * from g1
    union all
    select * from g2 where (select (valeur->'boite'->>'generation_max')::int from reg) >= 2
  )
  select t.label_id, t.famille_id,
         coalesce(f.accroche_norm, pc.titre) as accroche,
         t.sorte, t.parent_contenu_id, t.faites, t.verdict_le,
         b.au_budget,
         row_number() over (partition by t.label_id
                            order by (select count(*) from public.contenus c2
                                       where c2.famille_id = t.famille_id and c2.generation > 0) = 0 desc,
                                     t.verdict_le desc nulls last, t.sorte, t.parent_contenu_id) as rang
    from tout t
    join public.bleo_familles f on f.id = t.famille_id
    left join public.contenus pc on pc.id = t.parent_contenu_id
    join budget b on b.famille_id = t.famille_id
   where t.faites < (select (valeur->'boite'->>'declinaisons_par_parent')::int from reg);
comment on view public.bleo_boite is
  'BLEO (A9) : les déclinaisons possibles de chaque label de la voie 1, rang 1 = la première à faire.';

create or replace view public.bleo_jauge
  with (security_invoker = true)
as
  with reg as (select valeur from public.reglages where cle = 'bleo'),
  boite as (select label_id, count(distinct famille_id) as n from public.bleo_boite group by label_id),
  livr as (
    select pod, count(*) / 7.0 as par_jour
      from public.pod_livraisons
     where type = 'original' and created_at >= now() - interval '7 days'
     group by pod
  ),
  j as (
    select p.label_id, p.slug as pod, coalesce(b.n, 0) as familles_en_boite,
           round(coalesce(l.par_jour, 0), 2) as par_jour,
           case when coalesce(l.par_jour, 0) > 0 then round(coalesce(b.n, 0) / (l.par_jour * 7 / 3), 1) end as semaines
      from public.pods p
      join public.labels lab on lab.id = p.label_id and lab.voie = 1
      left join boite b on b.label_id = p.label_id
      left join livr l on l.pod = p.slug
     where p.actif
  )
  select j.label_id, j.pod, j.familles_en_boite, j.par_jour, j.semaines,
         case when j.semaines is null then null
              when j.semaines > (reg.valeur->'jauge'->'seuils_semaines'->>0)::numeric then (reg.valeur->'jauge'->'parts'->>0)::numeric
              when j.semaines >= (reg.valeur->'jauge'->'seuils_semaines'->>1)::numeric then (reg.valeur->'jauge'->'parts'->>1)::numeric
              when j.semaines >= (reg.valeur->'jauge'->'seuils_semaines'->>2)::numeric then (reg.valeur->'jauge'->'parts'->>2)::numeric
              else (reg.valeur->'jauge'->'parts'->>3)::numeric end as part_full_test
    from j, reg;
comment on view public.bleo_jauge is
  'BLEO (A10) : semaines de boîte (familles en boîte ÷ (livraisons par jour × 7 ÷ 3)) et part de full test de chaque podz de la voie 1.';

grant select on public.bleo_boite to authenticated, service_role;
grant select on public.bleo_jauge to authenticated, service_role;

-- La nuit ferme les familles après ses calculs.
create or replace function public.bleo_nuit_cron()
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_paris timestamp := now() at time zone 'Europe/Paris';
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_mode text;
  elo jsonb;
  v_releve_fini boolean;
  v_resume jsonb;
  v_closes integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'bleo : réservé aux admins' using errcode = '42501';
  end if;
  select valeur->>'mode' into v_mode from reglages where cle = 'bleo';
  if coalesce(v_mode, 'off') = 'off' then
    return jsonb_build_object('ignore', 'mode off');
  end if;
  if extract(hour from v_paris) <> 5 then
    return jsonb_build_object('ignore', 'hors heure');
  end if;
  if exists (select 1 from bleo_nuits where jour = v_jour and fini_le is not null) then
    return jsonb_build_object('jour', v_jour, 'deja', true);
  end if;
  select valeur into elo from reglages where cle = 'elo_dernier_run';
  v_releve_fini := coalesce((elo->>'done')::boolean, false) and elo->'snapshot'->>'jour' = v_jour::text;
  if not v_releve_fini and extract(minute from v_paris) < 45 then
    return jsonb_build_object('attente', 'relevé de nuit pas fini');
  end if;
  v_resume := public.bleo_nuit(false);
  v_closes := public.bleo_fermer_familles();
  v_resume := v_resume || jsonb_build_object('releve_fini', v_releve_fini, 'familles_closes', v_closes);
  update bleo_nuits set resume = v_resume where jour = v_jour;
  return v_resume;
end;
$$;
