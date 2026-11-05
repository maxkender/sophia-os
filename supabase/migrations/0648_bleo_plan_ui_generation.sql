-- 0648 : la page Plan de BLEO montre la génération et le type de chaque contenu.
--
-- Adrien (5/11) : « je peux voir exactement lesquels de la récolte viennent des
-- déclinaisons ? ». Une déclinaison d'une famille gagnante hérite de « gagnant » et
-- part en récolte sans test : dans le plan, rien ne la distinguait d'un gagnant
-- prouvé. La vue ajoute `generation` (0 = original, 1 = G1, 2 = G2) et `type_bleo`
-- (declinaison, full_test, remake, historique…), à la fin, sans rien changer d'autre.
-- Affichage seulement : le tirage n'est pas touché.

create or replace view public.bleo_plan_ui with (security_invoker = true) as
 SELECT o.id,
    o.run_id,
    r.jour_vise,
    o.compte_id,
    co.handle_tiktok,
    o.creneau,
    o.contenu_id,
    c.titre,
    c.famille_id,
    COALESCE(f.accroche_norm, c.titre) AS accroche,
    o.langue,
    a.slug AS application,
    o.label_id,
    l.slug AS label,
    o.file_bleo,
    o.categorie,
    round(o.valeur_tirage, 3) AS valeur_tirage,
    o.relache,
    c.etat_bleo,
    c.verdict,
    reel.titres AS reel_titres,
    COALESCE(o.contenu_id = ANY (reel.contenus), false) AS identique_au_reel,
    c.generation,
    c.type_bleo
   FROM bleo_ombre_passages o
     JOIN bleo_runs r ON r.id = o.run_id
     LEFT JOIN comptes co ON co.id = o.compte_id
     LEFT JOIN contenus c ON c.id = o.contenu_id
     LEFT JOIN bleo_familles f ON f.id = c.famille_id
     LEFT JOIN applications a ON a.id = o.application_id
     LEFT JOIN labels l ON l.id = o.label_id
     LEFT JOIN LATERAL ( SELECT array_agg(p.contenu_id) AS contenus,
            string_agg(COALESCE(pc.titre, '?'::text), ' · '::text ORDER BY p.created_at) AS titres
           FROM passages p
             LEFT JOIN contenus pc ON pc.id = p.contenu_id
          WHERE p.compte_id = o.compte_id AND p.date_publication_prevue = r.jour_vise AND NOT COALESCE(p.est_rappel, false)) reel ON true;
