-- 0640 : Pilotage → « Vues par jour » : les vues des posts publiés chaque jour.
--
-- Le graphique lisait `vues_globales_jour.vues_delta` (0166) : l'écart entre
-- deux totaux, chacun la somme, sur les comptes actifs du moment, de la
-- dernière ligne `compte_metrics`. Or `compte_metrics.vues` est la somme des
-- vues des 12 derniers posts du profil (POSTS_RELEVES du rattrapage). Ce n'est
-- pas un compteur qui ne fait que monter : chaque nouveau post en fait sortir
-- un ancien, avec ses vues. Un compte stable donne un écart proche de zéro ; un
-- compte qui pousse un vieux post viral hors de ses 12 fait baisser le total ;
-- un compte désactivé emporte toutes ses vues (−955 k le 6/10, −510 k le
-- 28/10), une cohorte qui entre ajoute les siennes d'un coup (+4,3 M le 12/10 ;
-- 326 comptes le 2/11 contre 235 la veille).
--
-- Ici : par jour de publication prévu, la somme des vues relevées sur les posts
-- publiés ce jour-là (hors posts de test). Chaque post compte une fois, pour son
-- jour, avec ses dernières vues relevées. Le rattrapage de minuit relit les
-- posts des 4 derniers jours (RATTRAPAGE_JOURS_DEFAUT) : un jour est figé
-- 3 jours après ; les deux jours d'avant restent provisoires (la page les
-- montre en clair).
--
-- Remplace aussi la vue `vues_gagnees_jour`, créée à la main le 2/11 pendant
-- l'enquête (écart compte par compte de `compte_metrics`) : même défaut de
-- fond, la fenêtre des 12 posts. Jamais lue par l'OS.
--
-- Appliquée le 2/11 (API de gestion). Retour arrière :
--   drop view public.vues_par_jour_publication;
-- (la table `vues_globales_jour` et son snapshot restent en place.)

drop view if exists public.vues_gagnees_jour;

create or replace view public.vues_par_jour_publication
  with (security_invoker = true)
as
select p.date_publication_prevue as jour,
       sum(p.vues)::bigint as vues,
       count(*)::integer as posts_publies,
       count(p.vues)::integer as posts_mesures,
       count(distinct p.compte_id) filter (where p.vues is not null)::integer as nb_comptes
  from public.passages p
  left join public.posts po on po.id = p.post_id
 where p.statut = 'publie'
   and not coalesce(po.est_test, false)
   and p.date_publication_prevue >= (now() at time zone 'Europe/Paris')::date - 120
 group by p.date_publication_prevue;

comment on view public.vues_par_jour_publication is
  '0640 : vues des posts publiés chaque jour (jour de publication prévu, hors tests), dernières vues relevées. Pilotage → Vues par jour.';

grant select on public.vues_par_jour_publication to authenticated;
