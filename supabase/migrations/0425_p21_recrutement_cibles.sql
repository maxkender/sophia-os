-- 0425 — Prompt 21, partie D : les cibles de recrutement par pays (le samedi).
--
-- `recrutement_cibles(p_depuis)` : pour chaque cohorte (lundi) depuis
-- `p_depuis` (défaut : il y a 3 semaines) et chaque pays, la cible notée le
-- samedi (`ckd_recrutement`, 0364), les recrutés et l'écart.
--   - recrutés : les posteurs (hors cohorte RUUL) dont la 1re cohorte est
--     celle-là (avant un éventuel report) et dont le pays (1er compte perso,
--     sinon l'accueil) est celui-là ;
--   - écart : cible - recrutés (jamais négatif) ;
--   - l'admin voit tout, y compris les pays recrutés sans cible ; une HM ne
--     voit que ses lignes envoyées (comme la RLS de ckd_recrutement).
-- Lue par la carte admin (Decisions) et l'espace HM (My cohort, Recruit).
--
-- Additive : une fonction. Aucune donnée changée.
-- Retour arrière : retirer la fonction recrutement_cibles(date).

create or replace function public.recrutement_cibles(p_depuis date default null)
returns table (
  controle_id uuid,
  cohorte     date,
  pays        text,
  hm_id       uuid,
  cible       integer,
  recrutes    integer,
  ecart       integer,
  envoye_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_admin   boolean := coalesce(auth.role(), '') = 'service_role' or public.is_admin();
  v_moi     uuid := auth.uid();
  v_depuis  date := coalesce(p_depuis, (now() at time zone 'Europe/Paris')::date - 21);
begin
  if not v_admin and not exists (select 1 from public.user_roles r where r.user_id = v_moi
                                   and r.role::text in ('hiring_manager', 'directing_manager', 'head_of_ops')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with recrues as (
    select coalesce((select min(rr.periode) from public.recrues_rouges rr
                      where rr.poster_id = pr.id and rr.decision = 'reporter'), pr.cohorte_lundi) as cohorte,
           upper(coalesce((select c.pays from public.comptes c
                            where c.poster_id = pr.id and c.type_compte = 'perso' and c.pays is not null
                            order by c.created_at limit 1),
                          (select a.pays from public.accueils a
                            where a.poster_id = pr.id and a.pays is not null
                            order by a.created_at desc limit 1))) as pays
      from public.profiles pr
     where pr.cohorte_lundi is not null
       and pr.cohorte_lundi >= v_depuis - 28
       and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
  ),
  comptes_pays as (
    select cohorte, pays, count(*)::int as n from recrues
     where cohorte >= v_depuis and pays is not null
     group by cohorte, pays
  ),
  cibles as (
    select distinct on (k.cohorte, k.pays) k.controle_id, k.cohorte, upper(k.pays) as pays, k.hm_id, k.nombre, k.envoye_at
      from public.ckd_recrutement k
     where k.cohorte >= v_depuis
     order by k.cohorte, k.pays, k.maj_at desc nulls last
  )
  select x.controle_id, coalesce(x.cohorte, n.cohorte), coalesce(x.pays, n.pays), x.hm_id,
         coalesce(x.nombre, 0), coalesce(n.n, 0), greatest(coalesce(x.nombre, 0) - coalesce(n.n, 0), 0), x.envoye_at
    from cibles x
    full join comptes_pays n on n.cohorte = x.cohorte and n.pays = x.pays
   where v_admin
      or (x.hm_id = v_moi and x.envoye_at is not null)
   order by 2 desc, 3;
end;
$$;

revoke execute on function public.recrutement_cibles(date) from public, anon;
grant execute on function public.recrutement_cibles(date) to authenticated, service_role;
