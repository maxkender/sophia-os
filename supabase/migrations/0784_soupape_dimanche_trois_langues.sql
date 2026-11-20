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
--   * TROIS LANGUES d'un coup par podz (`par_lot`).
--   * PLUS DE CONDITION « toutes les langues ont un compte » : elle reste
--     affichée (`pleines`), elle ne bloque plus.
--   * LES LANGUES SONT RÉPARTIES entre les podz. Une langue ne s'ouvre, dans un
--     même passage, qu'à autant de podz qu'elle peut nourrir : un podz pour
--     `recrues_par_ouverture` (6) comptes recrutés dans cette langue en 14
--     jours (au moins un). Les podz choisissent tour à tour, le label le plus
--     performant d'abord, chacun prenant la langue la plus recrutée qui lui
--     reste. Deux podz d'un même label ne reçoivent pas la même langue.
--   * La condition de performance ne change pas (0,75 de la flotte sur 30
--     posts, ou label tenu « Ouvert »). Les langues exclues non plus.
--
-- Chaque ouverture passe par `podz_langue` (0781) et va au journal. Adrien et
-- Max ouvrent et ferment toujours quand ils veulent (page Podz).
--
-- Le type de retour ne change pas : une ligne par langue proposée (jusqu'à
-- trois par podz), ou une ligne sans langue avec la raison.
--
-- Réglages : `reglages.bleo.soupape_langues` (par_lot 3, recrues_par_ouverture
-- 6, jours_entre 6, perf_min 0.75, posts_min 30, exclues).
-- Retour arrière : réappliquer la fonction de 0781/0783 ; `select
-- cron.alter_job(<id de bleo-soupape-langues>, schedule := '40 3 * * *')` ;
-- remettre `jours_entre` à 1.

set lock_timeout = '5s';

update public.reglages
   set valeur = jsonb_set(valeur, '{soupape_langues}',
         coalesce(valeur->'soupape_langues', '{}'::jsonb)
           || '{"par_lot": 3, "recrues_par_ouverture": 6, "jours_entre": 6}'::jsonb, true),
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
  v_perf_min numeric := coalesce((cfg->>'perf_min')::numeric, 0.75);
  v_posts_min integer := coalesce((cfg->>'posts_min')::integer, 30);
  v_jours integer := coalesce((cfg->>'jours_entre')::integer, 6);
  v_lot integer := greatest(coalesce((cfg->>'par_lot')::integer, 3), 1);
  v_par integer := greatest(coalesce((cfg->>'recrues_par_ouverture')::integer, 6), 1);
  v_exclues text[] := coalesce(array(select lower(jsonb_array_elements_text(cfg->'exclues'))), array['ar','he','fa','ur','ja']);
  v_ouverts jsonb := coalesce((select valeur->'labels_ouverts_app' from reglages where cle = 'choix_labels'), '[]'::jsonb);
  -- Ce qu'il reste à ouvrir de chaque langue dans ce passage : {langue: places}.
  v_places jsonb;
  -- Les langues déjà données à chaque label dans ce passage : {label_id: [langues]}.
  v_donnees jsonb := '{}'::jsonb;
  r record;
  v_langue text;
  v_n integer;
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

  create temp table if not exists bs_stats on commit drop as
  select s0.label_id, s0.perf_label / nullif(s0.perf_flotte, 0) as perf, s0.passages
    from stats_choix_label((select array_agg(id) from labels), '00000000-0000-4000-8000-000000000001'::uuid, null, null, 0) s0;

  for r in
    select p.slug, p.label_id, p.langues, l.nom, st.perf, st.passages,
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
      left join bs_stats st on st.label_id = p.label_id
     where p.actif and p.langues is not null
     -- Le label le plus performant choisit d'abord.
     order by st.perf desc nulls last, p.slug
  loop
    v_ok := false;
    if not (v_ouverts ? ('00000000-0000-4000-8000-000000000001:' || r.label_id::text))
       and (coalesce(r.passages, 0) < v_posts_min or coalesce(r.perf, 0) < v_perf_min) then
      v_raison := 'performance pas encore prouvée (' || coalesce(round(r.perf, 2)::text, '—') || ' sur ' || coalesce(r.passages, 0) || ' posts)';
    elsif r.derniere is not null and r.derniere > now() - make_interval(days => v_jours) then
      v_raison := 'la soupape lui a ouvert une langue il y a moins de ' || v_jours || ' jours';
    else
      v_ok := true;
    end if;

    v_n := 0;
    if v_ok then
      loop
        exit when v_n >= v_lot;
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
                                     jsonb_build_object('perf', round(r.perf, 3), 'posts', r.passages, 'lot', v_n));
        end if;

        pod := r.slug; label := r.nom; pleines := r.pleines; perf := round(r.perf, 3); posts := r.passages;
        derniere_ouverture := r.derniere; langue_proposee := v_langue; ouverte := p_appliquer;
        raison := 'langue ' || v_n || ' sur ' || v_lot || ' de la semaine';
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
  'La soupape des langues (0722, 0784) : le dimanche soir, jusqu''à par_lot (3) langues de plus par podz en images finies dont le label tient, réparties entre les podz (une langue nourrit un podz par tranche de recrues_par_ouverture recrues en 14 jours ; le plus performant choisit d''abord). Une ligne par langue proposée, ou une ligne sans langue avec la raison. p_appliquer : ouvre par podz_langue().';

-- Le dimanche à 20 h, heure de Paris (19 h UTC en hiver, 21 h à Paris en été).
select cron.alter_job((select jobid from cron.job where jobname = 'bleo-soupape-langues'), schedule := '0 19 * * 0');
