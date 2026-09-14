-- ---------------------------------------------------------------------------
-- Un profil TikTok, un compte.
--
-- `comptes.handle_tiktok` n'a jamais eu de contrainte d'unicité (contrairement
-- à `comptes_reference.handle_tiktok`). Vu en prod : deux comptes actifs, deux
-- CRÉATEURS différents, le même `@sofia.intelepciune718`. Conséquences :
--
--   · le relevé du soir scrape le même profil deux fois et recopie ses vues sur
--     les deux comptes — celui qui ne publie pas affiche 13 800 vues et 0 post,
--     et l'analytics globale compte ce profil en double ;
--   · l'appariement des publications met les créneaux des deux comptes en
--     concurrence sur les mêmes posts (corrigé côté code : l'unicité d'un post
--     se juge désormais sur le profil, pas sur le compte).
--
-- L'index ne peut pas être posé tant que des doublons existent : on le tente,
-- et sinon on dit lesquels nettoyer. La migration est donc sans risque à
-- rejouer — elle ne touche à aucune donnée.
-- ---------------------------------------------------------------------------

do $$
declare
  doublons text;
begin
  select string_agg(format('%s (%s comptes)', d.handle, d.n), ', ' order by d.handle)
  into doublons
  from (
    select lower(btrim(handle_tiktok)) as handle, count(*) as n
    from public.comptes
    where is_active
      and handle_tiktok is not null
      and btrim(handle_tiktok) <> ''
    group by lower(btrim(handle_tiktok))
    having count(*) > 1
  ) d;

  if doublons is null then
    create unique index if not exists comptes_handle_tiktok_actif_uidx
      on public.comptes (lower(btrim(handle_tiktok)))
      where is_active and handle_tiktok is not null and btrim(handle_tiktok) <> '';
    raise notice 'Unicité posée sur comptes.handle_tiktok (comptes actifs).';
  else
    raise warning
      'Index NON posé — profils partagés par plusieurs comptes actifs : %. '
      'Désactive ou corrige le compte en trop, puis rejoue cette migration.',
      doublons;
  end if;
end;
$$;
