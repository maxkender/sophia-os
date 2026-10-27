-- 0367 : « Postpone » — reporter un posteur à la cohorte suivante, depuis le
-- dashboard HM (27/10).
--
-- La cohorte d'un compte est le lundi de son premier post prévu, sinon celui de
-- la fin de son warm-up (0356, `ckd_cohorte_comptes`). Reporter un compte :
--   1. ses posts pas encore publiés sont retirés (passages, puis leurs posts),
--      comme le fait la recharge d'un post (`revoquer-post`) ;
--   2. la fin de son warm-up passe au lundi 00:00 (Paris) de la semaine
--      suivante : le moteur ne lui assigne plus rien d'ici là, et il entre
--      dans la cohorte de ce lundi.
-- Refusé si le compte a déjà publié (il poste déjà : rien à reporter) ou si son
-- warm-up n'est pas lancé (il rejoint déjà la prochaine cohorte tout seul).
--
-- Droits : l'admin, le Head of Ops, la HM du posteur ou sa DM
-- (`peut_gerer_createur`).
--
-- Additive : une fonction. Aucune donnée touchée par la migration elle-même.
-- Retour arrière : drop function public.cohorte_reporter_compte(uuid).

create or replace function public.cohorte_reporter_compte(p_compte uuid)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.comptes%rowtype;
  v_auj date := (now() at time zone 'Europe/Paris')::date;
  v_lundi date;
  v_nouveau date;
  v_posts uuid[];
begin
  select * into c from public.comptes where id = p_compte for update;
  if not found then
    raise exception 'cohorte_reporter_compte : compte introuvable';
  end if;
  if coalesce(auth.role(), '') <> 'service_role' and not public.peut_gerer_createur(c.poster_id) then
    raise exception 'cohorte_reporter_compte : réservé à l''admin et à la HM du posteur';
  end if;
  if c.warmup_ends_at is null then
    raise exception 'cohorte_reporter_compte : warm-up pas lancé, le compte rejoint déjà la prochaine cohorte';
  end if;
  if exists (select 1 from public.passages p
              where p.compte_id = p_compte
                and (p.publie_url is not null or p.publie_at is not null or p.statut::text = 'publie')) then
    raise exception 'cohorte_reporter_compte : le compte a déjà publié, il poste déjà';
  end if;

  -- Le lundi de sa cohorte actuelle : premier post prévu, sinon fin du warm-up.
  select min(p.date_publication_prevue) into v_lundi
    from public.passages p
   where p.compte_id = p_compte and not coalesce(p.est_rappel, false) and p.statut::text <> 'brouillon';
  v_lundi := coalesce(v_lundi, (c.warmup_ends_at at time zone 'Europe/Paris')::date);
  v_lundi := v_lundi - (extract(isodow from v_lundi)::int - 1);
  v_nouveau := v_lundi + 7;
  -- Jamais dans le passé : au pire, le lundi qui vient.
  if v_nouveau <= v_auj then
    v_nouveau := v_auj + (8 - extract(isodow from v_auj)::int);
  end if;

  select coalesce(array_agg(distinct p.post_id) filter (where p.post_id is not null), '{}')
    into v_posts
    from public.passages p
   where p.compte_id = p_compte;
  delete from public.passages p where p.compte_id = p_compte;
  delete from public.posts po
   where po.id = any(v_posts)
     and po.publie_at is null
     and po.publie_url is null
     and not exists (select 1 from public.passages x where x.post_id = po.id);

  update public.comptes
     set warmup_ends_at = (v_nouveau::timestamp at time zone 'Europe/Paris')
   where id = p_compte;
  return v_nouveau;
end;
$$;

revoke execute on function public.cohorte_reporter_compte(uuid) from public, anon;
grant execute on function public.cohorte_reporter_compte(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
