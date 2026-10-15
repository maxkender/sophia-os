-- 0286 : les comptes alpha_male_film passent en alpha_male_yellow.
--
-- CONTEXTE. Analyse des posts du 15/10 (15/09 → 12/10) : alpha_male_film est le
-- label le plus faible du catalogue (indice langue 0,58, 28 % de posts sous
-- 500 vues). Ce n'est pas un problème de comptes : les mêmes contenus postés
-- sur des comptes alpha_male_yellow ou weird_alpha y font 0,39 fois la normale
-- du compte. Sa réserve était en outre à 0 jour (50 contenus prêts, 0 passage
-- restant pour 9 comptes). Décision : passer ses 10 comptes en
-- alpha_male_yellow (même application, même genre).
--
-- CE QUE FAIT LA MIGRATION. Même effet que l'écran Posters (`setLabelsCompte`) :
-- elle ajoute alpha_male_yellow à chaque compte qui porte alpha_male_film, puis
-- retire alpha_male_film. Les passages déjà planifiés restent tels quels ; les
-- prochaines assignations piochent dans le stock alpha_male_yellow. Le label
-- alpha_male_film et ses contenus ne sont pas touchés.
--
-- À SURVEILLER. alpha_male_yellow passe de 31 à 41 comptes, soit environ
-- 69 passages par jour pour 321 restants au 15/10 : moins de 5 jours de réserve.
--
-- IDEMPOTENTE : rejouée, elle ne trouve plus de compte alpha_male_film.
--
-- ÉTAT AU 15/10 : l'ajout d'alpha_male_yellow est passé en prod (connecteur
-- MCP) ; le DELETE attend la confirmation du connecteur et n'est pas encore
-- passé. Rejouer le fichier en entier termine le travail.

do $$
declare
  v_film   uuid := (select id from public.labels where nom = 'alpha_male_film');
  v_yellow uuid := (select id from public.labels where nom = 'alpha_male_yellow');
  n_ajout  int;
  n_retrait int;
begin
  if v_film is null or v_yellow is null then
    raise exception '0286 : label alpha_male_film ou alpha_male_yellow introuvable';
  end if;

  insert into public.compte_labels (compte_id, label_id)
  select compte_id, v_yellow
  from public.compte_labels
  where label_id = v_film
  on conflict (compte_id, label_id) do nothing;
  get diagnostics n_ajout = row_count;

  delete from public.compte_labels where label_id = v_film;
  get diagnostics n_retrait = row_count;

  raise notice '0286 : % compte(s) passé(s) en alpha_male_yellow, % retiré(s) de alpha_male_film.',
    n_ajout, n_retrait;
end $$;
