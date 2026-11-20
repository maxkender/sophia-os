-- 0783 : le contrôle shadowban de 6 h (`ckd-shadowban`) est coupé à 120 s
--   depuis trois matins (18, 19 et 20/11) : la table `ckd_shadowban` n'est plus
--   rafraîchie depuis le 17/11. Sa durée montait vite : 4 s le 9/11, 43 s le
--   11/11, 77 s le 16/11.
--   Cause : dans `ckd_shadowban_calculer`, le bloc `serie` (début de la série
--   de posts morts) relisait tous les passages de 60 jours (≈ 28 600) deux fois
--   PAR COMPTE, et Postgres refaisait ce bloc entier pour chaque compte signalé
--   (boucle imbriquée, plan vu le 20/11) : des milliards de lignes relues.
--   Le bloc est réécrit en deux agrégats (`bon` : le dernier post au-dessus du
--   seuil ; `serie` : le premier post mesuré après). Même résultat : un compte
--   sans post mesuré après son dernier bon post n'a pas de ligne, donc `depuis`
--   nul, comme avant.
--   Mesuré le 20/11 sur la requête corrigée : 0,7 s au lieu de plus de 120 s,
--   25 comptes signalés, date « depuis » identique à l'ancienne formule.
-- Le corps est corrigé en place (comme 0575), le reste de la fonction ne bouge pas.
-- ✅ Appliquée le 2026-11-20 (MCP). Idempotente (sans effet si déjà corrigée).

do $do$
declare
  v_def text := pg_get_functiondef('public.ckd_shadowban_calculer(date)'::regprocedure);
  v_ancien text := substring(v_def from '(serie as \(.*?from cpt c\n  \),)');
  v_nouveau text := $n$bon as (
    select pp.compte_id, max(pp.jour) as dernier
      from pp join cpt c on c.id = pp.compte_id
     where pp.mesure48 and pp.vues >= c.seuil_mort
     group by pp.compte_id
  ),
  serie as (
    select pp.compte_id, min(pp.jour) as depuis
      from pp left join bon b on b.compte_id = pp.compte_id
     where pp.mesure48 and pp.jour > coalesce(b.dernier, '-infinity'::date)
     group by pp.compte_id
  ),$n$;
begin
  if v_def like '%bon as (%' then
    raise notice '0783 : déjà corrigée';
    return;
  end if;
  if v_ancien is null then
    raise exception '0783 : bloc « serie » introuvable dans ckd_shadowban_calculer';
  end if;
  execute replace(v_def, v_ancien, v_nouveau);
end
$do$;
