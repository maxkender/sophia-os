-- 0250: répare « l'appli » dans les decks ITALIENS.
--
-- Contexte : le prompt `placement_sophia` imposait la formule française
-- « l'appli Sophia » à toutes les langues (voir 0249). 212 slides de placement
-- en portaient la trace, dont 93 en italien — de loin la langue la plus touchée
-- (24 % de ses slides Sophia), parce que « l'appli » passe pour de l'italien et
-- n'appelle aucune correction du modèle.
--
-- POURQUOI SEULEMENT L'ITALIEN. La substitution « l'appli » -> « l'app » y est
-- mécaniquement sûre : même élision, même genre, même place dans la phrase, et
-- « l'app » est la forme courante en italien. Les 119 autres occurrences (tr,
-- ro, hu, nl, pl, pt, cs, sv, de, es, el, en) demandent un accord ou un ordre de
-- mots propre à chaque langue : elles seront reprises par une re-cuisson des
-- decks, pas par du remplacement de chaîne.
--
-- PRÉCAUTION. Le lookahead `(?![a-zA-Z])` protège « l'applicazione », mot
-- italien parfaitement correct présent une fois dans le stock. Vérifié avant
-- application : 94 slides contiennent « l'appli », 1 est « l'applicazione »,
-- 93 sont remplaçables, aucune majuscule.
--
-- CE QU'ON NE TOUCHE PAS : les passages DÉJÀ PUBLIÉS. Leur texte est en ligne
-- sur TikTok ; réécrire l'enregistrement le désynchroniserait de la réalité.

-- 1) Les decks : c'est le gabarit des passages à venir.
update public.contenu_langues cl
set slides = (
  select jsonb_agg(
           case
             when x.v->>'texte_overlay' ~ 'l''appli(?![a-zA-Z])'
               then jsonb_set(
                      x.v,
                      '{texte_overlay}',
                      to_jsonb(regexp_replace(x.v->>'texte_overlay', 'l''appli(?![a-zA-Z])', 'l''app', 'g'))
                    )
             else x.v
           end
           order by x.ord
         )
  from jsonb_array_elements(cl.slides) with ordinality as x(v, ord)
)
where cl.langue = 'it'
  and exists (
    select 1 from jsonb_array_elements(cl.slides) s
    where s->>'texte_overlay' ~ 'l''appli(?![a-zA-Z])'
  );

-- 2) Les créneaux pas encore publiés : leur snapshot de slides.
update public.passages p
set slides = (
  select jsonb_agg(
           case
             when x.v->>'texte_overlay' ~ 'l''appli(?![a-zA-Z])'
               then jsonb_set(
                      x.v,
                      '{texte_overlay}',
                      to_jsonb(regexp_replace(x.v->>'texte_overlay', 'l''appli(?![a-zA-Z])', 'l''app', 'g'))
                    )
             else x.v
           end
           order by x.ord
         )
  from jsonb_array_elements(p.slides) with ordinality as x(v, ord)
)
where p.langue = 'it'
  and p.publie_at is null
  and exists (
    select 1 from jsonb_array_elements(p.slides) s
    where s->>'texte_overlay' ~ 'l''appli(?![a-zA-Z])'
  );

-- 3) Le post pont : c'est CE texte que le poster copie dans TikTok.
update public.post_slides ps
set texte_overlay = regexp_replace(ps.texte_overlay, 'l''appli(?![a-zA-Z])', 'l''app', 'g')
from public.passages p
where p.post_id = ps.post_id
  and p.langue = 'it'
  and p.publie_at is null
  and ps.texte_overlay ~ 'l''appli(?![a-zA-Z])';
