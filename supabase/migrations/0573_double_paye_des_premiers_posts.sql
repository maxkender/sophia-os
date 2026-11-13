-- 0573 : le 2e compte d'un doublé n'est payé qu'à partir de sa première
-- semaine de posts, jamais pendant le warm-up (règle de Max, 9/11).
--
-- Avant (0536) : un Double accepté comptait pour 2 dès le lundi suivant,
-- même 2e compte pas créé ou en warm-up. Maintenant, pour la semaine
-- suivante (paie_suivante_calc), le 2e compte ne compte que si sa première
-- semaine de posts (lundi de son 1er jour de post, ou fin du warm-up) est
-- commencée au lundi financé. La 1re semaine entamée en cours de route reste
-- rattrapée par la milestone de complément (B9, au plus un tarif).
-- Un compte recréé (0570) compte toujours tout de suite : il remplace l'ancien.
-- Additif : paie_suivante_calc patchée en place ; rien n'est financé ici.

do $p$
declare
  d text := pg_get_functiondef('public.paie_suivante_calc(date, jsonb)'::regprocedure);
  avant_n text := $a$and (cpt.double_accepte or cpt.recree_compte or cpt.debut is not null and cpt.debut <= b.suiv))$a$;
  apres_n text := $a$and (cpt.recree_compte or cpt.debut is not null and cpt.debut <= b.suiv)) /* 0573 : plus de Double compté pendant le warm-up */$a$;
  avant_pas_cree text := $a$            + (select count(*) from doubles x
                where x.poster_id = l.poster_id and x.nouveau_compte_id is null
                  and exists (select 1 from cpt where cpt.poster_id = l.poster_id and cpt.actif)))::int as n_suiv,$a$;
  apres_pas_cree text := $a$            /* 0573 : un 2e compte pas encore créé ne compte pas */ + 0)::int as n_suiv,$a$;
begin
  if position('0573' in d) > 0 then return; end if;
  if position(avant_n in d) = 0 or position(avant_pas_cree in d) = 0 then
    raise exception '0573 : paie_suivante_calc ne correspond pas';
  end if;
  d := replace(d, avant_n, apres_n);
  d := replace(d, avant_pas_cree, apres_pas_cree);
  execute d;
end
$p$;
