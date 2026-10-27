-- 0365 : « Au moins 5 follows et 2 reposts » pendant le warm-up.
--
-- Le scraper voit les abonnements (follows) du compte TikTok
-- (`ckd_warmup_releves.abonnements`, 0356), pas les reposts. Le posteur coche
-- donc « J'ai fait 2 reposts » sur sa page de warm-up : `comptes.warmup_reposts_at`.
-- La HM vérifie dans l'onglet Reposts de son profil TikTok. La colonne du suivi
-- de cohorte (admin et HM) n'affiche OK que si les deux conditions sont remplies.
--
-- Additive : une colonne, une fonction.
-- Retour arrière : drop function public.warmup_reposts(uuid, boolean) ;
-- alter table public.comptes drop column warmup_reposts_at.

alter table public.comptes add column if not exists warmup_reposts_at timestamptz;

comment on column public.comptes.warmup_reposts_at is
  'Warm-up : le posteur a coché « J''ai fait 2 reposts » (0365). Null : pas coché.';

-- Cocher / décocher : le posteur du compte, sa HM, ou l'admin.
create or replace function public.warmup_reposts(p_compte uuid, p_fait boolean)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz;
begin
  if not exists (
    select 1 from public.comptes c
      join public.profiles pr on pr.id = c.poster_id
     where c.id = p_compte
       and (c.poster_id = auth.uid() or pr.manager_id = auth.uid() or public.is_admin())
  ) then
    raise exception 'warmup_reposts : compte introuvable ou pas le tien';
  end if;
  update public.comptes
     set warmup_reposts_at = case when p_fait then coalesce(warmup_reposts_at, now()) end
   where id = p_compte
  returning warmup_reposts_at into v_at;
  return v_at;
end;
$$;

revoke execute on function public.warmup_reposts(uuid, boolean) from public, anon;
grant execute on function public.warmup_reposts(uuid, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
