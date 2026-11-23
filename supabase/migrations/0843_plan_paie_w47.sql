-- 0843 (23/11, Max) : le plan de paie W47 (Control > Paie) : chaque jalon à libérer (par son NUMÉRO, jamais par son
-- nom), à libérer puis fermer, de Grok (jalon trouvé à la relecture), ou bloqué. Rien ne part sans le clic de Max
-- (fonction upwork, action plan_paie_executer, session admin seulement). Ajouts seulement.

create table if not exists public.paie_plan_lignes (
  id uuid primary key default gen_random_uuid(),
  plan text not null,
  groupe text not null check (groupe in ('liberer', 'liberer_fermer', 'grok', 'bloque', 'kill')),
  posteur text not null,
  poster_id uuid references public.profiles(id) on delete set null,
  contrat_id text not null,
  jalon_id text,
  semaine date not null,
  fermer boolean not null default false,
  jamais_fermer boolean not null default false,
  note text,
  statut text not null default 'a_faire' check (statut in ('a_faire', 'en_cours', 'libere', 'ferme', 'erreur', 'bloque', 'deja_paye', 'kille', 'kille_ferme')),
  resultat text,
  jalon_libere text,
  montant numeric,
  envoi_at timestamptz,
  fait_at timestamptz,
  fait_par uuid,
  cree_at timestamptz not null default now(),
  unique (plan, groupe, contrat_id)
);

alter table public.paie_plan_lignes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'paie_plan_lignes' and policyname = 'paie_plan_lignes_admin_lire') then
    create policy paie_plan_lignes_admin_lire on public.paie_plan_lignes for select using (public.is_admin());
  end if;
end $$;

insert into public.paie_plan_lignes (plan, groupe, posteur, poster_id, contrat_id, jalon_id, semaine, fermer, jamais_fermer, note, statut)
select 'W47', v.groupe, v.posteur,
       (select p.id from public.profiles p where p.upwork_contract_id = v.contrat order by p.is_active desc, p.created_at limit 1),
       v.contrat, v.jalon, date '2026-11-16', v.fermer, v.jamais, v.note, case when v.groupe = 'bloque' then 'bloque' else 'a_faire' end
from (values
  ('liberer', 'Almefalani', '44492412', '53005366', false, false, null),
  ('liberer', 'Amir', '44750725', '53005316', false, false, null),
  ('liberer', 'Araque', '44768489', '53005432', false, false, null),
  ('liberer', 'Baciu', '44390534', '53014090', false, false, null),
  ('liberer', 'Burkivski', '44687857', '52736822', false, false, null),
  ('liberer', 'Evren', '44216887', '53005606', false, false, '56 $, 4 comptes : normal'),
  ('liberer', 'Albano', '44740383', '52597779', false, false, null),
  ('liberer', 'Amiga', '44808381', '52782949', false, false, null),
  ('liberer', 'Ari Mayneva', '44859642', '52922126', false, false, null),
  ('liberer', 'M', '44854665', '52859757', false, false, null),
  ('liberer_fermer', 'Artiček', '44856040', '52913168', true, false, 'fermer après paiement confirmé'),
  ('liberer_fermer', 'Meier', '44739439', '52942487', true, false, 'fermer après paiement confirmé'),
  ('grok', 'Bormpoudakis', '44762667', null, false, false, 'dès que Grok a financé'),
  ('grok', 'Daftsiou', '44799935', null, false, false, 'dès que Grok a financé'),
  ('grok', 'Cakmak', '44735138', null, false, false, 'dès que Grok a financé'),
  ('grok', 'Celik', '44738447', null, false, false, 'dès que Grok a financé'),
  ('grok', 'Dibek', '44690085', null, false, false, 'dès que Grok a financé'),
  ('grok', 'dobreba', '44783683', null, false, false, 'dès que Grok a financé'),
  ('grok', 'Lakafosi', '44711049', null, false, false, 'dès que Grok a financé'),
  ('grok', 'Tavares', '44719174', null, false, false, 'dès que Grok a financé'),
  ('grok', 'Thornton', '44751878', null, false, false, 'dès que Grok a financé'),
  ('grok', 'Paganelli', '44706697', null, false, true, 'libérer, ne jamais fermer le contrat (décision de Max)'),
  ('grok', 'Abdullazade', '44792315', null, false, false, 'dès que Grok a financé'),
  ('grok', 'Christou', '44889982', null, false, false, 'dès que Grok a financé'),
  ('grok', 'Kozak', '44768306', null, false, false, 'dès que Grok a financé'),
  ('grok', 'Kazemi', '44805065', null, false, false, 'dès que Grok a financé'),
  ('grok', 'Razaie', '44750632', null, false, false, 'dès que Grok a financé'),
  ('grok', 'Nishandzhiev', '44880029', null, false, false, 'dès que Grok a financé'),
  ('bloque', 'Galacz', '44230577', '53005590', false, true, 'bloqué : 28 $, décision de Max ; contrat non fermé')
) as v(groupe, posteur, contrat, jalon, fermer, jamais, note)
on conflict (plan, groupe, contrat_id) do nothing;

-- Kill « n'a pas posté » (CSV de Max, colonne W48 « NE PAS RENOUVELER ») : désactivation OS (process habituel : arrêt
-- sans message) puis fermeture du contrat seulement si la W47 est payée (relue au clic ; planKill attend sinon).
-- Farawati : pas de contrat, « à décider Max » seulement.
insert into public.paie_plan_lignes (plan, groupe, posteur, poster_id, contrat_id, jalon_id, semaine, fermer, note)
select 'W47', 'kill', v.posteur,
       (select p.id from public.profiles p where p.upwork_contract_id = v.contrat order by p.is_active desc, p.created_at limit 1),
       v.contrat, null, date '2026-11-16', true, v.note
from (values
  ('Abdelrahim', '44721711', 'W47 payée : kill et fermer'), ('Ahadi', '44805206', 'W47 payée : kill et fermer'),
  ('Balazovicova', '44833063', 'W47 payée : kill et fermer'), ('Carrasco', '44679713', 'W47 payée : kill et fermer'),
  ('Fomenko', '44885254', 'W47 payée : kill et fermer'), ('Habibi', '44863364', 'W47 payée : kill et fermer'),
  ('Haider', '44818958', 'W47 payée : kill et fermer'), ('Hradecny', '44818953', 'W47 payée : kill et fermer'),
  ('Jensen', '44861256', 'W47 payée : kill et fermer'), ('Koland', '44750553', 'W47 payée : kill et fermer'),
  ('Kubik', '44706066', 'W47 payée : kill et fermer'), ('Laimou', '44787388', 'W47 payée : kill et fermer'),
  ('Montero', '44844467', 'W47 payée : kill et fermer'), ('Mountain', '44836058', 'W47 payée : kill et fermer'),
  ('Navarro', '44765526', 'W47 payée : kill et fermer'), ('Rahmani', '44781394', 'W47 payée : kill et fermer'),
  ('Raja', '44805117', 'W47 payée : kill et fermer'), ('Tatara', '44832636', 'W47 payée : kill et fermer'),
  ('Zaitoune', '44826963', 'W47 payée : kill et fermer'),
  ('Bormpoudakis', '44762667', 'dû 10 $ : fermer seulement après libération du jalon Grok'),
  ('Daftsiou', '44799935', 'dû 10 $ : fermer seulement après libération du jalon Grok'),
  ('Kozak', '44768306', 'dû 10 $ : fermer seulement après libération du jalon Grok'),
  ('Krainevs', '44818829', 'dû 0 $ : kill sans paie, fermeture possible'),
  ('Razi', '44821542', 'dû 0 $ : kill sans paie, fermeture possible')
) as v(posteur, contrat, note)
on conflict (plan, groupe, contrat_id) do nothing;

-- La désactivation d'un kill du plan (même process que kill_immediat_desactiver : profil et comptes inactifs, arrêt sans
-- message pour le reste : Slack, etc.). Réservée à la fonction upwork (service_role).
create or replace function public.plan_kill_desactiver(p_poster uuid, p_motif text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') not in ('', 'service_role') then
    raise exception 'plan_kill_desactiver : réservé à la fonction upwork' using errcode = '42501';
  end if;
  update public.profiles set is_active = false where id = p_poster and is_active;
  update public.comptes set is_active = false where poster_id = p_poster and is_active;
  if not exists (select 1 from public.arrets a where a.poster_id = p_poster and a.statut in ('a_faire', 'en_cours') and a.annule_at is null) then
    insert into public.arrets (poster_id, source, motif, sans_message) values (p_poster, 'manuel', left(coalesce(p_motif, 'Kill'), 200), true);
  end if;
  return true;
end $$;
revoke all on function public.plan_kill_desactiver(uuid, text) from public, anon, authenticated;

-- Le récap W47 (Control > Paie) : les lignes du plan et l'état réel des lignes de paie de la semaine. Admin seulement.
create or replace function public.paie_recap_plan(p_plan text default 'W47')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_semaine date;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select min(semaine) into v_semaine from public.paie_plan_lignes where plan = p_plan;
  return jsonb_build_object(
    'plan', p_plan,
    'semaine', v_semaine,
    'lignes', coalesce((select jsonb_agg(to_jsonb(l) order by l.groupe, l.posteur) from public.paie_plan_lignes l where l.plan = p_plan), '[]'::jsonb),
    'paie', (select jsonb_build_object(
        'total', count(*),
        'payees', count(*) filter (where s.paye_at is not null),
        'exclues', count(*) filter (where s.exclu),
        'a_verifier', count(*) filter (where s.paye_at is null and not coalesce(s.exclu, false) and s.action = 'a_verifier'),
        'a_payer', count(*) filter (where s.paye_at is null and not coalesce(s.exclu, false) and coalesce(s.action, '') <> 'a_verifier'))
      from public.paie_semaines s where s.semaine = v_semaine),
    'a_decider', jsonb_build_array('Galacz (jalon W47 28 $ bloqué)', 'Paganelli (contrat gardé ouvert)', 'Farawati (aucun contrat lié)', 'm (aucun contrat lié)')
  );
end $$;
revoke all on function public.paie_recap_plan(text) from public, anon;
grant execute on function public.paie_recap_plan(text) to authenticated;

-- Les contrats Upwork ouverts (VIk Studios) sans posteur actif lié, avec leurs jalons financés non libérés (cache
-- upwork_jalons : à relire chez Upwork avant toute action). Lecture seule, liste pour Max : l'OS n'y touche pas.
create or replace function public.paie_contrats_ouverts_sans_posteur()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(x order by (x->>'total')::numeric desc, x->>'contrat_id')
    from (
      select jsonb_build_object(
        'contrat_id', c.contrat_id,
        'freelancer', c.freelancer_nom,
        'titre', c.titre,
        'cache_lu_at', j.lu_at,
        'jalons', coalesce((select jsonb_agg(jsonb_build_object('id', e->>'id', 'nom', e->>'nom', 'etat', e->>'etat', 'montant', coalesce(nullif(coalesce(e->>'depot', e->>'montant'), '')::numeric, 0)))
                            from jsonb_array_elements(coalesce(j.jalons, '[]'::jsonb)) e where e->>'etat' in ('Active', 'Submitted')), '[]'::jsonb),
        'total', coalesce((select sum(coalesce(nullif(coalesce(e->>'depot', e->>'montant'), '')::numeric, 0)) from jsonb_array_elements(coalesce(j.jalons, '[]'::jsonb)) e where e->>'etat' in ('Active', 'Submitted')), 0)
      ) x
      from public.upwork_contrats c
      left join public.upwork_jalons j on j.contrat_id = c.contrat_id
      where c.etat = 'Active' and c.organisation_id = '2074065383597823773'
        and not exists (select 1 from public.profiles p where p.upwork_contract_id = c.contrat_id and p.is_active)
    ) t
  ), '[]'::jsonb);
end $$;
revoke all on function public.paie_contrats_ouverts_sans_posteur() from public, anon;
grant execute on function public.paie_contrats_ouverts_sans_posteur() to authenticated;

-- Le même récap pour le QG (route control/paie) : réservé au service (fonction qg).
create or replace function public.qg_plan_paie(p_plan text default 'W47')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_semaine date; v_ouverts jsonb;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role') then raise exception 'forbidden' using errcode = '42501'; end if;
  select min(semaine) into v_semaine from public.paie_plan_lignes where plan = p_plan;
  select coalesce(jsonb_agg(x order by (x->>'total')::numeric desc), '[]'::jsonb) into v_ouverts
    from (select jsonb_build_object('contrat_id', c.contrat_id, 'freelancer', c.freelancer_nom,
            'total', coalesce((select sum(coalesce(nullif(coalesce(e->>'depot', e->>'montant'), '')::numeric, 0))
                               from jsonb_array_elements(coalesce(j.jalons, '[]'::jsonb)) e where e->>'etat' in ('Active', 'Submitted')), 0)) x
          from public.upwork_contrats c left join public.upwork_jalons j on j.contrat_id = c.contrat_id
          where c.etat = 'Active' and c.organisation_id = '2074065383597823773'
            and not exists (select 1 from public.profiles p where p.upwork_contract_id = c.contrat_id and p.is_active)) t;
  return jsonb_build_object(
    'plan', p_plan, 'semaine', v_semaine,
    'par_statut', coalesce((select jsonb_object_agg(k, n) from (select groupe || ':' || statut k, count(*) n from public.paie_plan_lignes where plan = p_plan group by 1) z), '{}'::jsonb),
    'lignes', coalesce((select jsonb_agg(jsonb_build_object('groupe', l.groupe, 'posteur', l.posteur, 'contrat_id', l.contrat_id, 'jalon_id', coalesce(l.jalon_libere, l.jalon_id),
                         'statut', l.statut, 'resultat', l.resultat, 'note', l.note) order by l.groupe, l.posteur) from public.paie_plan_lignes l where l.plan = p_plan), '[]'::jsonb),
    'paie_semaine', (select jsonb_build_object('total', count(*), 'payees', count(*) filter (where s.paye_at is not null), 'exclues', count(*) filter (where s.exclu),
                       'a_payer', count(*) filter (where s.paye_at is null and not coalesce(s.exclu, false)))
                     from public.paie_semaines s where s.semaine = v_semaine),
    'a_decider', jsonb_build_array('Galacz (jalon W47 28 $ bloqué)', 'Paganelli (contrat gardé ouvert)', 'Farawati (aucun contrat lié)', 'm (aucun contrat lié)'),
    'contrats_ouverts_sans_posteur', jsonb_build_object('nombre', jsonb_array_length(v_ouverts),
        'avec_jalon_finance', (select count(*) from jsonb_array_elements(v_ouverts) x where (x->>'total')::numeric > 0),
        'total_finance', (select coalesce(sum((x->>'total')::numeric), 0) from jsonb_array_elements(v_ouverts) x),
        'liste', v_ouverts)
  );
end $$;
revoke all on function public.qg_plan_paie(text) from public, anon, authenticated;
