-- 0754 : kills, partie 1 b) (Max, 18/11). Un compte killé perd ses posts planifiés après aujourd'hui (Paris),
-- pas encore publiés, et leurs posts orphelins jamais publiés, comme au Recreate du jeudi. Les posts déjà publiés
-- et ceux du jour ne bougent pas. Appelé par ckd_arreter_comptes pour chaque compte arrêté.
-- Les posts planifiés après aujourd'hui (Paris), pas encore publiés, d'un compte killé : retirés (et leurs posts
-- orphelins jamais publiés), comme au Recreate du jeudi.
create or replace function public.retirer_posts_futurs(p_compte uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_auj date := (now() at time zone 'Europe/Paris')::date;
  v_posts uuid[];
  v_n integer;
begin
  select coalesce(array_agg(distinct p.post_id) filter (where p.post_id is not null), '{}') into v_posts
    from public.passages p
   where p.compte_id = p_compte and p.date_publication_prevue > v_auj
     and p.publie_url is null and p.publie_at is null and p.statut::text <> 'publie';
  delete from public.passages p
   where p.compte_id = p_compte and p.date_publication_prevue > v_auj
     and p.publie_url is null and p.publie_at is null and p.statut::text <> 'publie';
  get diagnostics v_n = row_count;
  delete from public.posts po
   where po.id = any(v_posts) and po.publie_at is null and po.publie_url is null
     and not exists (select 1 from public.passages x where x.post_id = po.id);
  return v_n;
end;
$function$;

do $p$
declare
  d text := pg_get_functiondef('public.ckd_arreter_comptes()'::regprocedure);
  avant text := $a$    update public.comptes set is_active = false where id = r.compte_id;
    update public.ckd_arrets set fait_at = now() where compte_id = r.compte_id;$a$;
begin
  if position('0753' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0753 : ckd_arreter_comptes ne correspond pas'; end if;
  execute replace(d, avant, avant || $a$
    perform public.retirer_posts_futurs(r.compte_id); /* 0753 */$a$);
end
$p$;

revoke all on function public.retirer_posts_futurs(uuid) from public, anon, authenticated;
grant execute on function public.retirer_posts_futurs(uuid) to service_role;
