-- 0659 : une seule recharge à la fois par post (6/11).
--
-- Le 6/11 à 10 h 06, deux recharges du même post (tamas.ambicio760) ont été lancées
-- à 33 s d'écart : la 2e est partie pendant que la 1re fabriquait encore le
-- remplaçant. Chacune a créé un remplaçant avec le même contenu du plan, et le compte
-- s'est retrouvé avec 3 posts dont 2 identiques (déjà arrivé le 4/11 à 16 h 40).
-- `revoquer-post` prend maintenant un verrou sur le post par un UPDATE conditionnel
-- (atomique) et refuse une 2e recharge tant que la 1re tourne (`RECHARGE_EN_COURS`,
-- 409). Le verrou tombe de lui-même au bout de 3 minutes si l'appel meurt.
--
-- Retour arrière : alter table public.posts drop column recharge_en_cours_at;
-- (la fonction continue alors sans verrou).

alter table public.posts add column if not exists recharge_en_cours_at timestamptz;

comment on column public.posts.recharge_en_cours_at is
  'Verrou de recharge (0659) : posé par revoquer-post au début d''une recharge, libéré à la fin ; une 2e recharge du même post est refusée tant qu''il a moins de 3 minutes.';
