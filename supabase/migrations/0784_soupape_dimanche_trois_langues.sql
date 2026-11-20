-- 0784 : la soupape des langues passe au dimanche soir, par lots de trois
-- (décisions d'Adrien du 20/11).
--
-- AVANT (0722, 0781). Chaque nuit à 4 h 40, UNE langue de plus par podz, la
-- même pour tous : celle où l'on a le plus recruté. Le 20/11 elle proposait le
-- hongrois à 9 podz sur 13, qui se seraient disputé les mêmes comptes. Et elle
-- attendait que toutes les langues du podz aient un compte.
--
-- MAINTENANT :
--   * LE DIMANCHE SOIR (20 h, Paris), pour la semaine qui vient ; plus chaque
--     nuit. Le podz prépare et rattrape le lundi (un jour suffit).
--   * JUSQU'À TROIS LANGUES d'un coup par podz, SELON SA PERFORMANCE, un peu
--     mais pas trop (Adrien, 20/11 : Dorian à 0,15 sur 9 posts ou Milly sans
--     aucun post ne doivent pas recevoir trois langues). La performance du
--     label face à la flotte est LISSÉE vers 1 par `lissage` (10) posts
--     fictifs, pour qu'un podz jeune ne soit pas jugé sur trois posts :
--       lissée ≥ 1,00 : 3 langues · ≥ 0,75 : 2 · ≥ 0,50 : 1 · en dessous : 0.
--     Moins de `posts_min` (5) posts mesurés : aucune (il a déjà ses langues
--     de départ). Un label tenu « Ouvert » n'a plus de passe-droit ici.
--   * La performance est celle du label DANS SON APPLICATION (avant : toujours
--     Sophia, donc that_girl_study, qui sert micabo, n'était jamais mesuré).
--   * PLUS DE CONDITION « toutes les langues ont un compte » : elle reste
--     affichée (`pleines`), elle ne bloque plus.
--   * LES LANGUES SONT RÉPARTIES entre les podz. Une langue ne s'ouvre, dans un
--     même passage, qu'à autant de podz qu'elle peut nourrir : un podz pour
--     `recrues_par_ouverture` (6) comptes recrutés dans cette langue en 14
--     jours (au moins un). Les podz choisissent tour à tour, le label le plus
--     performant d'abord, chacun prenant la langue la plus recrutée qui lui
--     reste. Deux podz d'un même label ne reçoivent pas la même langue.
--   * Les langues exclues ne changent pas (ar, he, fa, ur, ja).
--
--   * `jours_entre` vaut 1 : le rendez-vous hebdomadaire suffit à espacer, ce
--     délai n'évite plus qu'un double passage le même jour. (À 6, les
--     ouvertures de l'ancienne soupape du vendredi 20/11 auraient bloqué le
--     premier dimanche.)
--
-- ✅ Appliquée le 2026-11-20 (MCP), après deux passages à blanc en base. Vérifié
-- après : tâche planifiée « 0 19 * * 0 », réglages en place, la fonction répond
-- à blanc.
--
-- Chaque ouverture passe par `podz_langue` (0781) et va au journal. Adrien et
-- Max ouvrent et ferment toujours quand ils veulent (page Podz).
--
-- Le type de retour ne change pas : une ligne par langue proposée (jusqu'à
-- trois par podz), ou une ligne sans langue avec la raison.
--
-- Réglages : `reglages.bleo.soupape_langues` (par_lot 3, recrues_par_ouverture
-- 6, jours_entre 1, lissage 10, posts_min 5, paliers [1.0, 0.75, 0.5], exclues).
-- Retour arrière : réappliquer la fonction de 0781/0783 ; `select
-- cron.alter_job(<id de bleo-soupape-langues>, schedule := '40 3 * * *')` ;
-- remettre `jours_entre` à 1.

set lock_timeout = '5s';

update public.reglages
   set valeur = jsonb_set(valeur, '{soupape_langues}',
         coalesce(valeur->'soupape_langues', '{}'::jsonb)
           || '{"par_lot": 3, "recrues_par_ouverture": 6, "jours_entre": 1, "lissage": 10, "posts_min": 5, "paliers": [1.0, 0.75, 0.5]}'::jsonb, true),
       updated_at = now()
 where cle = 'bleo';

create or replace function public.bleo_ouvrir_langues_podz(p_appliquer boolean default false)
returns table (pod text, label text, pleines boolean, perf numeric, posts integer, derniere_ouverture timestamptz,
               langue_proposee text, ouverte boolean, raison text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  cfg jsonb := coalesce((select valeur->'soupape_langues' from reglages where cle = 'bleo'), '{}'::jsonb);
  v_posts_min integer := coalesce((cfg->>'posts_min')::integer, 5);
  v_lissage numeric := greatest(coalesce((cfg->>'lissage')::numeric, 10), 0);
  -- Les paliers de performance lissée : le 1er donne `par_lot` langues, puis une de moins à chaque palier.
  v_paliers numeric[] := coalesce(array(select jsonb_array_elements_text(cfg->'paliers')::numeric), array[1.0, 0.75, 0.5]);
  v_jours integer := coalesce((cfg->>'jours_entre')::integer, 1);
  v_lot integer := greatest(coalesce((cfg->>'par_lot')::integer, 3), 1);
  v_par integer := greatest(coalesce((cfg->>'recrues_par_ouverture')::integer, 6), 1);
  v_exclues text[] := coalesce(array(select lower(jsonb_array_elements_text(cfg->'exclues'))), array['ar','he','fa','ur','ja']);
  -- Ce qu'il reste à ouvrir de chaque langue dans ce passage : {langue: places}.
  v_places jsonb;
  -- Les langues déjà données à chaque label dans ce passage : {label_id: [langues]}.
  v_donnees jsonb := '{}'::jsonb;
  -- La performance de chaque label dans son application : {label_id: {perf, passages}}.
  v_stats jsonb := '{}'::jsonb;
  r record;
  v_langue text;
  v_n integer;
  v_max integer;
  v_lissee numeric;
  v_app record;
  v_ok boolean;
  v_raison text;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'podz : réservé aux admins' using errcode = '42501';
  end if;

  -- Une langue nourrit un podz par tranche de `recrues_par_ouverture` recrues en 14 jours (au moins un).
  select coalesce(jsonb_object_agg(x.langue, greatest(1, x.n / v_par)), '{}'::jsonb) into v_places
    from (select lower(c.langue) as langue, count(*)::integer as n
            from comptes c
           where c.is_active and c.langue is not null and c.created_at >= now() - interval '14 days'
           group by 1) x
   where split_part(x.langue, '-', 1) <> all (v_exclues);

  -- La performance de chaque label dans SON application (la première qu'il sert, ordre du catalogue).
  for v_app in
    select x.app, array_agg(x.label_id) as labels
      from (select distinct p.label_id,
                   (select a.id from applications a
                     where a.id = any (public.label_applications_ids(p.label_id))
                     order by a.id limit 1) as app
              from pods p where p.actif and p.langues is not null and p.label_id is not null) x
     where x.app is not null
     group by x.app
  loop
    select v_stats || coalesce(jsonb_object_agg(s0.label_id::text,
                         jsonb_build_object('perf', s0.perf_label / nullif(s0.perf_flotte, 0), 'passages', s0.passages)), '{}'::jsonb)
      into v_stats
      from stats_choix_label((select array_agg(id) from labels), v_app.app, null, null, 0) s0
     where s0.label_id = any (v_app.labels);
  end loop;

  for r in
    select p.slug, p.label_id, p.langues, l.nom,
           (v_stats -> p.label_id::text ->> 'perf')::numeric as perf,
           (v_stats -> p.label_id::text ->> 'passages')::integer as passages,
           (select max(o.ouvert_le) from bleo_langues_ouvertes o
             where o.pod = p.slug and o.action = 'ouverte' and o.par = 'soupape') as derniere,
           -- Les langues du podz où l'on recrute ont-elles toutes un compte ? (affiché, ne bloque plus)
           not exists (
             select 1 from unnest(p.langues) d
              where exists (select 1 from comptes c where c.is_active and lower(c.langue) = lower(d)
                                                      and c.created_at >= now() - interval '14 days')
                and not exists (select 1 from compte_labels cl join comptes c on c.id = cl.compte_id and c.is_active
                                 where cl.label_id = p.label_id
                                   and (lower(c.langue) = lower(d) or split_part(lower(c.langue), '-', 1) = lower(d)))
           ) as pleines
      from pods p
      join labels l on l.id = p.label_id
      join podz_images_finies z on z.pod = p.slug
     where p.actif and p.langues is not null
     -- Le label le plus performant choisit d'abord.
     order by (v_stats -> p.label_id::text ->> 'perf')::numeric desc nulls last, p.slug
  loop
    -- Combien de langues : la performance lissée vers 1 décide (3, 2, 1 ou 0).
    v_ok := false;
    v_lissee := (coalesce(r.perf, 0) * coalesce(r.passages, 0) + v_lissage) / nullif(coalesce(r.passages, 0) + v_lissage, 0);
    v_max := greatest(0, v_lot - coalesce((select min(i) - 1 from generate_subscripts(v_paliers, 1) i
                                           where v_lissee >= v_paliers[i]), v_lot));
    if coalesce(r.passages, 0) < v_posts_min then
      v_raison := 'pas encore assez de posts mesurés (' || coalesce(r.passages, 0) || ' sur ' || v_posts_min || ')';
    elsif v_max = 0 then
      v_raison := 'performance trop basse (' || round(v_lissee, 2) || ' lissée, ' || coalesce(round(r.perf, 2)::text, '—') || ' sur ' || r.passages || ' posts)';
    elsif r.derniere is not null and r.derniere > now() - make_interval(days => v_jours) then
      v_raison := 'la soupape lui a ouvert une langue il y a moins de ' || v_jours || ' jours';
    else
      v_ok := true;
    end if;

    v_n := 0;
    if v_ok then
      loop
        exit when v_n >= v_max;
        -- La langue la plus recrutée qui lui reste : pas déjà la sienne (ni celle d'un autre podz de
        -- son label), encore des places dans ce passage.
        select e.key into v_langue
          from jsonb_each_text(v_places) e
         where e.value::integer > 0
           and not exists (select 1 from pods p2 cross join lateral unnest(p2.langues) d
                            where p2.label_id = r.label_id and p2.actif
                              and (lower(d) = e.key or lower(d) = split_part(e.key, '-', 1)))
           and not (coalesce(v_donnees -> r.label_id::text, '[]'::jsonb) ? e.key)
         order by e.value::integer desc, e.key
         limit 1;
        exit when v_langue is null;

        v_places := jsonb_set(v_places, array[v_langue], to_jsonb((v_places ->> v_langue)::integer - 1));
        v_donnees := jsonb_set(v_donnees, array[r.label_id::text],
                               coalesce(v_donnees -> r.label_id::text, '[]'::jsonb) || to_jsonb(v_langue), true);
        v_n := v_n + 1;

        if p_appliquer then
          perform public.podz_langue(r.slug, v_langue, 'ouvrir', 'soupape',
                                     jsonb_build_object('perf', round(r.perf, 3), 'lissee', round(v_lissee, 3), 'posts', r.passages, 'lot', v_n));
        end if;

        pod := r.slug; label := r.nom; pleines := r.pleines; perf := round(r.perf, 3); posts := r.passages;
        derniere_ouverture := r.derniere; langue_proposee := v_langue; ouverte := p_appliquer;
        raison := 'langue ' || v_n || ' sur ' || v_max || ' (performance lissée ' || round(v_lissee, 2) || ')';
        return next;
      end loop;
      if v_n = 0 then
        v_raison := 'aucune langue à ouvrir (toutes prises, ou plus de place cette semaine)';
      end if;
    end if;

    if v_n = 0 then
      pod := r.slug; label := r.nom; pleines := r.pleines; perf := round(r.perf, 3); posts := r.passages;
      derniere_ouverture := r.derniere; langue_proposee := null; ouverte := false; raison := v_raison;
      return next;
    end if;
  end loop;
end;
$function$;

comment on function public.bleo_ouvrir_langues_podz(boolean) is
  'La soupape des langues (0722, 0784) : le dimanche soir, jusqu''à par_lot (3) langues de plus par podz en images finies selon la performance lissée de son label dans son application (paliers 1,00 / 0,75 / 0,50 : 3, 2, 1 langue ; rien sous posts_min posts), réparties entre les podz (une langue nourrit un podz par tranche de recrues_par_ouverture recrues en 14 jours ; le plus performant choisit d''abord). Une ligne par langue proposée, ou une ligne sans langue avec la raison. p_appliquer : ouvre par podz_langue().';

-- Le dimanche à 20 h, heure de Paris (19 h UTC en hiver, 21 h à Paris en été).
select cron.alter_job((select jobid from cron.job where jobname = 'bleo-soupape-langues'), schedule := '0 19 * * 0');
