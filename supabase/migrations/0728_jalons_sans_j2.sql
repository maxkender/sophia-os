-- 0728 : J+2 retiré (Adrien, 15/11 : « pas besoin »). Le relevé de nuit
-- revient à J+1, J+3 et J+7 ; `pods_series` garde sa colonne moy_j2 (vide).
do $$
declare d text := pg_get_functiondef('public.passage_vues_photographier()'::regprocedure);
begin
  if position('(v_auj - 1, v_auj - 2, v_auj - 3, v_auj - 7)' in d) > 0 then
    execute replace(d, '(v_auj - 1, v_auj - 2, v_auj - 3, v_auj - 7)', '(v_auj - 1, v_auj - 3, v_auj - 7)');
  end if;
end $$;

insert into supabase_migrations.schema_migrations (version, name, statements)
values (to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS'), 'jalons_sans_j2', array['voir 0728']);
