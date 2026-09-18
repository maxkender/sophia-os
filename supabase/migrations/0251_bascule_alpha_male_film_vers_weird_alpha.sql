-- 0251: bascule les comptes de `alpha_male_film` vers `weird_alpha`.
--
-- POURQUOI. Sur 533 posts publiés / 10 marchés, `alpha_male_film` est le label
-- le moins performant du catalogue : aucune langue au-dessus de sa médiane
-- locale, 9 en dessous, −47 % de vues médianes. `weird_alpha` est le meilleur :
-- 5 langues sur 7 au-dessus, aucune en dessous, +171 %.
--
-- ET SURTOUT, son pool est à sec : 65 slideshows, TOUS exclusifs à ce label,
-- 12 passages restants en tout. Les 8 comptes qui n'ont que lui recyclent déjà
-- le même stock (giorgia.mentalita556 : 62 passages sur 40 slideshows distincts
-- en 30 jours). La bascule les réalimente — `weird_alpha` offre 465 slideshows
-- piochables / 664 passages.
--
-- ORDRE DES OPÉRATIONS : on AJOUTE avant de RETIRER. 8 des 26 comptes n'ont pas
-- d'autre label ; les laisser ne serait-ce qu'un instant sans label ferait
-- échouer `assignerCompteJour` (« Aucun label sur ce compte » → quota baissé).
-- Le garde-fou final vérifie qu'aucun compte touché ne sort d'ici sans label.
--
-- LANGUES. Le pool d'assignation est aveugle à la langue : `choisirContenu` ne
-- filtre pas sur `contenu_langues`, le deck est traduit à la demande par
-- `assurerDeckPourLangue`. cs, hr et sl n'ont aujourd'hui aucun deck
-- `weird_alpha` traduit, mais la première pioche les fabrique. Rien à
-- pré-remplir, et un échec de traduction est déjà amorti (le moteur passe au
-- slideshow suivant).
--
-- CE QU'ON NE TOUCHE PAS :
--   * les 81 passages déjà planifiés sur du contenu `alpha_male_film` — ils
--     partent normalement sur TikTok, la bascule prend effet à l'assignation
--     suivante. Aucun poster ne voit son planning changer sous ses pieds ;
--   * les personas (pseudo, prénom, avatar) — `appliquerIdentiteInstantanee`
--     ne tourne qu'à la création ou la régénération d'une identité, jamais sur
--     un simple changement de `compte_labels`. À noter tout de même :
--     `labels.genre` vaut `homme` pour film et `femme` pour weird_alpha, donc
--     une RÉGÉNÉRATION future d'identité sur ces comptes basculerait en
--     prénoms/avatars féminins. 11 des 26 portent déjà un persona féminin sous
--     un label « homme » : la colonne n'est de toute façon pas respectée
--     aujourd'hui ;
--   * le label `alpha_male_film` lui-même et ses 65 `contenu_labels` : on le
--     laisse orphelin plutôt que de le supprimer, pour garder la trace de ce
--     qui a été tagué film et pouvoir revenir en arrière.
--
-- CE QU'IL FAUDRA SURVEILLER. `weird_alpha` passe de 16 à 37 comptes actifs,
-- soit 74 passages/jour de demande contre 664 passages disponibles sur 465
-- slideshows : environ 9 jours de réserve au rythme actuel, contre ~20 avant.
-- Les `restants` se rechargent à chaque cycle de tierlist, donc ce n'est pas une
-- falaise, mais le label a besoin d'être réalimenté plus vite qu'avant.
--
-- IDEMPOTENTE : rejouée, elle ne trouve plus aucun compte sur film et ne fait
-- rien.

do $$
declare
  id_film   uuid;
  id_weird  uuid;
  cibles    uuid[];
  n_ajouts  int;
  n_retraits int;
  n_orphelins int;
begin
  select id into id_film  from public.labels where nom = 'alpha_male_film';
  select id into id_weird from public.labels where nom = 'weird_alpha';

  if id_film is null then
    raise notice '0251 : label alpha_male_film absent — rien à faire.';
    return;
  end if;
  if id_weird is null then
    raise exception '0251 : label weird_alpha introuvable — bascule annulée.';
  end if;

  -- Les comptes concernés, figés avant toute écriture.
  select coalesce(array_agg(compte_id), '{}') into cibles
  from public.compte_labels
  where label_id = id_film;

  if cardinality(cibles) = 0 then
    raise notice '0251 : aucun compte sur alpha_male_film — rien à faire.';
    return;
  end if;

  -- 1) AJOUTER weird_alpha. Le trigger `compte_labels_meme_application` exige
  --    que compte et label pointent la même application : les 26 comptes et le
  --    label weird_alpha sont tous sur `sophia`, vérifié avant écriture.
  insert into public.compte_labels (compte_id, label_id)
  select unnest(cibles), id_weird
  on conflict (compte_id, label_id) do nothing;
  get diagnostics n_ajouts = row_count;

  -- 2) RETIRER alpha_male_film, maintenant que le filet est en place.
  delete from public.compte_labels where label_id = id_film;
  get diagnostics n_retraits = row_count;

  -- 3) GARDE-FOU, restreint aux comptes touchés : 2 comptes actifs étaient
  --    DÉJÀ sans label avant cette migration, on ne veut pas échouer sur eux.
  select count(*) into n_orphelins
  from public.comptes c
  where c.id = any(cibles)
    and not exists (select 1 from public.compte_labels x where x.compte_id = c.id);
  if n_orphelins > 0 then
    raise exception '0251 : % compte(s) touché(s) sans label après bascule — annulé.', n_orphelins;
  end if;

  raise notice '0251 : % compte(s) basculé(s) — % lien(s) weird_alpha ajouté(s), % lien(s) alpha_male_film retiré(s).',
    cardinality(cibles), n_ajouts, n_retraits;
end $$;
