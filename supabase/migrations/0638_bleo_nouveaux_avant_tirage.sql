-- 0638 : BLEO, les contenus validés dans la journée entrent au tirage de 14 h
-- (Adrien, 2/11 : « point 2 »).
--
-- Un contenu n'est tirable qu'avec sa famille et sa valeur, calculées par la
-- nuit (5 h 15). Une livraison des podz déposée vers 7 h et validée vers 12 h
-- (0635) attendait donc la nuit suivante, puis le tirage du lendemain :
-- publication à J+2. Désormais, juste avant de tirer, `bleo_tirage_cron`
-- appelle `bleo_nouveaux_avant_tirage()` :
--   - `bleo_rattacher_nouveaux()` (A2 de la nuit, ne touche qu'aux contenus
--     sans famille) ;
--   - la valeur (A5 de la nuit, même formule) des seuls contenus qui n'en ont
--     encore aucune. Rien d'autre n'est recalculé : verdicts, fermetures et
--     valeurs des autres contenus restent ceux de la nuit.
-- Publication à J+1, comme avec l'ancien système.
--
-- Aussi : un tirage lancé à la main à une autre heure (essai) ne bloque plus le
-- tirage officiel de 14 h (le 2/11, l'essai de 9 h 11 pour le 3/11 l'aurait
-- fait sauter) : seul un tirage commencé à 14 h compte comme « déjà fait ».
--
-- Retour arrière : rejouer bleo_tirage_cron de 0614.

set lock_timeout = '5s';

create or replace function public.bleo_nouveaux_avant_tirage()
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  reg jsonb;
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_debut timestamptz := clock_timestamp();
  v_rattaches integer;
  v_valeurs integer;
  v_maturite interval;
  v_plafond numeric;
  v_k numeric;
  v_fatigue_post numeric;
  v_fatigue_accroche numeric;
  v_age interval;
  v_age_facteur numeric;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'bleo : réservé aux admins' using errcode = '42501';
  end if;
  select valeur into reg from reglages where cle = 'bleo';
  if reg is null then
    raise exception 'reglages.bleo absent';
  end if;
  v_maturite := make_interval(hours => (reg->'mesure'->>'maturite_heures')::int);
  v_plafond := (reg->'mesure'->>'r_plafond')::numeric;
  v_k := (reg->'forme'->>'k')::numeric;
  v_fatigue_post := (reg->'valeur'->>'fatigue_post')::numeric;
  v_fatigue_accroche := (reg->'valeur'->>'fatigue_accroche')::numeric;
  v_age := make_interval(days => (reg->'valeur'->>'age_jours')::int);
  v_age_facteur := (reg->'valeur'->>'age_facteur')::numeric;

  v_rattaches := public.bleo_rattacher_nouveaux();

  -- A5 de bleo_nuit, restreint aux contenus sans aucune valeur.
  with langues as (
    select distinct cl.label_id, co.langue
      from compte_labels cl
      join comptes co on co.id = cl.compte_id
     where co.is_active and co.langue is not null
  ),
  cand as (
    select c.id as contenu_id, l.langue, c.created_at, c.famille_id,
           coalesce((reg->'classes'->'depart'->>c.classe_defaut)::numeric,
                    (reg->'classes'->'depart'->>'import')::numeric) as defaut
      from contenus c
      join contenu_labels lab on lab.contenu_id = c.id
      join langues l on l.label_id = lab.label_id
     where c.statut = 'valide' and c.famille_id is not null
       and not exists (select 1 from bleo_valeurs bv where bv.contenu_id = c.id)
  ),
  rs as (
    select p.contenu_id, count(*) as n_r, sum(least(p.r, v_plafond)) as somme
      from passages p
     where p.contenu_id in (select contenu_id from cand)
       and p.statut = 'publie' and not coalesce(p.est_rappel, false)
       and p.r is not null and p.publie_at <= now() - v_maturite
     group by p.contenu_id
  ),
  exp as (
    select p.contenu_id, p.langue, count(*) as n
      from passages p
     where p.statut in ('assigne', 'valide_par_poster', 'publie')
       and p.date_publication_prevue >= v_jour - coalesce((reg->'valeur'->>'fatigue_jours')::int, 60)
       and (p.statut = 'publie'
            or p.date_publication_prevue >= v_jour - coalesce((reg->'valeur'->>'fatigue_attente_jours')::int, 3))
     group by p.contenu_id, p.langue
  ),
  fam as (
    select c.famille_id, e.langue, sum(e.n) as n
      from exp e join contenus c on c.id = e.contenu_id
     where c.famille_id in (select famille_id from cand)
     group by c.famille_id, e.langue
  ),
  calc as (
    select cand.contenu_id, cand.langue, cand.defaut,
           coalesce(rs.n_r, 0) as n_r,
           (v_k * cand.defaut + coalesce(rs.somme, 0)) / (v_k + coalesce(rs.n_r, 0)) as forme,
           coalesce(e.n, 0) as n_post,
           coalesce(fam.n, 0) - coalesce(e.n, 0) as n_accroche,
           case when cand.created_at < now() - v_age then v_age_facteur else 1 end as facteur_age
      from cand
      left join rs on rs.contenu_id = cand.contenu_id
      left join exp e on e.contenu_id = cand.contenu_id and e.langue = cand.langue
      left join fam on fam.famille_id = cand.famille_id and fam.langue = cand.langue
  )
  insert into bleo_valeurs (contenu_id, langue, forme, defaut, n_r, n_post, n_accroche, facteur_age, valeur, calcule_le)
  select contenu_id, langue, forme, defaut, n_r, n_post, n_accroche, facteur_age,
         forme * power(v_fatigue_post, n_post) * power(v_fatigue_accroche, n_accroche) * facteur_age,
         v_debut
    from calc
  on conflict (contenu_id, langue) do nothing;
  get diagnostics v_valeurs = row_count;

  return jsonb_build_object('rattaches', v_rattaches, 'valeurs', v_valeurs,
                            'duree_s', round(extract(epoch from clock_timestamp() - v_debut)::numeric, 1));
end;
$function$;

comment on function public.bleo_nouveaux_avant_tirage() is
  '0638 : avant le tirage de 14 h, rattache les contenus validés depuis la nuit et calcule la valeur de ceux qui n''en ont pas (même formule que la nuit) : une livraison du matin est tirée le jour même.';

create or replace function public.bleo_tirage_cron()
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_paris timestamp := now() at time zone 'Europe/Paris';
  v_demain date := (now() at time zone 'Europe/Paris')::date + 1;
  v_mode text;
  v_nouveaux jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'bleo : réservé aux admins' using errcode = '42501';
  end if;
  select valeur->>'mode' into v_mode from reglages where cle = 'bleo';
  if coalesce(v_mode, 'off') not in ('ombre', 'actif') then
    return jsonb_build_object('ignore', 'mode ' || coalesce(v_mode, 'off'));
  end if;
  if extract(hour from v_paris) <> 14 then
    return jsonb_build_object('ignore', 'hors heure');
  end if;
  -- Seul un tirage commencé à 14 h (heure de Paris) compte : un essai lancé à la
  -- main à une autre heure ne bloque pas le tirage officiel (0638).
  if exists (select 1 from bleo_runs
              where jour_vise = v_demain and fini_le is not null and erreur is null
                and extract(hour from demarre_le at time zone 'Europe/Paris') = 14) then
    return jsonb_build_object('jour_vise', v_demain, 'deja', true);
  end if;
  v_nouveaux := public.bleo_nouveaux_avant_tirage();
  return public.bleo_tirage(v_demain, v_mode) || jsonb_build_object('nouveaux_avant_tirage', v_nouveaux);
end;
$function$;
