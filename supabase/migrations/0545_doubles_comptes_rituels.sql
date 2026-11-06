-- 0545 : Weekly decisions, les doubles comptes.
-- 1. posteurs_tarifs() : le tarif par compte de chaque posteur (contrats_tarifs,
--    sinon profiles.tarif_hebdo) et son nombre de comptes actifs, pour le bloc
--    « paie attendue = tarif × nombre de comptes » (lecture seule).
-- 2. jeudi_valider : le nudge compte les posts sur TOUS les comptes de la
--    personne ({faits}/{attendus} = totaux) et, à partir de 2 comptes, dit
--    lequel est en retard (« Late account: @handle (x/y posts) »).

create or replace function public.posteurs_tarifs()
returns table(poster_id uuid, tarif numeric, comptes integer)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.rituels_droit() then
    raise exception 'posteurs_tarifs : réservé à l''admin' using errcode = '42501';
  end if;
  return query
  select pr.id,
         coalesce(ct.tarif_compte, pr.tarif_hebdo)::numeric,
         (select count(*)::int from public.comptes c where c.poster_id = pr.id and c.is_active and coalesce(c.type_compte, 'perso') = 'perso')
    from public.profiles pr
    left join public.contrats_tarifs ct on ct.contrat_id = pr.upwork_contract_id
   where exists (select 1 from public.comptes c where c.poster_id = pr.id and c.is_active);
end;
$$;

revoke execute on function public.posteurs_tarifs() from public, anon;
grant execute on function public.posteurs_tarifs() to authenticated;

create or replace function public.jeudi_valider(p_lundi date, p_comptes uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aujourdhui date := (now() at time zone 'Europe/Paris')::date;
  v_jusqu date := least(v_aujourdhui, p_lundi + 6);
  v_modele text := coalesce((select r.valeur #>> '{}' from public.reglages r where r.cle = 'jeudi_nudge_texte'), '');
  v_prepares integer := 0;
  v_deja integer := 0;
  v_sans_canal integer := 0;
  v_canal text;
  v_faits integer;
  v_attendus integer;
  v_nb integer;
  v_retard text;
  v_texte text;
  v_comptes jsonb;
  r record;
begin
  if not public.is_admin() then
    raise exception 'jeudi_valider : réservé à l''admin et au Head of Ops';
  end if;
  if extract(isodow from p_lundi) <> 1 then
    raise exception 'jeudi_valider : % n''est pas un lundi', p_lundi;
  end if;
  if btrim(v_modele) = '' then
    raise exception 'jeudi_valider : le texte du nudge (jeudi_nudge_texte) est vide';
  end if;
  create temp table if not exists _jeudi_sc on commit drop as
    select * from public.semaine_comptes(p_lundi, v_jusqu) limit 0;
  delete from _jeudi_sc;
  insert into _jeudi_sc select * from public.semaine_comptes(p_lundi, v_jusqu);
  for r in
    select distinct on (s.poster_id) s.*
      from _jeudi_sc s
     where s.compte_id = any(p_comptes)
     order by s.poster_id, (s.prevus_passes - s.lien_passes) desc, s.lien_total
  loop
    if r.nudge_envoye_at is not null then
      v_deja := v_deja + 1;
      continue;
    end if;
    select case when pr.slack_user_id is not null then 'slack' end
      into v_canal
      from public.profiles pr where pr.id = r.poster_id;
    if v_canal is null then
      v_sans_canal := v_sans_canal + 1;
      continue;
    end if;
    -- 0545 : tous les comptes de la personne.
    select coalesce(sum(s.lien_total), 0)::int, coalesce(sum(s.prevus_passes + s.lien_aujourdhui), 0)::int, count(*)::int,
           string_agg(case when s.prevus_passes > s.lien_passes
                           then '@' || coalesce(s.handle, '?') || ' (' || s.lien_total || '/' || (s.prevus_passes + s.lien_aujourdhui) || ' posts)' end,
                      ', ' order by s.handle),
           jsonb_agg(jsonb_build_object('handle', s.handle, 'faits', s.lien_total, 'attendus', s.prevus_passes + s.lien_aujourdhui,
                                        'en_retard', s.prevus_passes > s.lien_passes) order by s.handle)
      into v_faits, v_attendus, v_nb, v_retard, v_comptes
      from _jeudi_sc s where s.poster_id = r.poster_id;
    v_texte := replace(replace(replace(v_modele,
                 '{prenom}', coalesce(nullif(btrim(r.prenom), ''), 'there')),
                 '{faits}', v_faits::text),
                 '{attendus}', v_attendus::text);
    if v_nb >= 2 and v_retard is not null then
      v_texte := v_texte || E'\n\nLate account: ' || v_retard || '.';
    end if;
    insert into public.relances_prevues (poster_id, type, periode, statut, canal, texte, raison, donnees, valide_at, valide_par, maj_at)
    values (r.poster_id, 'jeudi', p_lundi, 'prevu', v_canal, v_texte, 'jeudi',
            jsonb_build_object('handle', r.handle, 'faits', v_faits, 'attendus', v_attendus,
                               'jours', r.jours, 'hm', r.hm_nom, 'comptes', v_comptes),
            now(), auth.uid(), now())
    on conflict (poster_id, type, periode) do update
       set statut = 'prevu', canal = excluded.canal, texte = excluded.texte, raison = 'jeudi', donnees = excluded.donnees,
           valide_at = now(), valide_par = auth.uid(), maj_at = now();
    v_prepares := v_prepares + 1;
  end loop;
  return jsonb_build_object('prepares', v_prepares, 'deja', v_deja, 'sans_canal', v_sans_canal);
end;
$$;
