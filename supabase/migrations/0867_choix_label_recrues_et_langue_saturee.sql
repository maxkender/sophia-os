-- 0867 : le choix du label d'une recrue voit les recrues en cours, et sait
-- combien de contenus un label peut servir (décision de Max du 27/11).
--
-- LE CONSTAT. Semaine du 23/11 : 84 % des recrues Sophia sur psychologiefaits
-- et History, jusqu'à 95 % dans une langue (de), 27 recrues psycho en hongrois
-- pour 244 contenus. Deux causes :
--   1. `stats_choix_label` ne compte que les comptes ACTIFS (liens, derniers
--      comptes pour l'anti-rafale). Une recrue reste inactive tant que son
--      onboarding n'est pas fini : 289 des 359 recrues psycho et History de la
--      semaine l'étaient encore. Chaque recrue voyait donc les mêmes chiffres
--      que la précédente, et le choix (sans hasard) rendait le même label à la
--      chaîne. Les règles de diversité (langue, pays, rafale) ne voyaient rien.
--   2. Aucune règle ne regardait le stock d'un label face à ses comptes d'une
--      même langue : même label + même langue = le même post traduit à
--      l'identique sur tous ces comptes.
--
-- CE QUE ÇA CHANGE.
--   1. `stats_choix_label` compte aussi les RECRUES EN COURS : un compte inactif
--      créé il y a moins de 14 jours. Partout où la fonction comptait les
--      comptes actifs (liens par langue, pays, flotte ; derniers comptes de la
--      langue et du pays). La performance ne bouge pas (posts publiés de
--      comptes actifs). Une recrue abandonnée pèse au plus 14 jours.
--      Changement ciblé dans la définition en prod (trois `where c.is_active`
--      précis) : la migration refuse de s'appliquer si un repère manque.
--   2. `contenus_valides_labels(labels, application)` : les contenus valides
--      (import terminé, hors UGC) de chaque label que l'application peut
--      servir (Sophia : pas exclu par sa pertinence ; autre application : une
--      pertinence éligible). Lu par le moteur à côté de `stats_choix_label`
--      (`statsChoixLabel`) pour la nouvelle règle « langue saturée » : avec un
--      compte de plus, le label aurait moins de `contenus_par_compte_langue`
--      (30 par défaut, réglage `choix_labels`) contenus par compte dans la
--      langue → il passe après les autres (`estSatureLangue`, 0867). Ne juge
--      pas un label 100 % podz. Sans réponse de la fonction, la règle ne joue pas.
--
-- ✅ Appliquée le 2026-11-27 (MCP).
-- Retour arrière : recréer `stats_choix_label` en remettant `c.is_active` aux
-- trois endroits (voir `recrue_ou_actif` ci-dessous) ;
-- `drop function public.contenus_valides_labels(uuid[], uuid)` ; le moteur
-- retombe alors sur la règle sans chiffre (ne joue pas).

set lock_timeout = '5s';

-- 1. Les recrues en cours comptent.
do $migr$
declare
  def text := pg_get_functiondef('public.stats_choix_label(uuid[], uuid, text, text, integer)'::regprocedure);
  recrue constant text := '(c.is_active or c.created_at >= now() - interval ''14 days'')';
  avant text;
begin
  if position('0867 recrues' in def) > 0 then
    raise notice '0867 : déjà appliquée';
    return;
  end if;

  avant := def;
  def := replace(def,
    'where c.is_active and cl.label_id = any(p_labels)',
    'where ' || recrue || ' and cl.label_id = any(p_labels) -- 0867 recrues en cours');
  if def = avant then raise exception '0867 : repère « liens » introuvable'; end if;

  avant := def;
  def := replace(def,
    E'where c.is_active\n      and cible.langue is not null',
    E'where ' || recrue || E' -- 0867 recrues en cours\n      and cible.langue is not null');
  if def = avant then raise exception '0867 : repère « recents_langue » introuvable'; end if;

  avant := def;
  def := replace(def,
    E'where c.is_active\n      and cible.pays is not null',
    E'where ' || recrue || E' -- 0867 recrues en cours\n      and cible.pays is not null');
  if def = avant then raise exception '0867 : repère « recents_pays » introuvable'; end if;

  execute def;
end
$migr$;

-- 2. Les contenus valides qu'une application peut servir, par label.
create or replace function public.contenus_valides_labels(p_labels uuid[], p_application uuid)
returns table (label_id uuid, contenus_valides integer)
language sql
stable
set search_path to 'public'
as $function$
  with app as (
    select coalesce(p_application, '00000000-0000-4000-8000-000000000001'::uuid) as id
  )
  select x.label_id, count(distinct c.id)::integer
    from contenu_labels x
    join contenus c on c.id = x.contenu_id
    cross join app
   where x.label_id = any(p_labels)
     and c.statut = 'valide'
     and c.import_statut = 'done'
     and not coalesce(c.ugc_compatible, false)
     and (
       (app.id = '00000000-0000-4000-8000-000000000001'::uuid
        and not exists (select 1 from contenu_pertinences cp
                         where cp.contenu_id = c.id and cp.application_id = app.id and cp.eligible = false))
       or
       (app.id <> '00000000-0000-4000-8000-000000000001'::uuid
        and exists (select 1 from contenu_pertinences cp
                     where cp.contenu_id = c.id and cp.application_id = app.id and cp.eligible))
     )
   group by x.label_id;
$function$;

comment on function public.contenus_valides_labels(uuid[], uuid) is
  'Contenus valides (import terminé, hors UGC) de chaque label que l''application peut servir (0867). Lu par le choix du label d''une recrue : règle « langue saturée ».';

revoke all on function public.contenus_valides_labels(uuid[], uuid) from public, anon;
grant execute on function public.contenus_valides_labels(uuid[], uuid) to authenticated, service_role;
