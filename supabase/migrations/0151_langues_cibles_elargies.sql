-- Nouvelles langues cibles : cs, nl, el, hu, pl, ro, sv, tr.
-- Les listes code (LANGUES_CIBLES) sont dans le front + edge ; ici on amorce
-- les prompts de traduction éditables (repli = prompt générique si absent).

insert into public.prompts (cle, contenu)
select
  'traduction_' || l.code,
  format(
    E'# PROMPT — Traduction & adaptation fluide de slideshow TikTok → %s\n\n'
    'Traduis et adapte le slideshow en %s.\n'
    'Ton naturel, idiomatique, adapté à TikTok. Garde le sens, le rythme et le niveau de langue.\n'
    'Pas de traduction mot à mot. Pas d''anglais résiduel sauf noms propres.',
    l.nom,
    l.nom
  )
from (
  values
    ('cs', 'tchèque'),
    ('nl', 'néerlandais'),
    ('el', 'grec'),
    ('hu', 'hongrois'),
    ('pl', 'polonais'),
    ('ro', 'roumain'),
    ('sv', 'suédois'),
    ('tr', 'turc')
) as l(code, nom)
on conflict (cle) do nothing;
