-- 0412 — Partie E, point 7 : les réglages morts supprimés.
--
-- Plus rien ne les lit (vérifié dans le code et dans les fonctions de la
-- base) : relance_texte_acces / tiktok / warmup / mercredi et
-- relances_delais (relances du prompt 17, remplacées par etapes_delais et
-- etape_texte_*, 0402), nudge_messages (« Nudge all », retiré de l'OS),
-- warmup.heures (la fin du warm-up suit la cohorte depuis 0301).
-- Chaque suppression est notée dans reglages_journal (0411) avec l'ancienne
-- valeur : c'est le retour arrière.

delete from public.reglages
 where cle in ('relance_texte_acces', 'relance_texte_tiktok', 'relance_texte_warmup', 'relance_texte_mercredi',
               'relances_delais', 'nudge_messages');
delete from public.reglages where cle = 'warmup' and (valeur - 'heures') = '{}'::jsonb;
update public.reglages set valeur = valeur - 'heures' where cle = 'warmup' and valeur ? 'heures';

notify pgrst, 'reload schema';
