-- 0539 : le relevé des vues (metriques → compte_metrics, post_metrics, passages) par lots.
--
-- Un seul appel pour ~400 comptes s'arrêtait à 150 s (504) après 9 à 20 comptes.
-- Maintenant chaque appel relève au plus un lot de comptes (les moins récemment
-- relevés d'abord, pas ceux relevés depuis moins de 20 h), et la tâche
-- `metriques-soir` passe toutes les 10 minutes de 17:00 à 21:50 UTC (30 appels).
-- Rien n'est supprimé ; seul l'horaire de la tâche change.

create or replace function public.metriques_comptes_a_relever(p_limite integer default 12)
returns table(id uuid, handle_tiktok text, dernier_releve timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.handle_tiktok, m.dernier
    from public.comptes c
    left join lateral (select max(cm.collecte_at) as dernier from public.compte_metrics cm where cm.compte_id = c.id) m on true
   where c.is_active and c.handle_tiktok is not null
     and (m.dernier is null or m.dernier < now() - interval '20 hours')
   order by m.dernier nulls first, c.id
   limit greatest(1, least(coalesce(p_limite, 12), 50));
$$;

revoke execute on function public.metriques_comptes_a_relever(integer) from public, anon, authenticated;
grant execute on function public.metriques_comptes_a_relever(integer) to service_role;

do $c$
declare
  v_id bigint;
begin
  select jobid into v_id from cron.job where jobname = 'metriques-soir';
  if v_id is null then
    raise exception '0539 : cron metriques-soir introuvable';
  end if;
  perform cron.alter_job(v_id, schedule := '*/10 17-21 * * *');
end
$c$;
