-- 0753 : kills, parties 1 et 2 (Max, 18/11). Ce que le posteur voit quand sa collaboration s'arrête ou qu'un de ses
-- deux comptes est désactivé.
-- 1. posteur_textes : les textes au posteur (page « collaboration terminée », bandeau « un de vos comptes… »), écrits
--    en anglais puis traduits dans sa langue par la fonction support (même source que le bot) ; « Got it » (vu_at) et
--    message de fin envoyé une seule fois (envoye_at).
-- 2. fin_collaboration_cas : kill (arrêté par nous) / demande (à sa demande) / null (vraiment en attente d'activation).
-- 3. ma_fin_collaboration, mes_bandeaux_compte, bandeau_compte_vu : lectures et clic du posteur.
-- 4. textes_fin_a_faire, texte_poster_ecrire, texte_poster_envoye : pour la fonction support (service).
-- (Le retrait des posts planifiés d'un compte killé est dans 0754.)
-- Additif : une table, des fonctions.

create table if not exists public.posteur_textes (
  poster_id uuid not null references public.profiles(id),
  cle text not null,
  texte_en text not null,
  texte text not null,
  langue text,
  maj_at timestamptz not null default now(),
  vu_at timestamptz,
  envoye_at timestamptz,
  envoi_erreur text,
  primary key (poster_id, cle)
);
alter table public.posteur_textes enable row level security;
do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'posteur_textes' and policyname = 'posteur_textes_lire') then
    create policy posteur_textes_lire on public.posteur_textes for select to authenticated
      using (poster_id = auth.uid() or public.is_admin());
  end if;
end
$p$;

-- Kill, demande du posteur, ou rien (posteur actif, ou nouveau compte pas encore activé).
create or replace function public.fin_collaboration_cas(p_poster uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with pr as (select p.id, p.is_active from public.profiles p where p.id = p_poster),
  act as (select count(*) as n from public.comptes c where c.poster_id = p_poster and c.is_active),
  ar as (select a.source, nullif(btrim(coalesce(a.motif, '')), '') as motif, a.created_at
           from public.arrets a where a.poster_id = p_poster and a.annule_at is null
          order by a.created_at desc limit 1),
  kc as (select c.non_renouveler_raison as raison, coalesce(c.non_renouveler_at, a.fait_at) as le
           from public.comptes c left join public.ckd_arrets a on a.compte_id = c.id and a.annule_at is null
          where c.poster_id = p_poster and c.non_renouveler and not c.is_active
          order by coalesce(c.non_renouveler_at, a.fait_at) desc nulls last limit 1),
  dem as (select d.decide_at from public.demandes_arret d where d.poster_id = p_poster and d.decision is not null
          order by d.decide_at desc nulls last limit 1)
  select case
    when (select is_active from pr) and (select n from act) > 0 then null
    when exists (select 1 from ar) then jsonb_build_object(
      'cas', case when (select source from ar) = 'je_ne_veux_plus'
                       or (select motif from ar) ~* 'ended by freelancer|arrêté par le posteur' then 'demande' else 'kill' end,
      'le', (select created_at from ar),
      'motif', coalesce((select motif from ar), (select raison from kc)),
      'source', (select source from ar))
    when (select n from act) = 0 and exists (select 1 from kc) then jsonb_build_object(
      'cas', case when exists (select 1 from dem) then 'demande' else 'kill' end,
      'le', coalesce((select le from kc), (select decide_at from dem)),
      'motif', (select raison from kc), 'source', 'ckd')
    else null end;
$$;

-- Le posteur connecté : son cas et le texte traduit (null tant que la traduction n'est pas prête).
create or replace function public.ma_fin_collaboration()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when f is null then null
              else f || jsonb_build_object('texte', (select t.texte from public.posteur_textes t where t.poster_id = auth.uid() and t.cle = 'fin'))
         end
    from (select public.fin_collaboration_cas(auth.uid()) as f) x;
$$;

create or replace function public.mes_bandeaux_compte()
returns table (cle text, texte text, maj_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select t.cle, t.texte, t.maj_at from public.posteur_textes t
   where t.poster_id = auth.uid() and t.cle like 'compte_arrete:%' and t.vu_at is null
   order by t.maj_at desc;
$$;

create or replace function public.bandeau_compte_vu(p_cle text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.posteur_textes set vu_at = now() where poster_id = auth.uid() and cle = p_cle and vu_at is null;
$$;

-- À écrire ou rafraîchir (la fonction support compose le texte depuis support_etat_reel, le traduit, l'écrit).
create or replace function public.textes_fin_a_faire(p_limite integer default 40)
returns table (poster_id uuid, cle text, cas text, le timestamptz, motif text, compte_id uuid, handle text, autre text,
               montant numeric, langue text, email text, envoye boolean, texte_en text)
language sql
stable
security definer
set search_path = public
as $$
  with fins as (
    select pr.id, public.fin_collaboration_cas(pr.id) as f, pr.email,
           coalesce(pr.ruul_tarif_semaine, pr.tarif_hebdo) as tarif
      from public.profiles pr
     where not pr.is_active or not exists (select 1 from public.comptes c where c.poster_id = pr.id and c.is_active)
  ),
  a_faire as (
    select f.id, 'fin'::text as cle, f.f->>'cas' as cas, (f.f->>'le')::timestamptz as le, f.f->>'motif' as motif,
           null::uuid as compte_id, null::text as handle, null::text as autre, null::numeric as montant, f.email, t.maj_at as deja
      from fins f left join public.posteur_textes t on t.poster_id = f.id and t.cle = 'fin'
     where f.f is not null and (t.maj_at is null or t.maj_at < now() - interval '1 day')
    union all
    select pr.id, 'compte_arrete:' || c.id, 'compte', coalesce(c.non_renouveler_at, a.fait_at), c.non_renouveler_raison,
           c.id, c.handle_tiktok,
           (select o.handle_tiktok from public.comptes o where o.poster_id = pr.id and o.is_active and o.id <> c.id
             order by o.created_at limit 1),
           coalesce(pr.ruul_tarif_semaine, pr.tarif_hebdo), pr.email, null
      from public.comptes c
      join public.profiles pr on pr.id = c.poster_id
      left join public.ckd_arrets a on a.compte_id = c.id and a.annule_at is null
     where coalesce(c.type_compte, 'perso') = 'perso' and c.non_renouveler and not c.is_active
       and coalesce(c.non_renouveler_at, a.fait_at) > now() - interval '21 days'
       and pr.is_active
       and exists (select 1 from public.comptes o where o.poster_id = pr.id and o.is_active and o.id <> c.id
                     and coalesce(o.type_compte, 'perso') = 'perso')
       and not exists (select 1 from public.posteur_textes t where t.poster_id = pr.id and t.cle = 'compte_arrete:' || c.id)
  )
  select x.id, x.cle, x.cas, x.le, x.motif, x.compte_id, x.handle, x.autre, x.montant,
         public.parrainage_langue_pays((select c.pays from public.comptes c where c.poster_id = x.id
                                         order by c.is_active desc, c.created_at limit 1)),
         x.email,
         coalesce((select t.envoye_at is not null from public.posteur_textes t where t.poster_id = x.id and t.cle = x.cle), false),
         (select t.texte_en from public.posteur_textes t where t.poster_id = x.id and t.cle = x.cle)
    from a_faire x
   order by (x.deja is null) desc, x.le desc nulls last
   limit greatest(1, least(coalesce(p_limite, 40), 200));
$$;

create or replace function public.texte_poster_ecrire(p_poster uuid, p_cle text, p_en text, p_texte text, p_langue text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.posteur_textes (poster_id, cle, texte_en, texte, langue, maj_at)
  values (p_poster, p_cle, p_en, p_texte, p_langue, now())
  on conflict (poster_id, cle) do update
     set texte_en = excluded.texte_en, texte = excluded.texte, langue = excluded.langue, maj_at = now();
$$;

create or replace function public.texte_poster_envoye(p_poster uuid, p_cle text, p_erreur text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.posteur_textes
     set envoye_at = case when p_erreur is null then now() else envoye_at end, envoi_erreur = p_erreur
   where poster_id = p_poster and cle = p_cle;
$$;

revoke all on function public.fin_collaboration_cas(uuid) from public, anon, authenticated;
revoke all on function public.textes_fin_a_faire(integer) from public, anon, authenticated;
revoke all on function public.texte_poster_ecrire(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.texte_poster_envoye(uuid, text, text) from public, anon, authenticated;
revoke all on function public.ma_fin_collaboration() from public, anon;
revoke all on function public.mes_bandeaux_compte() from public, anon;
revoke all on function public.bandeau_compte_vu(text) from public, anon;
grant execute on function public.fin_collaboration_cas(uuid) to service_role;
grant execute on function public.textes_fin_a_faire(integer) to service_role;
grant execute on function public.texte_poster_ecrire(uuid, text, text, text, text) to service_role;
grant execute on function public.texte_poster_envoye(uuid, text, text) to service_role;
grant execute on function public.ma_fin_collaboration() to authenticated;
grant execute on function public.mes_bandeaux_compte() to authenticated;
grant execute on function public.bandeau_compte_vu(text) to authenticated;
