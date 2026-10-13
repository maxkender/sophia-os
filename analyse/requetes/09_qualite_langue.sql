-- 09 · Comptes sources dont la langue déclarée ne correspond pas au texte.
-- Une langue source fausse fait poster le texte d'origine NON traduit aux
-- comptes de la langue déclarée (langue du compte = langue source → aucune
-- traduction). Cas trouvé le 13/10 : @supermaxing déclaré `en`, en réalité
-- français (corrigé par la migration 0278).
--
-- Détection par mots-outils sur la base source (slides_base, sinon slides) de
-- chaque contenu valide. Couvre en, fr, es, de, it, pt : un compte source dans
-- une autre langue peut ressortir à tort, vérifier son texte avant de conclure.
-- Attendu : aucune ligne.
with t as (
  select r.handle_tiktok, r.langue as declaree, c.id,
         ' ' || lower(regexp_replace(coalesce(cl.slides_base, cl.slides)::text, '[^[:alpha:]]+', ' ', 'g')) || ' ' as txt
  from comptes_reference r
  join contenus c on c.compte_reference_id = r.id and c.statut = 'valide'
  join contenu_langues cl on cl.contenu_id = c.id and cl.langue = c.langue_source),
s as (
  select *,
    (select count(*) from regexp_matches(txt, ' (the|you|your|and|to|of|is|that|with|for) ', 'g')) as en,
    (select count(*) from regexp_matches(txt, ' (les|des|pour|avec|tu|est|une|pas|qui|dans) ', 'g')) as fr,
    (select count(*) from regexp_matches(txt, ' (los|las|para|con|que|una|por|del|tu|es) ', 'g')) as es,
    (select count(*) from regexp_matches(txt, ' (und|der|die|das|du|nicht|ist|mit|ein|zu) ', 'g')) as de,
    (select count(*) from regexp_matches(txt, ' (gli|per|che|non|il|della|di|una|sono) ', 'g')) as it,
    (select count(*) from regexp_matches(txt, ' (você|para|com|não|os|uma|seu|mais) ', 'g')) as pt
  from t),
d as (
  select *, (select k from (values ('en', en), ('fr', fr), ('es', es), ('de', de), ('it', it), ('pt', pt)) v(k, n)
             order by n desc limit 1) as detectee
  from s)
select handle_tiktok, declaree, count(*) as contenus,
       count(*) filter (where detectee = declaree) as concordants,
       mode() within group (order by detectee) as langue_detectee
from d
group by 1, 2
having mode() within group (order by detectee) <> declaree
    or count(*) filter (where detectee <> declaree) > 0.3 * count(*)
order by 3 desc;
