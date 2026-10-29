-- 0414 — Prompt 21, partie F : le Kill passe par Upwork et termine le contrat.
--
-- 1. Dimanche 12 h : le message de Kill part dans la conversation Upwork du
--    contrat (plus de DM Slack ; la bannière du tableau de bord reste).
--    `kill_message_preparer` dit, sans rien écrire, à qui et quoi ; les
--    colonnes upwork_* de `posteur_messages` gardent l'issue de l'envoi.
--    Nouveau texte `kill_message_texte`.
-- 2. Lundi : `arrets_fins_a_faire()` liste les arrêts « déjà posté » dont la
--    semaine du Kill est finie, payée (API ou case « Payé ») ou à 0 $, contrat
--    pas encore terminé, posteur toujours arrêté. La fonction upwork (cron
--    arrets, :40) supprime les milestones non financées, ne finance rien et
--    termine le contrat ; jamais tant qu'une milestone financée de la semaine
--    reste à payer, sauf à 0 $ (remboursement à demander).
-- 3. `arret_lire(id)` : ce que `arret_os` rend, sans rien désactiver (mode
--    test d'arret_auto : le posteur n'est plus désactivé).
--
-- Additive : 3 colonnes, 3 fonctions. Donnée changée : kill_message_texte.
-- Retour arrière : retirer les colonnes upwork_* de posteur_messages et les
-- 3 fonctions ; remettre l'ancien kill_message_texte.

update public.reglages
   set valeur = to_jsonb('Hi {prenom}, thank you for your work with us. We''re ending our collaboration: please don''t post after Sunday. Your last week will be paid on Monday, then we''ll close the contract. All the best!'::text)
 where cle = 'kill_message_texte';

alter table public.posteur_messages add column if not exists upwork_statut text;
alter table public.posteur_messages add column if not exists upwork_at timestamptz;
alter table public.posteur_messages add column if not exists upwork_erreur text;

comment on column public.posteur_messages.upwork_statut is
  'Prompt 21, F (0414) : le message de Kill sur Upwork : envoye, simule, erreur, sans_contrat.';

-- Le message de Kill d'une proposition validée : à qui, quel texte, déjà parti ?
-- Mêmes conditions que kill_message_creer (0382) : tous les comptes du posteur s'arrêtent.
create or replace function public.kill_message_preparer(p_id uuid)
returns table (poster_id uuid, compte_id uuid, semaine date, texte text, contrat_id text, deja boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  p public.ckd_propositions%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'kill_message_preparer : réservé à la fonction ckd';
  end if;
  select * into p from public.ckd_propositions where id = p_id;
  if not found or p.decision is distinct from 'ne_pas_renouveler' then
    return;
  end if;
  if exists (select 1 from public.comptes c
              where c.poster_id = p.poster_id and c.is_active
                and not exists (select 1 from public.ckd_arrets a
                                 where a.compte_id = c.id and a.annule_at is null and a.fait_at is null)) then
    return;
  end if;
  return query
  select pr.id, p.compte_id, p.jour, public.posteur_texte('kill_message_texte', pr.prenom), pr.upwork_contract_id,
         exists (select 1 from public.posteur_messages m where m.poster_id = pr.id and m.type = 'kill')
    from public.profiles pr where pr.id = p.poster_id;
end;
$$;

revoke execute on function public.kill_message_preparer(uuid) from public, anon, authenticated;
grant execute on function public.kill_message_preparer(uuid) to service_role;

-- arret_os (0403) sans rien changer : pour le mode test.
create or replace function public.arret_lire(p_id uuid)
returns table (poster_id uuid, a_poste boolean, contrat_id text, slack_user_id text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'arret_lire : réservé à la fonction upwork';
  end if;
  return query
  select pr.id,
         exists (select 1 from public.passages p join public.comptes c on c.id = p.compte_id
                  where c.poster_id = pr.id and (p.publie_at is not null or p.publie_url is not null)),
         pr.upwork_contract_id, pr.slack_user_id
    from public.arrets a
    join public.profiles pr on pr.id = a.poster_id
   where a.id = p_id;
end;
$$;

revoke execute on function public.arret_lire(uuid) from public, anon, authenticated;
grant execute on function public.arret_lire(uuid) to service_role;

-- Les fins de contrat à faire : arrêt d'un posteur qui a posté, sa dernière
-- semaine finie (lundi 00:00 Paris passé), payée ou à 0 $.
create or replace function public.arrets_fins_a_faire()
returns table (
  arret_id   uuid,
  poster_id  uuid,
  contrat_id text,
  semaine    date,
  montant    numeric,
  paye_at    timestamptz,
  posts      integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with a as (
    select x.id, x.poster_id, x.etapes,
           -- La semaine du Kill : celle de l'arrêt (créé lundi 00 h 30 pour un Kill du dimanche → la semaine finie).
           (date_trunc('week', (x.created_at at time zone 'Europe/Paris') - interval '6 hours'))::date as w
      from public.arrets x
     where x.statut in ('fait', 'erreur') and x.a_poste
       and exists (select 1 from jsonb_array_elements(coalesce(x.etapes, '[]'::jsonb)) e
                    where e->>'action' = 'paie' and e->>'statut' = 'a_faire')
       and not exists (select 1 from jsonb_array_elements(coalesce(x.etapes, '[]'::jsonb)) e
                        where e->>'action' = 'fermeture' and e->>'statut' in ('fait', 'simule', 'a_faire'))
  )
  select a.id, a.poster_id, pr.upwork_contract_id, a.w,
         (select coalesce(s.montant_corrige, s.montant) from public.paie_semaines s
           where s.poster_id = a.poster_id and s.semaine = a.w and not coalesce(s.exclu, false)
           order by s.calcule_at desc nulls last limit 1),
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
$$;

revoke execute on function public.arrets_fins_a_faire() from public, anon;
grant execute on function public.arrets_fins_a_faire() to authenticated, service_role;

notify pgrst, 'reload schema';
