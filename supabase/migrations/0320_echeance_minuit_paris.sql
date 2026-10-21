-- 0320 : l'échéance de publication n'est jamais avant minuit à Paris.
--
-- Ticket du 19/10 (Rida, Nouvelle-Zélande) : les posts d'un jour arrivent à
-- minuit heure de Paris, soit 11 h du matin à Auckland ; l'échéance de 0304
-- (fin du jour dans le fuseau du pays) ne lui laissait que 13 h. Elle a publié
-- les posts du dimanche le lundi matin, et ceux du lundi sont tombés « manqués »
-- le mardi matin.
--
-- L'échéance devient la plus tardive des deux : fin du jour dans le fuseau du
-- pays, ou fin du jour à Paris. Tout poster a au moins 24 h après l'arrivée de
-- ses posts. Gagnent du temps : NZ (+11 h), AU (+6 h), AE / KZ / AF (+2 à 3 h),
-- et +1 h pour TR, GR, RO, BG, EE, FI, IL. Rien ne change à l'ouest de Paris.
--
-- Jumeau front : `src/features/moteur/echeancePublication.ts`.
--
-- Retour arrière : la définition de 0304 (sans `greatest`).

create or replace function public.echeance_publication(p_date date, p_pays text)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select greatest(
    (p_date + 1)::timestamp at time zone public.fuseau_pays(p_pays),
    (p_date + 1)::timestamp at time zone 'Europe/Paris'
  );
$$;
