-- 0863 (26/11, Max) : un nom identique ne bloque plus l'acceptation automatique de Join.
--  1. join_candidatures.alertes : ce que l'admin doit voir sans que la candidature attende (à part des manques).
--  2. join_doublons : les doublons de NOM (autre candidature Join, posteur de l'OS, candidature du site) deviennent des
--     ALERTES (« alerte : … ») ; un email ou un téléphone déjà connu reste un doublon (« doublon : … ») : un vrai manque,
--     la candidature va à l'admin (« a_traiter »). Join sépare les deux (separerDoublons, _shared/join.ts).
-- Additive : une colonne avec un défaut, la même signature de fonction (create or replace).

alter table public.join_candidatures add column if not exists alertes text[] not null default '{}'::text[];

create or replace function public.join_doublons(p_candidature uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select j.id, j.test, lower(btrim(j.email)) as email, j.whatsapp_e164 as tel, j.profile_id,
           regexp_replace(lower(btrim(coalesce(j.prenom, '') || ' ' || coalesce(j.nom, ''))), '\s+', ' ', 'g') as nom
      from public.join_candidatures j where j.id = p_candidature
  ),
  autres as (
    select j.* from public.join_candidatures j, c
     where j.id <> c.id and j.test = c.test and j.expire_at is null and coalesce(j.decision, '') <> 'refusee'
  )
  select coalesce(array_remove(array[
    case when exists (select 1 from autres a, c where lower(btrim(a.email)) = c.email)
         then 'doublon : email déjà dans une autre candidature Join' end,
    case when exists (select 1 from autres a, c where a.whatsapp_e164 = c.tel)
         then 'doublon : téléphone déjà dans une autre candidature Join' end,
    case when exists (select 1 from autres a, c where regexp_replace(lower(btrim(coalesce(a.prenom, '') || ' ' || coalesce(a.nom, ''))), '\s+', ' ', 'g') = c.nom)
         then 'alerte : même nom qu''une autre candidature Join' end,
    case when exists (select 1 from public.profiles p, c
                       where p.id is distinct from c.profile_id
                         and c.email in (lower(btrim(p.email)), lower(btrim(p.email_perso)), lower(btrim(p.ruul_email))))
         then 'doublon : email déjà sur une fiche de l''OS' end,
    case when exists (select 1 from public.profiles p, c
                       where p.id is distinct from c.profile_id
                         and regexp_replace(lower(btrim(coalesce(p.prenom, '') || ' ' || coalesce(p.nom, ''))), '\s+', ' ', 'g') = c.nom
                         and exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'poster'))
         then 'alerte : même nom qu''un posteur de l''OS' end,
    case when exists (select 1 from public.posteur_contacts pc, c where pc.whatsapp_e164 = c.tel and pc.poster_id is distinct from c.profile_id)
         then 'doublon : téléphone déjà connu (contacts WhatsApp de l''OS)' end,
    case when exists (select 1 from public.hub_posteurs h, c where lower(btrim(h.email_perso)) = c.email and h.hub_id <> c.id::text)
         then 'doublon : email déjà dans le Hub' end,
    case when exists (select 1 from public.ruul_candidatures rc, c where lower(btrim(rc.email)) = c.email and rc.site_id <> c.id)
         then 'doublon : email déjà candidat sur le site' end,
    case when exists (select 1 from public.ruul_candidatures rc, c
                       where rc.site_id <> c.id and regexp_replace(lower(btrim(coalesce(rc.nom, ''))), '\s+', ' ', 'g') = c.nom)
         then 'alerte : même nom qu''une candidature du site' end
  ], null), '{}'::text[])
    from c;
$$;
revoke all on function public.join_doublons(uuid) from public, anon, authenticated;
grant execute on function public.join_doublons(uuid) to service_role;

notify pgrst, 'reload schema';
