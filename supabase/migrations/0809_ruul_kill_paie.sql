-- 0809 : Ruul de A à Z (Max, 21/11), points 4 et 5. Additif.
-- 1. Kill du samedi Ruul (trigger sur ckd_propositions, propositions « Kill » d'un posteur Ruul seulement) :
--    - absence déclarée / pause de plus de 7 jours → pas de Kill (Keep ; la carte dit « absent jusqu'au X ») ;
--    - le posteur attend une réponse de notre part (demande support ouverte) → pas de Kill ;
--    - règle « absent » : les jours d'absence, de pause et de panne (jours crédités) ne comptent pas comme manqués,
--      la proposition est recalculée (moins de manques que le seuil → pas de Kill) ;
--    - compte jamais trouvé sur TikTok et aucun post : donnees.jamais_trouve (la carte dit « Compte jamais trouvé »).
--    ruul_cartes_decisions : pour les cartes Décisions, les absences de la semaine, l'attente d'une réponse, jamais trouvé.
-- 2. Absences dites par message (absent, malade, en voyage…) : absences_declarees.source / message_ref, et
--    absence_depuis_message (appelée par la fonction ruul, action absences_messages ; sans date : le jour + le lendemain).
-- 3. Paie Ruul : ruul_lot_ajuster, appelé par ruul_lot_preparer :
--    - Kill & don't pay (paie_kills_sans_paie) : 0 $, ligne annulée avec la raison, bonus compris ;
--    - semaine entièrement couverte par une absence déclarée / pause, ou avec un jour de panne de notre côté, sans post :
--      semaine payée ;
--    - « pourquoi ce montant » sur chaque ligne (posts, comptes, doublement, bonus et leurs types, Kill, absences, panne).

-- 1.
create or replace function public.ruul_samedi_proposition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lundi date := new.jour - 5;
  v_abs record;
  v_seuil int;
  v_manques int;
  v_excuses int;
  v_publies int;
begin
  if new.type <> 'samedi' or new.action <> 'ne_pas_renouveler' or new.decision is not null then return new; end if;
  if not exists (select 1 from public.profiles pr where pr.id = new.poster_id and pr.canal_paie = 'ruul') then return new; end if;

  -- Absence (déclarée ou pause) de plus de 7 jours, en cours ou qui couvre la semaine : Keep.
  select z.debut, z.fin, z.raison into v_abs
    from (
      select a.debut, least(coalesce(a.fin, a.debut + greatest(coalesce(a.jours, 1), 1) - 1), coalesce(a.retour_le - 1, 'infinity'::date)) as fin,
             nullif(btrim(a.raison), '') as raison
        from public.absences_declarees a where a.poster_id = new.poster_id
      union all
      select (pp.debut at time zone 'Europe/Paris')::date, (pp.jusqu_au at time zone 'Europe/Paris')::date, nullif(btrim(pp.raison), '')
        from public.posteur_pauses pp where pp.poster_id = new.poster_id
    ) z
   where z.fin >= v_lundi and z.debut <= new.jour + 7 and z.fin - z.debut + 1 > 7
   order by z.fin desc limit 1;
  if found then return null; end if;

  -- Le posteur attend une réponse de notre part : pas de Kill.
  if exists (select 1 from public.support_demandes d where d.poster_id = new.poster_id and d.statut = 'ouvert') then return null; end if;

  -- Règle « absent » : les jours excusés ne comptent pas comme manqués.
  if new.regle in ('absent', 'inactif') and jsonb_typeof(new.donnees #> '{periode,liens_manquants}') = 'array' then
    v_seuil := coalesce((new.donnees #>> '{reglages,manques_absent,v}')::int, 4);
    select count(*) filter (where public.posteur_jour_excuse(new.poster_id, (m->>'jour')::date) is null),
           count(*) filter (where public.posteur_jour_excuse(new.poster_id, (m->>'jour')::date) is not null)
      into v_manques, v_excuses
      from jsonb_array_elements(new.donnees #> '{periode,liens_manquants}') m;
    if v_excuses > 0 then
      if v_manques < v_seuil then return null; end if;
      new.donnees := new.donnees || jsonb_build_object('ruul_jours_excuses', v_excuses, 'ruul_manques_recalcules', v_manques);
    end if;
  end if;

  -- Compte jamais trouvé sur TikTok et aucun post : « Compte jamais trouvé » (vérifier le handle) au lieu de Kill & pay.
  v_publies := coalesce((new.donnees #>> '{periode,publies}')::int, 0);
  if v_publies = 0 and new.compte_id is not null
     and not exists (select 1 from public.passages p where p.compte_id = new.compte_id and (p.vues is not null or p.tiktok_publie_at is not null)) then
    new.donnees := new.donnees || jsonb_build_object('jamais_trouve', true);
  end if;
  return new;
end;
$$;
revoke all on function public.ruul_samedi_proposition() from public, anon, authenticated;

do $p$ begin
  if not exists (select 1 from pg_trigger where tgname = 'ruul_samedi_proposition' and tgrelid = 'public.ckd_propositions'::regclass) then
    create trigger ruul_samedi_proposition before insert on public.ckd_propositions
      for each row execute function public.ruul_samedi_proposition();
  end if;
end $p$;

create or replace function public.ruul_cartes_decisions(p_posteurs uuid[], p_lundi date)
returns table (poster_id uuid, absences jsonb, attend_reponse boolean, jamais_trouve boolean)
language sql
stable
security definer
set search_path = public
as $$
  select pr.id,
         coalesce((select jsonb_agg(jsonb_build_object('debut', a.debut, 'fin', a.fin, 'raison', a.raison, 'source', a.source) order by a.debut)
                     from public.absences_periodes(array[pr.id], p_lundi, p_lundi + 13) a), '[]'::jsonb),
         exists (select 1 from public.support_demandes d where d.poster_id = pr.id and d.statut = 'ouvert'),
         exists (select 1 from public.comptes c where c.poster_id = pr.id and c.is_active and c.type_compte = 'perso'
                    and exists (select 1 from public.passages x where x.compte_id = c.id and x.date_publication_prevue < (now() at time zone 'Europe/Paris')::date
                                   and x.statut::text <> 'brouillon')
                    and not exists (select 1 from public.passages x where x.compte_id = c.id and (x.publie_url is not null or x.vues is not null or x.tiktok_publie_at is not null)))
    from public.profiles pr
   where pr.id = any(p_posteurs) and pr.canal_paie = 'ruul' and public.is_admin();
$$;
revoke all on function public.ruul_cartes_decisions(uuid[], date) from public, anon;
grant execute on function public.ruul_cartes_decisions(uuid[], date) to authenticated, service_role;

-- 2.
alter table public.absences_declarees add column if not exists source text;
alter table public.absences_declarees add column if not exists message_ref text;
create unique index if not exists absences_declarees_message_ref on public.absences_declarees (message_ref) where message_ref is not null;

create table if not exists public.absences_messages_vus (
  ref text primary key,
  poster_id uuid,
  absent boolean,
  vu_at timestamptz not null default now()
);
alter table public.absences_messages_vus enable row level security;

-- Les messages récents des posteurs Ruul actifs, pas encore lus pour les absences (posteur_reponses, demandes support).
create or replace function public.absences_messages_a_lire(p_depuis timestamptz)
returns table (ref text, poster_id uuid, texte text, recu_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select x.ref, x.poster_id, x.texte, x.recu_at
    from (
      select 'reponse:' || r.id as ref, r.poster_id, r.texte, r.recu_at from public.posteur_reponses r where r.recu_at >= p_depuis
      union all
      select 'demande:' || d.id, d.poster_id, coalesce(d.texte, d.resume), d.cree_at from public.support_demandes d where d.cree_at >= p_depuis
    ) x
    join public.profiles pr on pr.id = x.poster_id and pr.canal_paie = 'ruul' and pr.is_active
   where nullif(btrim(x.texte), '') is not null
     and not exists (select 1 from public.absences_messages_vus v where v.ref = x.ref)
   order by x.recu_at
   limit 200;
$$;
revoke all on function public.absences_messages_a_lire(timestamptz) from public, anon, authenticated;
grant execute on function public.absences_messages_a_lire(timestamptz) to service_role;

-- L'absence dite dans un message : dates dites, sinon le jour du message et le lendemain. Une fois par message.
create or replace function public.absence_depuis_message(p_ref text, p_poster uuid, p_absent boolean, p_debut date, p_fin date, p_raison text, p_jour date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debut date := coalesce(p_debut, p_jour);
  v_fin date := coalesce(p_fin, case when p_debut is null then p_jour + 1 else p_debut end);
begin
  insert into public.absences_messages_vus (ref, poster_id, absent) values (p_ref, p_poster, p_absent) on conflict (ref) do nothing;
  if not coalesce(p_absent, false) then return false; end if;
  if v_fin < v_debut then v_fin := v_debut; end if;
  if v_fin - v_debut > 60 then v_fin := v_debut + 60; end if;
  insert into public.absences_declarees (poster_id, debut, jours, fin, raison, source, message_ref)
  values (p_poster, v_debut, (v_fin - v_debut + 1), v_fin, left(coalesce(nullif(btrim(p_raison), ''), 'Absent (message)'), 120), 'message', p_ref)
  on conflict (message_ref) where message_ref is not null do nothing;
  return true;
end;
$$;
revoke all on function public.absence_depuis_message(text, uuid, boolean, date, date, text, date) from public, anon, authenticated;
grant execute on function public.absence_depuis_message(text, uuid, boolean, date, date, text, date) to service_role;

-- 3.
create or replace function public.ruul_lot_ajuster(p_lot uuid, p_semaine date, p_etape text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_etape = 'montants' then
    -- Le « pourquoi » est recalculé à chaque préparation.
    update public.ruul_paiements rp set pourquoi = null
     where ((rp.semaine = p_semaine and (rp.lot_id is null or rp.lot_id = p_lot)) or rp.lot_id = p_lot)
       and rp.statut in ('a_payer', 'reporte', 'annule') and rp.pourquoi is not null;
    -- Semaine sans post : entièrement couverte par une absence déclarée / pause, ou avec un jour de panne : payée.
    update public.ruul_paiements rp
       set montant = coalesce(rp.tarif, 0) * greatest(coalesce(rp.nb_comptes, 1), 1),
           pourquoi = case when x.panne then 'Panne de notre côté cette semaine : semaine payée' else 'Absence déclarée toute la semaine : semaine payée' end,
           maj_at = now()
      from (
        select rp2.id,
               exists (select 1 from public.jours_credites jc where jc.poster_id = rp2.poster_id and jc.jour between p_semaine and p_semaine + 6) as panne,
               not exists (
                 select 1 from public.passages p join public.comptes c on c.id = p.compte_id
                  where c.poster_id = rp2.poster_id and c.type_compte = 'perso'
                    and p.date_publication_prevue between p_semaine and p_semaine + 6
                    and p.statut::text <> 'brouillon' and not coalesce(p.est_rappel, false)
                    and public.posteur_jour_excuse(rp2.poster_id, p.date_publication_prevue) is null) as tout_excuse
          from public.ruul_paiements rp2
         where rp2.semaine = p_semaine and rp2.statut in ('a_payer', 'reporte', 'annule') and (rp2.lot_id is null or rp2.lot_id = p_lot)
           and coalesce(rp2.faits, 0) = 0 and coalesce(rp2.prevus, 0) > 0 and coalesce(rp2.montant, 0) = 0 and rp2.tarif is not null
      ) x
     where rp.id = x.id and (x.panne or x.tout_excuse)
       and not exists (select 1 from public.paie_kills_sans_paie k where k.poster_id = rp.poster_id and k.semaine = p_semaine and k.annule_at is null);
    return;
  end if;

  -- 'fin' : Kill & don't pay, puis le « pourquoi ce montant » de chaque ligne.
  update public.ruul_paiements rp
     set montant = 0, bonus = 0, bonus_ids = '{}', statut = 'annule', lot_id = null,
         raison_report = 'Kill & don''t pay : ' || coalesce(nullif(btrim(k.raison), ''), 'sans raison') || ' (0 $, bonus compris)',
         pourquoi = 'Kill & don''t pay : ' || coalesce(nullif(btrim(k.raison), ''), 'sans raison') || ' → 0 $, bonus de la semaine compris',
         maj_at = now()
    from public.paie_kills_sans_paie k
   where k.poster_id = rp.poster_id and k.annule_at is null and k.semaine <= p_semaine
     and rp.semaine = p_semaine and rp.statut in ('a_payer', 'reporte', 'annule') and (rp.lot_id is null or rp.lot_id = p_lot)
     and (k.semaine = p_semaine or rp.montant = 0);

  update public.ruul_paiements rp
     set pourquoi = array_to_string(array_remove(array[
           rp.pourquoi,
           case when rp.montant > 0 and coalesce(rp.pourquoi, '') = '' then
             coalesce(rp.faits, 0) || '/' || coalesce(rp.prevus, 0) || ' posts avec lien · ' || coalesce(rp.nb_comptes, 1) || ' compte(s) × ' || coalesce(rp.tarif, 0) || ' $ = ' || rp.montant || ' $' end,
           case when coalesce(rp.nb_comptes, 1) > 1 then 'doublement : ' || rp.nb_comptes || ' comptes payés' end,
           case when rp.bonus > 0 then 'bonus ' || rp.bonus || ' $ (' ||
             coalesce((select string_agg(distinct replace(b.type, '_', ' '), ', ') from public.bonus b where b.id = any(rp.bonus_ids)), '?') || ')' end,
           case when exists (select 1 from public.ckd_arrets ar join public.comptes c on c.id = ar.compte_id
                              where c.poster_id = rp.poster_id and ar.raison = 'ne_pas_renouveler' and ar.annule_at is null
                                and coalesce(ar.fait_at, ar.prevu_at) between (p_semaine::timestamp at time zone 'Europe/Paris') and ((p_semaine + 8)::timestamp at time zone 'Europe/Paris'))
                     and coalesce(rp.pourquoi, '') not like 'Kill & don''t pay%' then 'Kill & pay : posts faits payés' end,
           case when exists (select 1 from public.jours_credites jc where jc.poster_id = rp.poster_id and jc.jour between p_semaine and p_semaine + 6)
                     and coalesce(rp.pourquoi, '') not like 'Panne%' then 'jour(s) de panne de notre côté comptés comme faits' end,
           case when (exists (select 1 from public.absences_declarees a where a.poster_id = rp.poster_id and a.debut <= p_semaine + 6
                                and coalesce(a.fin, a.debut + greatest(coalesce(a.jours, 1), 1) - 1) >= p_semaine)
                      or exists (select 1 from public.posteur_pauses pp where pp.poster_id = rp.poster_id
                                 and (pp.debut at time zone 'Europe/Paris')::date <= p_semaine + 6 and (pp.jusqu_au at time zone 'Europe/Paris')::date >= p_semaine))
                     and coalesce(rp.pourquoi, '') not like 'Absence%' then 'absence déclarée : jours non comptés comme manqués' end,
           case when rp.rattrapage then 'rattrapage d''une semaine reportée' end,
           case when rp.statut <> 'a_payer' and rp.raison_report is not null and coalesce(rp.pourquoi, '') not like 'Kill%' then rp.raison_report end,
           case when rp.raison_calcul is not null and coalesce(rp.pourquoi, '') not like 'Kill%' then rp.raison_calcul end
         ], null), ' · ')
   where ((rp.semaine = p_semaine and (rp.lot_id is null or rp.lot_id = p_lot)) or rp.lot_id = p_lot)
     and rp.statut in ('a_payer', 'reporte', 'annule')
     and coalesce(rp.pourquoi, '') not like 'Kill & don''t pay%';
end;
$$;
revoke all on function public.ruul_lot_ajuster(uuid, date, text) from public, anon, authenticated;

do $p$
declare
  d text := pg_get_functiondef('public.ruul_lot_preparer(date)'::regprocedure);
  a1 text := $a$  update public.ruul_paiements rp
     set statut = case$a$;
  a2 text := $a$  update public.ruul_lots l$a$;
begin
  if position('0809' in d) > 0 then return; end if;
  if position(a1 in d) = 0 or position(a2 in d) = 0 then raise exception '0809 : ruul_lot_preparer a changé'; end if;
  d := replace(d, a1, $a$  perform public.ruul_lot_ajuster(v_lot.id, v_semaine, 'montants'); /* 0809 */
$a$ || a1);
  d := replace(d, a2, $a$  perform public.ruul_lot_ajuster(v_lot.id, v_semaine, 'fin'); /* 0809 */
$a$ || a2);
  execute d;
end
$p$;

-- Les absences dites par message, lues toutes les heures (fonction ruul, action absences_messages).
do $$
begin
  if not exists (select 1 from cron.job j where j.jobname = 'ruul-absences-messages') then
    perform cron.schedule('ruul-absences-messages', '41 * * * *',
      $c$select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/ruul',
          headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
          body := '{"action":"absences_messages"}'::jsonb, timeout_milliseconds := 120000)$c$);
  end if;
end $$;

-- Le récap du lot (page Paie Ruul) : le « pourquoi ce montant » de chaque semaine.
do $p$
declare
  d text := pg_get_functiondef('public.ruul_lot(date)'::regprocedure);
  avant text := $a$'rattrapage', rp.rattrapage,$a$;
begin
  if position('0809' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0809 : ruul_lot a changé'; end if;
  execute replace(d, avant, avant || $a$ 'pourquoi', rp.pourquoi /* 0809 */,$a$);
end
$p$;
