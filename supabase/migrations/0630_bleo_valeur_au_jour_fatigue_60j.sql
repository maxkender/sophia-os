-- 0630 : BLEO, la valeur du rapport compte la fatigue comme le tirage (D41).
--
-- `bleo_valeur_au_jour` (rapport de 22 h : plan contre réel) comptait la
-- fatigue sur tous les passages d'avant le jour, depuis toujours. Depuis 0612
-- (D41), la nuit et le tirage ne comptent que les passages des 60 derniers
-- jours (`valeur.fatigue_jours`), et un passage non publié seulement jusqu'à
-- 3 jours après sa date (`valeur.fatigue_attente_jours`). Le plan était donc
-- jugé avec une règle qui n'était pas celle qui l'avait tiré. Même fenêtre ici,
-- comptée depuis le jour comparé.
--
-- Retour arrière : rejouer la fonction de 0603.

set lock_timeout = '5s';

create or replace function public.bleo_valeur_au_jour(p_contenu uuid, p_langue text, p_jour date)
returns numeric
language sql
stable
set search_path to 'public'
as $function$
  with reg as (select valeur from reglages where cle = 'bleo'),
  c as (select id, famille_id, created_at from contenus where id = p_contenu),
  avant as (
    select count(*) filter (where p.contenu_id = p_contenu) as n_post,
           count(*) filter (where p.contenu_id <> p_contenu) as n_accroche
      from passages p
      join contenus c2 on c2.id = p.contenu_id, reg
     where p.langue = p_langue and p.date_publication_prevue < p_jour
       and p.statut in ('assigne', 'valide_par_poster', 'publie')
       and c2.famille_id = (select famille_id from c)
       -- D41 : la fatigue s'oublie après `fatigue_jours` jours ; un passage jamais
       -- publié ne compte que `fatigue_attente_jours` jours après sa date.
       and p.date_publication_prevue >= p_jour - coalesce((reg.valeur->'valeur'->>'fatigue_jours')::int, 60)
       and (p.statut = 'publie'
            or p.date_publication_prevue >= p_jour - coalesce((reg.valeur->'valeur'->>'fatigue_attente_jours')::int, 3))
  )
  select v.forme
         * power((reg.valeur->'valeur'->>'fatigue_post')::numeric, avant.n_post)
         * power((reg.valeur->'valeur'->>'fatigue_accroche')::numeric, avant.n_accroche)
         * case when (select created_at from c) < p_jour::timestamp - make_interval(days => (reg.valeur->'valeur'->>'age_jours')::int)
                then (reg.valeur->'valeur'->>'age_facteur')::numeric else 1 end
    from bleo_valeurs v, reg, avant
   where v.contenu_id = p_contenu and v.langue = p_langue
$function$;
