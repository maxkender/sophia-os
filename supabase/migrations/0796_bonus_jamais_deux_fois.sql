-- 0796 : un bonus n'est jamais payé deux fois (Max, 20/11 : « il ne faut pas ajouter les 5 $ au lundi si tu les
-- paies »). Concerne les bonus payés par Ruul (questionnaire, parrainage, Comment Masters…).
-- 1. Le lot Ruul : un bonus déjà rattaché à la ligne d'une autre semaine (reportée, à payer ou payée) n'est pas
--    rajouté à la semaine suivante ; il part une seule fois, avec la ligne qui le porte déjà.
-- 2. « Payé via Ruul » à la main (carte Bonus de lundi) : refusé pour un bonus déjà dans une ligne du lot Ruul
--    (il sera payé par le lot, une seule fois).

-- 1.
do $$
declare
  d text := pg_get_functiondef('public.ruul_lot_preparer(date)'::regprocedure);
  avant text := '   where b.canal_paie = ''ruul'' and b.statut in (''a_valider'', ''a_payer'') and b.montant > 0
   group by b.poster_id';
  apres text := '   where b.canal_paie = ''ruul'' and b.statut in (''a_valider'', ''a_payer'') and b.montant > 0
     -- 0796 : jamais deux fois le même bonus (déjà sur la ligne d''une autre semaine).
     and not exists (select 1 from public.ruul_paiements x
                      where b.id = any(x.bonus_ids) and x.semaine <> v_semaine and x.statut <> ''annule'')
   group by b.poster_id';
begin
  if position('0796' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0796 : ruul_lot_preparer a changé'; end if;
  execute replace(d, avant, apres);
end $$;

-- 2.
create or replace function public.bonus_ruul_payer(p_id uuid, p_paye boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'réservé à l''admin et au Head of Ops'; end if;
  if p_paye and exists (select 1 from public.ruul_paiements x where p_id = any(x.bonus_ids) and x.statut <> 'annule') then
    raise exception 'ce bonus est déjà dans le lot Ruul : il est payé avec le lot, pas à la main';
  end if;
  update public.bonus
     set statut = case when p_paye then 'paye' else 'a_valider' end,
         paye_at = case when p_paye then now() end, paye_par = case when p_paye then auth.uid() end,
         raison = case when p_paye then 'payé via Ruul' else raison end
   where id = p_id and canal_paie = 'ruul' and statut in ('a_valider', 'a_payer', 'paye');
end;
$$;
revoke execute on function public.bonus_ruul_payer(uuid, boolean) from public, anon;
grant execute on function public.bonus_ruul_payer(uuid, boolean) to authenticated;
