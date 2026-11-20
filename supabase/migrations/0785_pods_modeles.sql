-- 0785 : le compte modèle d'un podz devient un vrai champ (`pods.modeles`).
--
-- Jusqu'ici le modèle (le compte TikTok dont le podz reprend le style, voir
-- `pods/GLOSSAIRE.md`) n'existait que dans le nom du podz (« Remakes @fathom0g
-- (Sophia) ») et dans son AGENT.md. La page Podz le lisait dans le nom : les
-- podz sans « @ » dans leur nom n'en affichaient pas (alpha_male, RH, la page
-- blanche…).
--
-- `pods.modeles` : les handles TikTok, sans « @ ». Rempli pour tous les podz :
-- depuis leur nom quand il en cite un, sinon depuis leur AGENT.md (liste
-- ci-dessous). Rien ne lit ce champ pour décider quoi que ce soit : il sert à
-- l'affichage et aux agents.
--
-- Le FORMAT d'un podz, lui, ne devient pas un champ : il se lit déjà dans
-- `pods.langues` (une liste : images finies ; nul : texte + banque). Un champ
-- de plus ferait deux vérités à tenir d'accord, ce que 0781 vient de défaire
-- pour les langues.
--
-- ✅ Appliquée le 2026-11-20 (MCP) : les 24 podz de slideshows ont leur modèle
-- (le podz vidéo n'en a pas).
--
-- Additive. Retour arrière : `alter table public.pods drop column modeles`.

set lock_timeout = '5s';

alter table public.pods add column if not exists modeles text[] not null default '{}';

comment on column public.pods.modeles is
  'Les comptes modèles du podz (0785) : les handles TikTok, sans @, dont il reprend le style. Rien n''est importé de ces comptes. Affichage et agents seulement.';

-- Depuis le nom du podz (« Remakes @fathom0g (Sophia) »).
update public.pods p
   set modeles = x.handles
  from (select slug, array_agg(lower(regexp_replace(m[1], '\.+$', '')) order by ord) as handles
          from public.pods, regexp_matches(nom, '@([A-Za-z0-9._]+)', 'g') with ordinality as t(m, ord)
         group by slug) x
 where x.slug = p.slug and p.modeles = '{}';

-- Depuis leur AGENT.md, pour ceux dont le nom ne cite aucun compte.
update public.pods p
   set modeles = v.handles
  from (values
    ('page_blanche', array['amayareading']),
    ('originaux_weird_alpha', array['mentoridaily']),
    ('originaux_alpha_yellow', array['stonemag.co']),
    ('originaux_rh', array['careerswemma']),
    ('originaux_beau_smart_girl', array['studyavec_lea']),
    ('originaux_smart_girl', array['gilmoreobssesed']),
    ('originaux_alpha_male', array['selfsculpt_', 'millyjhino']),
    ('originaux_clean_study', array['studyy.hackz', 'katy._.studies', 'icedlattebrunette']),
    ('originaux_plony', array['_plony_']),
    ('originaux_atala', array['hannah.run5', 'katrina.run']),
    ('originaux_atala_wellness', array['healthy_with_emma6'])
  ) as v(slug, handles)
 where v.slug = p.slug and p.modeles = '{}';
