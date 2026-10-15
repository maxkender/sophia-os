-- 0284 : les comptes qu'aucune ligne de recrutement ne peut accueillir.
--
-- Un compte sans pays n'apparaît dans AUCUNE ligne de la table Notion
-- « Recruitment Targets ». Ce n'est pas une erreur visible : le chiffre d'un
-- pays est simplement un cran trop bas, et rien ne le signale. C'est le seul
-- défaut capable de rendre ce tableau faux en silence.
--
-- Le trigger `comptes_pays_defaut` (0281) ferme le cas des 24 langues qui ne
-- désignent qu'un marché. Restent les quatre langues ambiguës : `en` (six
-- marchés), `ar`, `es-419` et `ru`. Pour celles-là personne ne peut deviner à
-- la place du HM, et le formulaire de création exige désormais le pays. Mais
-- un compte créé AVANT ce formulaire, ou par un chemin futur qu'on n'a pas vu
-- venir, peut encore arriver ici.
--
-- Cette vue est le filet. Le job `notion-hired` la lit chaque nuit et alerte
-- dans #target-updates s'il y a quelque chose. Elle est aussi faite pour être
-- lue à la main : `select * from comptes_sans_pays;` répond à « pourquoi mon
-- pays affiche un de moins que ce que je compte ».
--
-- Le compte marque (`cm`) est exclu, comme partout : il n'a pas de marché.
--
-- Retour arrière : `drop view public.comptes_sans_pays;`

create or replace view public.comptes_sans_pays
with (security_invoker = true) as
select
  c.id,
  c.handle_tiktok,
  c.langue,
  c.is_active,
  c.created_at,
  p.email as poster_email,
  nullif(btrim(concat_ws(' ', p.prenom, p.nom)), '') as poster
from public.comptes c
join public.profiles p on p.id = c.poster_id
where c.pays is null
  and coalesce(c.type_compte, '') <> 'cm'
order by c.created_at desc;

comment on view public.comptes_sans_pays is
  'Comptes sans pays, donc comptés dans aucune ligne des cibles de recrutement. Lu chaque nuit par notion-hired, qui alerte dans Slack. Normalement vide : le trigger comptes_pays_defaut couvre 24 langues, et le formulaire exige le pays pour en/ar/es-419/ru.';

grant select on public.comptes_sans_pays to authenticated, service_role;
