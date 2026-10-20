-- 0319 : un parrainage accepte tous les pays du formulaire.
--
-- Ticket du 19/10 (Chau, via Aram) : impossible d'envoyer une proposition pour
-- la Finlande. La contrainte de 0194 ne liste que les 14 pays de l'époque,
-- alors que le formulaire propose `PAYS_OS` (= LANGUES_CIBLES de
-- `src/features/moteur/langues.ts`), 28 codes depuis l'ajout des nouvelles
-- langues : Finlande, Danemark, Norvège, Russie, Croatie, Slovénie, Slovaquie,
-- Serbie, arabe, hébreu, Estonie, Bulgarie, es-419 et pt-BR étaient refusés à
-- l'insertion.
--
-- Garder cette liste synchro avec `LANGUES_CIBLES` quand une langue s'ajoute.
--
-- Retour arrière : la contrainte de 0194 (14 codes) — à ne remettre qu'après
-- avoir vérifié qu'aucune ligne n'utilise un des 14 nouveaux codes.

alter table public.creator_referrals drop constraint if exists creator_referrals_pays_check;
alter table public.creator_referrals add constraint creator_referrals_pays_check check (
  pays = any (array[
    'fr', 'en', 'de', 'it', 'es', 'es-419', 'pt', 'pt-BR', 'cs', 'nl', 'el', 'hu',
    'pl', 'ro', 'sv', 'tr', 'da', 'no', 'ru', 'hr', 'sl', 'sk', 'sr', 'ar', 'he',
    'fi', 'et', 'bg'
  ]::text[])
);
