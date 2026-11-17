-- 16/11 : les choix du samedi 14/11 (11 kills) n'ont jamais été exécutés : la page Decisions a planté
-- avant « Validate », et le lundi, Validate ne peut plus rien faire (samedi_choisir cherche le contrôle
-- de la semaine EN COURS ; la masterlist n'affiche que la semaine en cours).
--
-- Rattrapage, pour la semaine passée seulement, toujours sur clic de l'admin :
--   samedi_rattrapage_lire(lundi)    : les kills en brouillon pas exécutés + les propositions sans décision ;
--   samedi_rattrapage_valider(lundi, choix) : Kill / Kill sans paie / Keep, par le même chemin que Validate
--     (ckd_decider → comptes désactivés → arrêt « kill_samedi » sans message → retrait Slack, fin de contrat).
-- L'arrêt porte la semaine du samedi (arrets.semaine) : la fin de contrat regarde la paie de CETTE
-- semaine-là, pas celle du jour du clic (sinon : 0 post → « semaine à 0 $ »).

alter table public.arrets add column if not exists semaine date;
comment on column public.arrets.semaine is
  '0719 : la semaine du Kill quand il est validé en retard (rattrapage du samedi). Vide : la semaine du jour de l''arrêt.';

create or replace function public.arrets_fins_a_faire()
 returns table(arret_id uuid, poster_id uuid, contrat_id text, semaine date, montant numeric, paye_at timestamp with time zone, posts integer)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with a as (
    select x.id, x.poster_id, x.etapes,
           coalesce(x.semaine, (date_trunc('week', (x.created_at at time zone 'Europe/Paris') - interval '6 hours'))::date) as w
      from public.arrets x
     where x.statut in ('fait', 'erreur')
       and x.annule_at is null
       and not exists (select 1 from public.contestations ct where ct.poster_id = x.poster_id and ct.statut = 'ouverte' and ct.type = 'kill')
       and exists (select 1 from jsonb_array_elements(coalesce(x.etapes, '[]'::jsonb)) e
                    where e->>'action' = 'paie' and e->>'statut' = 'a_faire')
       and not exists (select 1 from jsonb_array_elements(coalesce(x.etapes, '[]'::jsonb)) e
                        where e->>'action' = 'fermeture' and e->>'statut' in ('fait', 'a_faire'))
  )
  select a.id, a.poster_id, pr.upwork_contract_id, a.w,
         case when exists (select 1 from public.paie_kills_sans_paie k
                            where k.poster_id = a.poster_id and k.semaine = a.w and k.annule_at is null) then 0::numeric
              else (select coalesce(s.montant_corrige, s.montant) from public.paie_semaines s
           where s.poster_id = a.poster_id and s.semaine = a.w and not coalesce(s.exclu, false)
           order by s.calcule_at desc nulls last limit 1) end,
         (select s.paye_at from public.paie_semaines s where s.poster_id = a.poster_id and s.semaine = a.w
           order by s.paye_at desc nulls last limit 1),
         (select count(*) from public.passages p join public.comptes c on c.id = p.compte_id
           where c.poster_id = a.poster_id and p.publie_url is not null
             and p.date_publication_prevue between a.w and a.w + 6)::int
    from a
    join public.profiles pr on pr.id = a.poster_id
   where not pr.is_active
     and now() >= ((a.w + 7)::timestamp at time zone 'Europe/Paris')
     and not exists (select 1 from public.contrats_fins f where f.poster_id = a.poster_id and f.semaine = a.w);
end;
$function$;

-- Le contrôle du samedi de la semaine `p_lundi`, seulement pour la semaine passée (le rattrapage).
create or replace function public._samedi_rattrapage_controle(p_lundi date)
 returns uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select ct.id from public.ckd_controles ct
   where ct.type = 'samedi' and ct.jour between p_lundi and p_lundi + 6
     and p_lundi = date_trunc('week', (now() at time zone 'Europe/Paris'))::date - 7
   order by ct.jour desc limit 1;
$function$;
revoke all on function public._samedi_rattrapage_controle(date) from public, anon, authenticated;

create or replace function public.samedi_rattrapage_lire(p_lundi date)
 returns table(compte_id uuid, poster_id uuid, nom text, handle text, canal_paie text, regle text, proposition_id uuid,
               brouillon text, brouillon_raison jsonb, posts_semaine integer, posts_total integer, stop boolean,
               paie_statut text, paie_montant numeric)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_ctrl uuid;
begin
  if not public.is_admin_strict() then
    raise exception 'samedi_rattrapage_lire : réservé à l''admin' using errcode = '42501';
  end if;
  v_ctrl := public._samedi_rattrapage_controle(p_lundi);
  if v_ctrl is null then
    return;
  end if;
  return query
  with cibles as (
    -- Les propositions sans décision (hors Doubler, qui a son propre chemin).
    select cp.compte_id, cp.regle, cp.id as prop
      from public.ckd_propositions cp
     where cp.controle_id = v_ctrl and cp.decision is null and cp.regle in ('absent', 'premiere_semaine', 'anciens')
    union all
    -- Les kills en brouillon sans proposition ouverte (choisis à la main dans la masterlist).
    select b.compte_id, null, null
      from public.samedi_brouillons b
     where b.lundi = p_lundi and b.choix in ('kill', 'kill_np')
       and not exists (select 1 from public.ckd_propositions cp
                        where cp.controle_id = v_ctrl and cp.compte_id = b.compte_id
                          and (cp.decision is null and cp.regle in ('absent', 'premiere_semaine', 'anciens')
                               or cp.decision = 'ne_pas_renouveler'))
  ),
  une as (
    select distinct on (c.compte_id) c.compte_id, c.regle, c.prop from cibles c order by c.compte_id, c.prop nulls last
  )
  select co.id, co.poster_id,
         nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''),
         co.handle_tiktok, pr.canal_paie, u.regle, u.prop, b.choix, b.raison,
         (select count(*) from public.passages pa where pa.compte_id = co.id and pa.publie_url is not null
             and pa.date_publication_prevue between p_lundi and p_lundi + 6)::int,
         (select count(*) from public.passages pa where pa.compte_id = co.id and pa.publie_url is not null)::int,
         exists (select 1 from public.demandes_arret d where d.poster_id = co.poster_id and d.decision is null),
         (select pp.statut from public.paie_paiements_api pp where pp.poster_id = co.poster_id and pp.semaine = p_lundi
           order by pp.updated_at desc limit 1),
         (select pp.montant_approuve from public.paie_paiements_api pp where pp.poster_id = co.poster_id and pp.semaine = p_lundi
           order by pp.updated_at desc limit 1)
    from une u
    join public.comptes co on co.id = u.compte_id and co.is_active
    join public.profiles pr on pr.id = co.poster_id
    left join public.samedi_brouillons b on b.lundi = p_lundi and b.compte_id = co.id;
end;
$function$;
revoke all on function public.samedi_rattrapage_lire(date) from public, anon;
grant execute on function public.samedi_rattrapage_lire(date) to authenticated;

-- p_choix : [{ "compte_id": uuid, "choix": "kill" | "kill_np" | "keep", "raison": text }]
create or replace function public.samedi_rattrapage_valider(p_lundi date, p_choix jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ctrl   uuid;
  v_ctrl_jour date;
  e        jsonb;
  v_compte uuid;
  v_choix  text;
  v_raison text;
  v_prop   uuid;
  v_dbl    uuid;
  c        record;
  v_kills  int := 0;
  v_np     int := 0;
  v_gardes int := 0;
  v_err    text[] := '{}';
begin
  if not public.is_admin_strict() then
    raise exception 'samedi_rattrapage_valider : réservé à l''admin' using errcode = '42501';
  end if;
  v_ctrl := public._samedi_rattrapage_controle(p_lundi);
  if v_ctrl is null then
    raise exception 'samedi_rattrapage_valider : pas de samedi à rattraper pour la semaine du %', p_lundi;
  end if;
  select ct.jour into v_ctrl_jour from public.ckd_controles ct where ct.id = v_ctrl;

  for e in select * from jsonb_array_elements(coalesce(p_choix, '[]'::jsonb)) loop
    v_compte := nullif(e->>'compte_id', '')::uuid;
    v_choix := e->>'choix';
    v_raison := nullif(btrim(coalesce(e->>'raison', '')), '');
    begin
      if v_choix not in ('kill', 'kill_np', 'keep') then
        raise exception 'choix % inconnu', v_choix;
      end if;
      select co.id, co.poster_id, co.pays, co.langue, co.handle_tiktok, pr.manager_id,
             public.application_principale(co.parts_applications) as application
        into c
        from public.comptes co join public.profiles pr on pr.id = co.poster_id
       where co.id = v_compte and co.is_active;
      if not found then
        raise exception 'compte introuvable ou déjà arrêté';
      end if;

      select cp.id into v_prop from public.ckd_propositions cp
       where cp.controle_id = v_ctrl and cp.compte_id = v_compte and cp.decision is null
         and cp.regle in ('absent', 'premiere_semaine', 'anciens')
       order by cp.created_at limit 1;

      if v_choix = 'keep' then
        if v_prop is not null then
          perform public.ckd_decider(v_prop, 'garder', 'Rattrapage du samedi');
          v_gardes := v_gardes + 1;
        end if;
        continue;
      end if;

      -- Kill : un Doubler encore ouvert pour ce compte est refusé d'abord (comme Validate).
      select cp.id into v_dbl from public.ckd_propositions cp
       where cp.controle_id = v_ctrl and cp.compte_id = v_compte and cp.decision is null and cp.regle = 'doubler' limit 1;
      if v_dbl is not null then
        perform public.ckd_decider(v_dbl, 'pas_maintenant', 'Rattrapage du samedi : Kill');
      end if;
      if v_prop is null then
        insert into public.ckd_propositions (controle_id, type, jour, regle, action, compte_id, poster_id, hm_id, pays, langue, application, donnees)
        values (v_ctrl, 'samedi', v_ctrl_jour, 'absent', 'ne_pas_renouveler', c.id, c.poster_id, c.manager_id, c.pays, c.langue, c.application,
                jsonb_build_object('handle', c.handle_tiktok, 'manuel', true, 'rattrapage', true, 'motifs', '[]'::jsonb,
                                   'choisi_par', auth.uid(), 'choisi_at', now()))
        on conflict (compte_id, regle, jour) do nothing
        returning id into v_prop;
        if v_prop is null then
          raise exception 'déjà décidé pour ce compte cette semaine';
        end if;
      end if;
      if v_choix = 'kill_np' then
        insert into public.paie_kills_sans_paie (poster_id, semaine, raison, montant, decide_par)
        values (c.poster_id, p_lundi, coalesce(v_raison, 'Kill & don''t pay (samedi)'), null, auth.uid())
        on conflict (poster_id, semaine) do update
           set raison = excluded.raison, decide_par = excluded.decide_par, decide_at = now(), annule_at = null;
      end if;
      perform public.ckd_decider(v_prop, 'ne_pas_renouveler', 'Rattrapage du samedi');
      -- L'arrêt créé à l'instant porte la semaine du samedi (fin de contrat sur la paie de cette semaine).
      update public.arrets a set semaine = p_lundi
       where a.poster_id = c.poster_id and a.semaine is null and a.created_at >= now() - interval '1 minute';
      if v_choix = 'kill_np' then v_np := v_np + 1; else v_kills := v_kills + 1; end if;
    exception when others then
      v_err := v_err || format('%s : %s', coalesce(c.handle_tiktok, v_compte::text), sqlerrm);
    end;
  end loop;

  return jsonb_build_object('kills', v_kills, 'kills_sans_paie', v_np, 'gardes', v_gardes, 'erreurs', to_jsonb(v_err));
end;
$function$;
revoke all on function public.samedi_rattrapage_valider(date, jsonb) from public, anon;
grant execute on function public.samedi_rattrapage_valider(date, jsonb) to authenticated;
