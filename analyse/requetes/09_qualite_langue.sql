-- 09 · Contenus dont la langue source est fausse : la base `en` est en réalité
-- en français, donc les comptes anglais reçoivent le texte d'origine NON
-- traduit (langue_source = langue du compte → aucune traduction).
-- Heuristique : mots-outils français présents, mots-outils anglais absents.
-- Adapter la liste de mots pour chercher d'autres langues.
with x as (
  select c.id, c.statut, c.tier, c.compte_reference_id,
         lower(coalesce(cl.slides->0->>'texte_overlay', '') || ' ' || coalesce(cl.slides->1->>'texte_overlay', '')
               || ' ' || coalesce(cl.slides->2->>'texte_overlay', '')) as t
  from contenus c
  join contenu_langues cl on cl.contenu_id = c.id and cl.langue = 'en'
  where c.langue_source = 'en'),
fr as (select * from x
       where t ~ '\m(comment|pourquoi|devenir|choses|être|ça|tu|ton|tes|les|des|une|qui|pour|avec|sans)\M'
         and t !~ '\m(the|you|your|and|to|how)\M')
select r.handle_tiktok as compte_source, r.langue as langue_declaree, count(*) as contenus,
       count(*) filter (where fr.statut = 'valide' and fr.tier <> 'D') as servables,
       (select count(*) from passages p where p.langue = 'en' and p.contenu_id in (select id from fr)) as passages_en
from fr left join comptes_reference r on r.id = fr.compte_reference_id
group by 1, 2 order by 3 desc;
