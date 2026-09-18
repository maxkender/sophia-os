-- Recrutements : les directing_managers (Amanda HU/TR, Regina DE, …) ont
-- un vrai pipeline créateurs. Le seed 0222 ne prenait que hiring_manager
-- → Turquie / Hongrie à 0 HM / 0 créateurs.

insert into public.recrutement_hms (
  profile_id, prenom, nom, nom_affiche, email_os, pays,
  rejoint_os_at, talks_at, codes_envoyes_at
)
select
  p.id,
  p.prenom,
  p.nom,
  coalesce(
    nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''),
    p.email,
    p.id::text
  ),
  p.email,
  case
    when p.langues is not null and cardinality(p.langues) > 0 then p.langues
    when p.nationalite is not null then array[p.nationalite]
    else '{}'::text[]
  end,
  p.created_at,
  p.created_at,
  p.created_at
from public.profiles p
join public.user_roles ur
  on ur.user_id = p.id
 and ur.role in ('hiring_manager', 'directing_manager')
where lower(coalesce(p.email, '')) not like 'testt%'
  and lower(coalesce(p.prenom, '')) <> 'testt'
on conflict (profile_id) do nothing;

insert into public.recrutement_createurs (
  hm_id, profile_id, pays, prenom, nom, nom_affiche, email_os,
  avatar_url, rejoint_os_at, talks_at, codes_envoyes_at,
  warmup_at, premier_post_at
)
select distinct on (hm.id, poster.id, coalesce(c.langue, hm.pays[1], 'fr'))
  hm.id,
  poster.id,
  coalesce(c.langue, hm.pays[1], 'fr'),
  poster.prenom,
  poster.nom,
  coalesce(
    nullif(btrim(concat_ws(' ', poster.prenom, poster.nom)), ''),
    poster.email,
    poster.id::text
  ),
  poster.email,
  c.avatar_url,
  poster.created_at,
  poster.created_at,
  poster.created_at,
  c.warmup_started_at,
  (
    select min(po.publie_at)
    from public.posts po
    join public.comptes cx on cx.id = po.compte_id
    where cx.poster_id = poster.id
      and cx.langue = coalesce(c.langue, hm.pays[1], 'fr')
      and po.est_test is not true
      and po.publie_at is not null
  )
from public.recrutement_hms hm
join public.profiles poster on poster.manager_id = hm.profile_id
join public.user_roles ur on ur.user_id = poster.id and ur.role = 'poster'
left join public.comptes c
  on c.poster_id = poster.id and c.is_active
where not exists (
  select 1
  from public.recrutement_createurs x
  where x.hm_id = hm.id
    and x.profile_id = poster.id
    and x.pays = coalesce(c.langue, hm.pays[1], 'fr')
)
order by hm.id, poster.id, coalesce(c.langue, hm.pays[1], 'fr'), c.created_at;
