-- 0585 : règles Ruul et parrainage du 10/11 (page Notion « Règles posteurs Ruul
-- et parrainage »).
--
-- 1. Bonus de parrainage : 10 $ au parrain dès que le filleul a fait sa 1re
--    semaine de posts, une seule fois par filleul (remplace « 14 posts » /
--    « 2 semaines actives »). Filleul payé par l'OS (Upwork) : sa 1re semaine
--    payée (paie_semaines.paye_at). Filleul Ruul (payé par le site) : sa 1re
--    semaine finie (lundi → dimanche) avec au moins `parrainage_posts_min_semaine`
--    posts avec lien.
--    bonus.canal_paie = le canal du PARRAIN : « upwork » → payé sur Upwork
--    (Bonus de lundi, « Tout envoyer ») ; « ruul » → « à payer via Ruul »,
--    jamais envoyé sur Upwork, Max le marque payé (bonus_ruul_payer).
-- 2. hub_parrainages() : tous les referrals pour le site (action hub-posteurs
--    « parrainages »).
-- 3. Bots : le canal de paie du posteur dans ses faits ; un posteur Ruul n'a ni
--    Upwork, ni milestone, ni retenue pour posts manqués.
-- Additif : une colonne, fonctions remplacées ou patchées en place, une règle.

alter table public.bonus add column if not exists canal_paie text not null default 'upwork';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bonus_canal_paie_check') then
    alter table public.bonus add constraint bonus_canal_paie_check check (canal_paie in ('upwork', 'ruul'));
  end if;
end $$;

-- Les bonus de parrainage pas encore payés d'un parrain Ruul passent « à payer via Ruul ».
update public.bonus b set canal_paie = 'ruul'
  from public.profiles p
 where p.id = b.poster_id and p.canal_paie = 'ruul' and b.canal_paie <> 'ruul' and b.statut in ('a_valider', 'a_payer');

/* La 1re semaine (son lundi) qui donne droit au bonus du parrain, ou null. */
create or replace function public.parrainage_semaine_filleul(p_recrue uuid, p_avant date)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select case when coalesce((select pr.canal_paie from public.profiles pr where pr.id = p_recrue), 'upwork') = 'ruul' then
    (select min(s.semaine) from (
        select date_trunc('week', coalesce(ps.date_publication_prevue, (coalesce(ps.publie_at, ps.created_at) at time zone 'Europe/Paris')::date))::date as semaine
          from public.passages ps join public.comptes c on c.id = ps.compte_id
         where c.poster_id = p_recrue and ps.publie_url is not null) s
      where s.semaine + 7 <= p_avant
      group by s.semaine
     having count(*) >= coalesce((select (valeur->>'parrainage_posts_min_semaine')::int from public.reglages where cle = 'bonus'), 12)
      order by s.semaine limit 1)
  else
    (select min(ps.semaine) from public.paie_semaines ps
      where ps.poster_id = p_recrue and ps.paye_at is not null and coalesce(ps.montant_corrige, ps.montant) > 0
        and ps.semaine < p_avant)
  end;
$$;

create or replace function public.parrainage_bonus_lundi(p_lundi date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lundi date := coalesce(p_lundi, public.bonus_lundi_carte());
  r jsonb := public.bonus_reglages();
  n integer;
begin
  if not public.bonus_parrainage_actif() or coalesce((r->>'parrainage_montant')::numeric, 0) <= 0 then return 0; end if;
  insert into public.bonus (poster_id, type, referral_id, recrue_id, lundi_bonus, periode_debut, periode_fin, detail, quantite, montant, statut, canal_paie)
  select f.referrer_id, 'parrainage', f.ref_id, f.recrue, v_lundi, s.semaine, s.semaine + 6,
         format('parrainage de %s, 1re semaine de posts (%s)%s',
                coalesce(nullif(btrim(concat_ws(' ', rp.prenom, rp.nom)), ''), 'filleul'), to_char(s.semaine, 'DD/MM'),
                case when pp.canal_paie = 'ruul' then ' · à payer via Ruul' else '' end),
         1, (r->>'parrainage_montant')::numeric, 'a_valider',
         case when pp.canal_paie = 'ruul' then 'ruul' else 'upwork' end
    from (select distinct on (coalesce(cr.recrue_id, i.recrue_id))
                 cr.id as ref_id, cr.referrer_id, coalesce(cr.recrue_id, i.recrue_id) as recrue
            from public.creator_referrals cr
            left join public.parrainage_invitations i on i.referral_id = cr.id
           where coalesce(cr.recrue_id, i.recrue_id) is not null and cr.referrer_id is not null
             and coalesce(cr.statut, '') <> 'refuse'
           order by coalesce(cr.recrue_id, i.recrue_id), cr.created_at) f
    join public.profiles rp on rp.id = f.recrue
    join public.profiles pp on pp.id = f.referrer_id
    cross join lateral (select public.parrainage_semaine_filleul(f.recrue, v_lundi) as semaine) s
   where s.semaine is not null
     and not exists (select 1 from public.bonus b where b.referral_id = f.ref_id)
     and not exists (select 1 from public.bonus b where b.type = 'parrainage' and b.recrue_id = f.recrue and b.statut <> 'retire')
  on conflict (referral_id) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

/* Un bonus « à payer via Ruul » ajouté par Max au paiement Ruul du lundi. */
create or replace function public.bonus_ruul_payer(p_id uuid, p_paye boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'réservé à l''admin et au Head of Ops'; end if;
  update public.bonus
     set statut = case when p_paye then 'paye' else 'a_valider' end,
         paye_at = case when p_paye then now() end, paye_par = case when p_paye then auth.uid() end,
         raison = case when p_paye then 'payé via Ruul' else raison end
   where id = p_id and canal_paie = 'ruul' and statut in ('a_valider', 'a_payer', 'paye');
end;
$$;

revoke execute on function public.bonus_ruul_payer(uuid, boolean) from public, anon;
grant execute on function public.bonus_ruul_payer(uuid, boolean) to authenticated;

create or replace function public.bonus_carte(p_lundi date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lundi date := coalesce(p_lundi, public.bonus_lundi_carte());
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'réservé à l''admin et au Head of Ops';
  end if;
  with l as (
    select b.*, coalesce(nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), p.email) as nom,
           /* 0585 : un bonus Ruul n'a pas besoin de contrat Upwork. */
           b.canal_paie = 'ruul' or (p.upwork_contract_id is not null and uc.organisation_id = '2074065383597823773') as contrat_ok
      from public.bonus b
      join public.profiles p on p.id = b.poster_id
      left join public.upwork_contrats uc on uc.contrat_id = p.upwork_contract_id
     where b.lundi_bonus = v_lundi
  )
  select jsonb_build_object(
    'lundi', v_lundi,
    'lignes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', l.id, 'type', l.type, 'nom', l.nom, 'detail', l.detail, 'quantite', l.quantite, 'a_verifier', l.a_verifier,
        'tarif', l.tarif, 'zone', l.zone, 'montant', l.montant, 'statut', l.statut, 'erreur', l.erreur, 'raison', l.raison,
        'periode_debut', l.periode_debut, 'periode_fin', l.periode_fin, 'delai_median_min', l.delai_median_min,
        'part_moins_2h', l.part_moins_2h, 'contrat_ok', l.contrat_ok, 'envoi_at', l.envoi_at, 'paye_at', l.paye_at,
        'canal_paie', l.canal_paie)
        order by case l.type when 'comment_master' then 0 when 'parrainage' then 1 else 2 end, l.montant desc) from l), '[]'::jsonb),
    'total', coalesce((select sum(montant) from l where statut in ('a_valider', 'a_payer') and canal_paie = 'upwork'), 0),
    'total_ruul', coalesce((select sum(montant) from l where statut in ('a_valider', 'a_payer') and canal_paie = 'ruul'), 0),
    'paye', coalesce((select sum(montant) from l where statut = 'paye'), 0),
    'parrainages_a_confirmer', (select count(*) from public.parrainages_detections where statut = 'a_confirmer'),
    'test_valide', exists (select 1 from public.upwork_bonus_tests where statut = 'envoye' and valide_at is not null)
  ) into v;
  return v;
end;
$$;

/* 2. Les referrals pour le site (hub-posteurs « parrainages »). */
create or replace function public.hub_parrainages()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', cr.id,
    'created_at', cr.created_at,
    'parrain', jsonb_build_object('id', pr.id, 'nom', btrim(concat_ws(' ', pr.prenom, pr.nom)),
                                  'canal', case when pr.canal_paie = 'ruul' then 'ruul' else 'upwork' end),
    'ami', jsonb_build_object('prenom', coalesce(i.prenom, cr.prenom), 'nom', cr.nom,
                              'email', coalesce(i.email, nullif(lower(btrim(cr.contact_email)), '')),
                              'pays', coalesce(nullif(i.pays, '??'), upper(cr.pays))),
    'invitation', case when i.id is null then null else jsonb_build_object(
        'statut', i.statut,
        'emails', coalesce((select jsonb_agg(jsonb_build_object('etape', case e.etape when 0 then 'J0' when 2 then 'J+2' when 5 then 'J+5' else e.etape::text end,
                                                                'at', e.at, 'ok', e.ok) order by e.at)
                              from public.parrainage_envois e where e.invitation_id = i.id), '[]'::jsonb),
        'ouvert_at', i.ouvert_at, 'clique_at', i.clique_at,
        'desinscrit', i.statut = 'desinscrit' or exists (select 1 from public.parrainage_desinscrits d where d.email = i.email),
        'rebond', i.statut = 'rebond',
        'postule_at', i.postule_at) end,
    'recrue_id', coalesce(cr.recrue_id, i.recrue_id),
    'bonus', (select jsonb_build_object('statut', case when b.statut = 'paye' then 'paye' else 'en_attente' end,
                                        'montant', b.montant, 'canal', b.canal_paie, 'paye_at', b.paye_at, 'cree_at', b.calcule_at)
                from public.bonus b
               where b.type = 'parrainage' and b.statut <> 'retire'
                 and (b.referral_id = cr.id or (b.recrue_id is not null and b.recrue_id = coalesce(cr.recrue_id, i.recrue_id)))
               order by b.calcule_at limit 1)
  ) order by cr.created_at desc), '[]'::jsonb)
    from public.creator_referrals cr
    left join public.profiles pr on pr.id = cr.referrer_id
    left join lateral (select x.* from public.parrainage_invitations x
                        where x.referral_id = cr.id
                           or (x.email = lower(btrim(cr.contact_email)) and nullif(btrim(cr.contact_email), '') is not null)
                        order by (x.referral_id = cr.id) desc, x.cree_at limit 1) i on true;
$$;

revoke execute on function public.hub_parrainages() from public, anon, authenticated;
grant execute on function public.hub_parrainages() to service_role;

/* 3. Le canal de paie du posteur dans ses faits (les bots), et la règle Ruul. */
do $p$
declare
  d text := pg_get_functiondef('public.faq_faits_posteur(uuid)'::regprocedure);
  avant text := $a$    /* 0581 : les amis parrainés et leur statut$a$;
  apres text := $a$    /* 0585 : upwork (payé par l'OS sur Upwork) ou ruul (payé par le site via Ruul). */
    'canal_paie', coalesce(pr.canal_paie, 'upwork'),
    /* 0581 : les amis parrainés et leur statut$a$;
begin
  if position('0585' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0585 : faq_faits_posteur ne correspond pas'; end if;
  execute replace(d, avant, apres);
end
$p$;

insert into public.regles_bots (bot, regle)
select 'tous', r from (values
  ('Posteur Ruul (canal_paie = ruul dans ses faits) : il est payé chaque lundi via Ruul par le site, jamais sur Upwork. Ne parle jamais d''Upwork, de milestone, de « Submit », ni de retenue pour posts manqués. Question d''argent : « Payment questions: send a direct message to the team in #ruul-questions, never in the channel. You are paid every Monday through Ruul. »'),
  ('Parrainage, bonus : 10 $ au parrain dès que l''ami a fait sa 1re semaine de posts, une seule fois par ami. Parrain sur Upwork : payé sur Upwork, sur son contrat. Parrain Ruul : payé via Ruul, avec son paiement du lundi.')
) v(r)
where not exists (select 1 from public.regles_bots b where b.regle = v.r);
