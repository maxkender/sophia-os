-- 0568 : lancement du parrainage par email (accord de Max, 08/11).
--
-- 1. parrainage_email_actif = on : le bloc « Refer a friend » apparaît sur les
--    dashboards et chaque nouvelle invitation reçoit son email J0 dans les
--    10 minutes (puis J+2, J+5).
-- 2. Tous les pays ouverts (envoi et recrutement), sauf le Portugal.
-- 3. Les anciennes déclarations « Refer a friend » (creator_referrals en
--    attente, avec un email valide) reçoivent aussi l'email : sauf le
--    Portugal, sauf une personne déjà dans l'OS, déjà invitée ou désinscrite.
--    La langue déclarée donne le pays de l'email (pt-BR → BR, es-419 → MX…).
-- 4. Bonus de parrainage : 10 $ dès que l'ami a au moins 14 posts avec lien
--    (au lieu de 2 semaines à 12 posts) ; toujours payé au clic de Max.
-- 5. Pop-up « Refer a friend » à la prochaine connexion (à partir du 9/11)
--    pour chaque posteur actif ; « Got it » la ferme.

update public.reglages set valeur = 'true'::jsonb, updated_at = now() where cle = 'parrainage_email_actif';

update public.parrainage_pays
   set envoi_auto = (pays <> 'PT'), recrutement_ouvert = (pays <> 'PT'), maj_at = now()
 where (envoi_auto, recrutement_ouvert) is distinct from (pays <> 'PT', pays <> 'PT');

-- 3. Les anciennes déclarations.
with m(langue, pays) as (values
  ('pt-BR', 'BR'), ('tr', 'TR'), ('en', 'US'), ('es', 'ES'), ('de', 'DE'), ('pl', 'PL'), ('it', 'IT'),
  ('es-419', 'MX'), ('hu', 'HU'), ('ro', 'RO'), ('sl', 'SI'), ('sr', 'RS'), ('no', 'NO'), ('ru', 'KZ'),
  ('fr', 'FR'), ('el', 'GR'), ('sv', 'SE'), ('fi', 'FI'), ('ar', 'AE'), ('cs', 'CZ'), ('bg', 'BG'),
  ('nl', 'NL'), ('da', 'DK'), ('sk', 'SK'), ('hr', 'HR'), ('ja', 'JP')),
f as (
  select distinct on (lower(btrim(r.contact_email)))
         r.id, r.referrer_id, lower(btrim(r.contact_email)) as email, left(btrim(coalesce(nullif(r.prenom, ''), 'there')), 60) as prenom,
         m.pays
    from public.creator_referrals r
    join m on m.langue = r.pays
    join public.parrainage_pays pp on pp.pays = m.pays and pp.envoi_auto and pp.recrutement_ouvert
   where r.statut = 'en_attente' and r.recrue_id is null
     and r.pays <> 'pt'
     and r.contact_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
     and not exists (select 1 from public.parrainage_invitations i where i.email = lower(btrim(r.contact_email)))
     and not exists (select 1 from public.parrainage_desinscrits d where d.email = lower(btrim(r.contact_email)))
     and not exists (select 1 from public.profiles p where lower(p.email) = lower(btrim(r.contact_email)) or lower(p.email_perso) = lower(btrim(r.contact_email)))
   order by lower(btrim(r.contact_email)), r.created_at
)
insert into public.parrainage_invitations (referral_id, parrain_id, email, prenom, pays, langue, code, statut, prochain_at)
select f.id, f.referrer_id, f.email, f.prenom, f.pays, public.parrainage_langue_pays(f.pays), public.parrainage_code(f.referrer_id), 'a_envoyer', now()
  from f;

-- 4. La règle du bonus : 14 posts avec lien.
update public.reglages set valeur = valeur || jsonb_build_object('parrainage_posts_min_total', 14), updated_at = now() where cle = 'bonus';

create or replace function public.bonus_posts_avec_lien(p_poster uuid, p_fin date)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.passages x
    join public.comptes c on c.id = x.compte_id
   where c.poster_id = p_poster
     and not coalesce(x.est_rappel, false)
     and x.publie_url is not null
     and x.date_publication_prevue <= p_fin;
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
  v_min int := coalesce((select (valeur->>'parrainage_posts_min_total')::int from public.reglages where cle = 'bonus'), 14);
  n integer;
begin
  if not public.bonus_parrainage_actif() or coalesce((r->>'parrainage_montant')::numeric, 0) <= 0 then return 0; end if;
  insert into public.bonus (poster_id, type, referral_id, recrue_id, lundi_bonus, periode_debut, periode_fin, detail, quantite, montant, statut)
  select f.referrer_id, 'parrainage', f.id, f.recrue_id, v_lundi, f.created_at::date, v_lundi - 1,
         format('parrainage de %s, %s posts avec lien', coalesce(nullif(btrim(concat_ws(' ', rp.prenom, rp.nom)), ''), 'filleul'), s.n),
         s.n, (r->>'parrainage_montant')::numeric, 'a_valider'
    from public.creator_referrals f
    join public.profiles rp on rp.id = f.recrue_id
    cross join lateral (select public.bonus_posts_avec_lien(f.recrue_id, v_lundi - 1) as n) s
   where f.statut = 'accepte' and f.recrue_id is not null
     and s.n >= v_min
     and not exists (select 1 from public.bonus b where b.referral_id = f.id)
  on conflict (referral_id) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.parrainage_bonus_lundi(date) from public, anon, authenticated;
revoke execute on function public.bonus_posts_avec_lien(uuid, date) from public, anon, authenticated;

-- Le lundi 9/11 recalculé avec la nouvelle règle (les lignes déjà là restent).
select public.parrainage_bonus_lundi('2026-11-09');

-- 5. Le pop-up « Refer a friend » (nouveau type « info » : affiché sur le dashboard seulement).
alter table public.posteur_messages drop constraint if exists posteur_messages_type_check;
alter table public.posteur_messages add constraint posteur_messages_type_check
  check (type in ('kill', 'double', 'recreer', 'nudge', 'info'));

create or replace function public.mes_messages_posteur()
returns table(id uuid, type text, texte text, expire_at timestamptz, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.type, m.texte, m.expire_at, m.created_at
    from public.posteur_messages m
    left join public.ckd_propositions p on p.id = m.proposition_id
   where m.poster_id = auth.uid()
     and m.visible_de <= now()
     and (
       (m.type = 'double' and m.reponse is null and (m.expire_at is null or m.expire_at > now())
          and p.decision = 'doubler')
       or (m.type = 'kill' and m.created_at > now() - interval '7 days'
          and (p.id is null or p.decision = 'ne_pas_renouveler'))
       or (m.type = 'recreer' and m.lu_at is null and m.created_at > now() - interval '10 days')
       or (m.type = 'info' and m.lu_at is null and (m.expire_at is null or m.expire_at > now()))
     )
   order by m.created_at desc;
$$;

insert into public.posteur_messages (poster_id, type, semaine, texte, visible_de, expire_at)
select p.id, 'info', date '2026-11-09',
       'Don''t forget: if you refer a friend, you can earn $10 per friend once they start posting and reach at least 14 posts. '
       || 'The bonus can go up to $100 if your friend''s account becomes one of our top performers. '
       || 'Friends from any country can join. Use the « Refer a friend » box on your dashboard.',
       (timestamp '2026-11-09 00:00' at time zone 'Europe/Paris'),
       (timestamp '2026-11-23 00:00' at time zone 'Europe/Paris')
  from public.profiles p
 where p.is_active
   and exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'poster')
on conflict (poster_id, type, semaine) do nothing;
