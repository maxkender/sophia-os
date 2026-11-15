-- 0672 : Weekly decisions (Max, 12/11). Une recrue « Start Tuesday » (debut_choix = mardi
-- pour sa semaine de cohorte) n'a pas de posts attendus le lundi : un lundi sans post
-- n'est plus « One day missed ». Les posts du lundi publiés quand même comptent (attendus = publiés).
-- semaine_comptes est réécrite à l'identique, sauf le nombre de posts prévus du lundi
-- (et de la semaine) pour ces recrues. Additif : une fonction remplacée.

do $p$
declare
  d text := pg_get_functiondef('public.semaine_comptes(date,date)'::regprocedure);
  avant1 text := $a$(select count(*) from p where p.compte_id = c.id and p.jour = d::date)::int as prevus,$a$;
  apres1 text := $a$case when d::date = p_lundi and exists (select 1 from public.debut_choix dc
                                                     where dc.poster_id = c.poster_id and dc.lundi = p_lundi and dc.choix = 'mardi')
                then (select count(*) from p where p.compte_id = c.id and p.jour = d::date and p.publie_url is not null)::int
                else (select count(*) from p where p.compte_id = c.id and p.jour = d::date)::int end as prevus,$a$;
  avant2 text := $a$(select count(*) from p where p.compte_id = c.id)::int,
         coalesce((select jsonb_agg$a$;
  apres2 text := $a$(select count(*) from p where p.compte_id = c.id
            and not (p.jour = p_lundi and p.publie_url is null and exists (select 1 from public.debut_choix dc
                                                   where dc.poster_id = c.poster_id and dc.lundi = p_lundi and dc.choix = 'mardi')))::int,
         coalesce((select jsonb_agg$a$;
begin
  if position('debut_choix' in d) > 0 then return; end if;
  if position(avant1 in d) = 0 or position(avant2 in d) = 0 then raise exception '0672 : semaine_comptes, morceau introuvable'; end if;
  execute replace(replace(d, avant1, apres1), avant2, apres2);
end
$p$;
