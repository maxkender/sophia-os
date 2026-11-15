-- 0569 : la page « Bonus » (Recruitment automation) : l'historique des bonus
-- envoyés (payés ou en échec), du plus récent au plus ancien.

create or replace function public.bonus_historique(p_limite int default 300)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'réservé à l''admin et au Head of Ops';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', b.id, 'type', b.type, 'nom', coalesce(nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), p.email),
             'detail', b.detail, 'montant', b.montant, 'statut', b.statut, 'lundi', b.lundi_bonus,
             'envoi_at', b.envoi_at, 'paye_at', b.paye_at, 'erreur', b.erreur, 'facture', b.upwork_invoice)
           order by coalesce(b.paye_at, b.envoi_at) desc)
      from (select * from public.bonus
             where envoi_at is not null or statut = 'paye'
             order by coalesce(paye_at, envoi_at) desc nulls last
             limit greatest(1, least(p_limite, 1000))) b
      join public.profiles p on p.id = b.poster_id), '[]'::jsonb);
end;
$$;

revoke execute on function public.bonus_historique(int) from public, anon;
grant execute on function public.bonus_historique(int) to authenticated;
