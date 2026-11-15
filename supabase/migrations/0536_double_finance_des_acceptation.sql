-- 0536 : un Double est financé dès que le posteur accepte, au lundi suivant.
--
-- Avant (prompt 21, B9) : le 2e compte d'un Double n'était compté dans la
-- milestone de la semaine suivante qu'après son 1er post avec lien ; la
-- 1re semaine se rattrapait par une milestone de complément.
-- Maintenant : un Double accepté (message « double », réponse « oui », la
-- proposition toujours « doubler ») avant la coupure du lundi 10 h compte pour
-- 2 dès ce lundi, même si le 2e compte n'a pas encore posté, n'a pas fini son
-- warm-up ou n'est pas encore créé. La fenêtre est de 21 jours après
-- l'acceptation ; ensuite la règle normale reprend (le compte doit poster).
-- Rien n'est financé par l'API : la ligne apparaît dans Who to fund.
-- Le complément (paiement.ts) reste pour un Double accepté après la coupure.

do $p$
declare
  d text := pg_get_functiondef('public.paie_suivante_calc(date, jsonb)'::regprocedure);
  avant_cpt text := $a$  cpt as (
    select c.id, c.poster_id,$a$;
  apres_cpt text := $a$  -- 0536 : les Doubles acceptés avant la coupure (21 jours au plus) : comptés pour 2 dès le lundi suivant.
  doubles as (
    select distinct on (m.poster_id) m.poster_id, p.nouveau_compte_id
      from public.posteur_messages m
      join public.ckd_propositions p on p.id = m.proposition_id
     cross join bornes b
     where m.type = 'double' and m.reponse = 'oui' and p.decision = 'doubler'
       and m.repondu_at <= b.coupure and m.repondu_at >= b.coupure - interval '21 days'
       and m.poster_id in (select l.poster_id from lignes l)
     order by m.poster_id, m.repondu_at desc
  ),
  cpt as (
    select c.id, c.poster_id,
           exists (select 1 from doubles x where x.nouveau_compte_id = c.id) as double_accepte,$a$;
  avant_b9 text := $a$                  or exists (select 1 from public.passages p where p.compte_id = c.id and p.publie_url is not null))$a$;
  apres_b9 text := $a$                  or exists (select 1 from public.passages p where p.compte_id = c.id and p.publie_url is not null)
                  -- 0536 : Double accepté : financé sans attendre le 1er post.
                  or exists (select 1 from doubles x where x.nouveau_compte_id = c.id))$a$;
  avant_n text := $a$           (select count(*) from cpt cross join bornes b
             where cpt.poster_id = l.poster_id and cpt.actif
               and cpt.debut is not null and cpt.debut <= b.suiv)::int as n_suiv,$a$;
  apres_n text := $a$           ((select count(*) from cpt cross join bornes b
             where cpt.poster_id = l.poster_id and cpt.actif
               and (cpt.double_accepte or cpt.debut is not null and cpt.debut <= b.suiv))
            -- 0536 : Double accepté, 2e compte pas encore créé : il compte déjà (si le 1er compte est là).
            + (select count(*) from doubles x
                where x.poster_id = l.poster_id and x.nouveau_compte_id is null
                  and exists (select 1 from cpt where cpt.poster_id = l.poster_id and cpt.actif)))::int as n_suiv,$a$;
begin
  if position(avant_cpt in d) = 0 then raise exception '0536 : cpt introuvable'; end if;
  if position(avant_b9 in d) = 0 then raise exception '0536 : clause B9 introuvable'; end if;
  if position(avant_n in d) = 0 then raise exception '0536 : n_suiv introuvable'; end if;
  d := replace(d, avant_cpt, apres_cpt);
  d := replace(d, avant_b9, apres_b9);
  d := replace(d, avant_n, apres_n);
  d := replace(d, '-- Prompt 21, B9 : un 2e compte n''est financé qu''après son 1er post avec lien',
                  '-- Prompt 21, B9 (0536 : sauf Double accepté) : un 2e compte n''est financé qu''après son 1er post avec lien');
  execute d;
end
$p$;

-- Le texte de la ligne de paie (Problèmes → Payroll) suit la nouvelle règle.
do $p$
declare
  d text := pg_get_functiondef('public.paie_decisions_sources(date)'::regprocedure);
  avant text := ' : +1 milestone (2e compte) dès son 1er post avec lien';
begin
  if position(avant in d) = 0 then raise exception '0536 : texte Double introuvable'; end if;
  d := replace(d, avant, ' : financé pour 2 comptes dès qu''''il accepte, au lundi suivant');
  execute d;
end
$p$;
