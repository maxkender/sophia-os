-- 0722 : la soupape des langues des podz de remakes (option A, décision
-- d'Adrien du 14/11).
--
-- Un podz de remakes (voie 2) ne s'étale que dans les langues qu'il déclare
-- (`pods.langues`). Une fois chacune servie par un compte, le choix de label
-- empilait (white_bg : 3 comptes par langue, Fathomly : 2), alors qu'un 2e
-- passage du même post dans une langue perd 65 % de ses vues.
--
-- Chaque nuit à 4 h 40 (Paris), `bleo_ouvrir_langues_podz(true)` ouvre UNE
-- langue de plus à un podz de remakes quand :
--   * chaque langue qu'il déclare, et où l'on recrute (comptes créés depuis 14
--     jours), a déjà au moins un compte actif de son label ;
--   * son label tient au moins 0,75 de la flotte sur 30 posts mesurés, ou est
--     tenu « Ouvert » à la main ;
--   * il n'a pas reçu de langue depuis 7 jours (une à la fois) ;
-- La langue ouverte : celle où l'on recrute le plus (comptes créés depuis 14
-- jours) parmi celles qu'il ne déclare pas, hors écritures de droite à gauche
-- et japonais (ar, he, fa, ur, ja), que les podz ne savent pas mettre en page.
-- Elle est ajoutée à `pods.langues` : le choix de label y envoie le prochain
-- compte (langue vide, donc prioritaire), et dès qu'un compte y est, le podz la
-- livre (`pod_langues`) et reçoit ses commandes de rattrapage (5 h 55).
-- Chaque ouverture est notée dans `bleo_langues_ouvertes`.
-- On n'empile un 2e compte dans une langue que quand plus aucune langue ne
-- peut s'ouvrir ; 0720 fait alors doubler la production.
--
-- Réglages : `reglages.bleo.soupape_langues` (perf_min 0.75, posts_min 30,
-- jours_entre 7, exclues). Retour arrière : `select cron.unschedule('bleo-soupape-langues');`.

update public.reglages
   set valeur = jsonb_set(valeur, '{soupape_langues}',
         '{"perf_min": 0.75, "posts_min": 30, "jours_entre": 7, "exclues": ["ar", "he", "fa", "ur", "ja"]}'::jsonb, true)
 where cle = 'bleo';

create table if not exists public.bleo_langues_ouvertes (
  id bigint generated always as identity primary key,
  pod text not null,
  langue text not null,
  ouvert_le timestamptz not null default now(),
  raison jsonb
);
alter table public.bleo_langues_ouvertes enable row level security;
drop policy if exists bleo_langues_ouvertes_admin on public.bleo_langues_ouvertes;
create policy bleo_langues_ouvertes_admin on public.bleo_langues_ouvertes
  for select to authenticated using (public.is_admin());

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
  v_jours integer := coalesce((cfg->>'jours_entre')::integer, 7);
  v_exclues text[] := coalesce(array(select lower(jsonb_array_elements_text(cfg->'exclues'))), array['ar','he','fa','ur','ja']);
  v_ouverts jsonb := coalesce((select valeur->'labels_ouverts_app' from reglages where cle = 'choix_labels'), '[]'::jsonb);
  r record;
  s record;
  v_pleines boolean;
  v_langue text;
  v_derniere timestamptz;
  v_ok boolean;
  v_raison text;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'podz : réservé aux admins' using errcode = '42501';
  end if;

  for r in
    select p.slug, p.label_id, p.langues, l.nom
      from pods p join labels l on l.id = p.label_id
      join labels_100_podz z on z.label_id = p.label_id
     where p.actif and p.langues is not null
     order by p.slug
  loop
    -- Les langues où l'on recrute (comptes créés depuis 14 jours).
    with recrutent as (
      select lower(c.langue) as langue, count(*) as n
        from comptes c
       where c.is_active and c.langue is not null and c.created_at >= now() - interval '14 days'
       group by 1
    ),
    declarees as (select lower(x) as langue from unnest(r.langues) x),
    servies as (
      select distinct lower(c.langue) as langue
        from compte_labels cl join comptes c on c.id = cl.compte_id and c.is_active
       where cl.label_id = r.label_id
    )
    select not exists (
             select 1 from declarees d join recrutent rc on rc.langue = d.langue
              where not exists (select 1 from servies sv
                                 where sv.langue = d.langue or split_part(sv.langue, '-', 1) = d.langue)),
           (select rc.langue from recrutent rc
             where not exists (select 1 from declarees d where d.langue = rc.langue or d.langue = split_part(rc.langue, '-', 1))
               and split_part(rc.langue, '-', 1) <> all (v_exclues)
             order by rc.n desc, rc.langue limit 1)
      into v_pleines, v_langue;

    select s0.perf_label / nullif(s0.perf_flotte, 0) as perf, s0.passages
      into s
      -- Tous les labels, pour que la flotte soit la vraie flotte.
      from stats_choix_label((select array_agg(id) from labels), '00000000-0000-4000-8000-000000000001'::uuid, null, null, 0) s0
     where s0.label_id = r.label_id;

    select max(o.ouvert_le) into v_derniere from bleo_langues_ouvertes o where o.pod = r.slug;

    v_ok := false;
    if not v_pleines then
      v_raison := 'des langues déclarées n''ont pas encore de compte';
    elsif v_langue is null then
      v_raison := 'aucune langue à ouvrir';
    elsif not (v_ouverts ? ('00000000-0000-4000-8000-000000000001:' || r.label_id::text))
          and (coalesce(s.passages, 0) < v_posts_min or coalesce(s.perf, 0) < v_perf_min) then
      v_raison := 'performance pas encore prouvée (' || coalesce(round(s.perf, 2)::text, '—') || ' sur ' || coalesce(s.passages, 0) || ' posts)';
    elsif v_derniere is not null and v_derniere > now() - make_interval(days => v_jours) then
      v_raison := 'une langue ouverte il y a moins de ' || v_jours || ' jours';
    else
      v_ok := true;
      v_raison := 'langues pleines et label au niveau : on ouvre ' || v_langue;
    end if;

    if v_ok and p_appliquer then
      update pods set langues = langues || (
               select coalesce(max(c.langue), v_langue) from comptes c
                where lower(c.langue) = v_langue and c.is_active)
       where slug = r.slug;
      insert into bleo_langues_ouvertes (pod, langue, raison)
      values (r.slug, v_langue, jsonb_build_object('perf', round(s.perf, 3), 'posts', s.passages));
    end if;

    pod := r.slug; label := r.nom; pleines := v_pleines; perf := round(s.perf, 3); posts := s.passages;
    derniere_ouverture := v_derniere; langue_proposee := v_langue; ouverte := v_ok and p_appliquer; raison := v_raison;
    return next;
  end loop;
end;
$function$;

comment on function public.bleo_ouvrir_langues_podz(boolean) is
  'Soupape des langues (0722) : ouvre une langue de plus à un podz de remakes dont les langues sont toutes servies et le label au niveau. Sans argument : simulation.';

revoke all on function public.bleo_ouvrir_langues_podz(boolean) from public, anon;
grant execute on function public.bleo_ouvrir_langues_podz(boolean) to authenticated, service_role;

select cron.schedule('bleo-soupape-langues', '40 3 * * *', $$select public.bleo_ouvrir_langues_podz(true);$$);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS'), 'podz_soupape_langues', array['voir 0722']);
