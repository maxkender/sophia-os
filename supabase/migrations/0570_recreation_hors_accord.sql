-- 0570 : une recréation n'est jamais un Double (09/11, Gencay).
--
-- Une recréation remplace un compte : elle ne passe jamais par l'offre Double
-- ni par la pop-up d'accord, réservées aux doubles. Pour la paie de la
-- semaine suivante (paie_suivante_calc) :
--   * le compte recréé (ckd_recreations, 21 jours au plus avant la coupure)
--     compte tout de suite, comme un Double accepté : sans attendre son 1er
--     post avec lien ni la fin de son warm-up ;
--   * un posteur recréé garde le nombre de comptes qu'il a : avant, toute
--     recréation de la semaine ramenait le financement à 1 compte
--     (« financer_normal »), même pour un posteur à 4 comptes.
-- Un posteur à un seul compte recréé reste à 1 compte (« financer_normal »).
-- Additif : paie_suivante_calc patchée en place ; rien n'est financé ici.

do $p$
declare
  d text := pg_get_functiondef('public.paie_suivante_calc(date, jsonb)'::regprocedure);
  avant_col text := $a$exists (select 1 from doubles x where x.nouveau_compte_id = c.id) as double_accepte,$a$;
  apres_col text := $a$exists (select 1 from doubles x where x.nouveau_compte_id = c.id) as double_accepte,
           -- 0570 : compte recréé (remplace un compte, jamais un Double).
           exists (select 1 from public.ckd_recreations r cross join bornes b
                    where r.nouveau_compte_id = c.id
                      and r.created_at <= b.coupure and r.created_at >= b.coupure - interval '21 days') as recree_compte,$a$;
  avant_actif text := $a$                  or exists (select 1 from doubles x where x.nouveau_compte_id = c.id))$a$;
  apres_actif text := $a$                  or exists (select 1 from doubles x where x.nouveau_compte_id = c.id)
                  -- 0570 : compte recréé : financé sans attendre le 1er post (il remplace l'ancien).
                  or exists (select 1 from public.ckd_recreations r cross join bornes b
                              where r.nouveau_compte_id = c.id
                                and r.created_at <= b.coupure and r.created_at >= b.coupure - interval '21 days'))$a$;
  avant_n text := $a$and (cpt.double_accepte or cpt.debut is not null and cpt.debut <= b.suiv))$a$;
  apres_n text := $a$and (cpt.double_accepte or cpt.recree_compte or cpt.debut is not null and cpt.debut <= b.suiv))$a$;
  avant_dec text := $a$             when e.recree then 'financer_normal'$a$;
  apres_dec text := $a$             -- 0570 : un posteur recréé garde ses comptes (plus de retour forcé à 1).
             when e.recree and e.n_suiv >= 2 then 'financer_double'
             when e.recree then 'financer_normal'$a$;
begin
  if position('0570' in d) > 0 then return; end if;
  if position(avant_col in d) = 0 or position(avant_actif in d) = 0
     or position(avant_n in d) = 0 or position(avant_dec in d) = 0 then
    raise exception '0570 : paie_suivante_calc ne correspond pas';
  end if;
  d := replace(d, avant_col, apres_col);
  d := replace(d, avant_actif, apres_actif);
  d := replace(d, avant_n, apres_n);
  d := replace(d, avant_dec, apres_dec);
  execute d;
end
$p$;

-- La page Cohorts (cohortes_postes) : la date « doublé » vient d'une décision
-- Doubler ou d'un événement « deuxieme_compte » (noté à la création de tout
-- compte d'un posteur qui en avait déjà un). Un compte recréé n'est pas un
-- 2e compte : il ne marque plus le posteur comme doublé.
do $c$
declare
  d text := pg_get_functiondef('public.cohortes_postes(date)'::regprocedure);
  avant text := $a$select e.at from public.recrue_evenements e where e.poster_id = p.id and e.type = 'deuxieme_compte'$a$;
  apres text := $a$select e.at from public.recrue_evenements e where e.poster_id = p.id and e.type = 'deuxieme_compte'
               and not exists (select 1 from public.ckd_recreations rc where rc.nouveau_compte_id = e.compte_id) /* 0570 */$a$;
begin
  if position('0570' in d) > 0 then return; end if;
  if position(avant in d) = 0 then
    raise exception '0570 : cohortes_postes ne correspond pas';
  end if;
  execute replace(d, avant, apres);
end
$c$;
