-- 0631 : BLEO, le guichet refuse une déclinaison dont le hook est voisin d'une
-- livraison déjà déposée le même jour dans le label (décision d'Adrien, 31/10).
--
-- Une famille, c'est un hook exact. smart_girl a 86 familles dont le hook parle
-- de « hobbies » (116 contenus) : « 6 hobbies that make you unexpectedly
-- smarter » et « 6 hobbies that make you smarter without actually studying »
-- sont deux familles, et le 31/10 au matin le pod 8 a décliné les deux. Le thème
-- s'use : 28 passages par semaine à la mi-septembre, 173 la semaine du 19/10, et
-- la médiane des vues de 4 091 à 1 572 (le reste du label stable vers 1 400).
--
-- Voisins : au moins `boite.voisine_mots_min` (2) mots en commun, et une part de
-- mots en commun d'au moins `boite.voisine_seuil` (0,6) rapportée au hook le plus
-- court (en gros 2 mots sur 3). Les mots : sans accents ni casse, de 3 lettres
-- au moins, sans les mots outils anglais et français ni les signatures de format
-- (« backed by science », « sources »), le pluriel ramené au singulier. Calibré
-- sur les boîtes du 31/10 : à 0,5, des hooks sans rapport se touchent (« 3
-- lessons every young man needs to know » / « unspoken rules every man should
-- know ») ; à 0,6, ce sont des reprises d'une même idée (« habits that will make
-- you disgustingly confident » / « … disgustingly magnetic »). Sur les 7
-- déclinaisons du pod 8 le 31/10, seule la seconde « hobbies … smarter » aurait
-- été refusée.
--
-- La règle ne touche que les déclinaisons ; le regroupement des familles quasi
-- identiques (fatigue et boîte par thème) vient après la bascule, avec D30.
--
-- Retour arrière : rejouer bleo_verifier_depot de 0628 ; les deux fonctions de
-- mots peuvent rester.

set lock_timeout = '5s';

create or replace function public.bleo_mots_accroche(p_accroche text)
returns text[]
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(array_agg(distinct m order by m), '{}')
    from (
      select case when w ~ 'ies$' and length(w) > 4 then regexp_replace(w, 'ies$', 'y')
                  when w ~ '[^s]s$' and length(w) > 3 then regexp_replace(w, 's$', '')
                  else w end as m
        from regexp_split_to_table(lower(extensions.unaccent(coalesce(p_accroche, ''))), '[^a-z]+') w
       where length(w) >= 3
         and w not in (
           -- anglais
           'the','and','but','for','with','without','from','about','into','than','then','that','this','these','those',
           'its','are','been','was','were','will','would','can','could','should','must','does','did','have','has','had',
           'you','your','yours','yourself','our','him','his','her','hers','they','them','their','who','what','which','when',
           'where','why','how','all','any','some','most','more','every','each','not','never','only','just','very','really',
           'actually','literally','even','also','make','makes','made','making','thing','things','way','ways','part','one',
           'don','doesn','didn','isn','aren','won','people','everyone','nobody','someone','get','gets',
           -- français
           'les','une','des','aux','pour','par','avec','sans','sur','sous','dans','chez','que','qui','quoi','dont','cet',
           'cette','ces','son','ses','ton','tes','mon','mes','votre','vos','notre','nos','leur','leurs','toi','vous','moi',
           'elle','ils','elles','nous','est','sont','etre','sera','fait','faire','font','rend','rendent','plus','moins',
           'tres','tout','tous','toute','toutes','chose','choses','pas','jamais','rien','partie','comme',
           -- signatures de format
           'backed','science','scientifically','source','sources')
    ) x
$function$;

comment on function public.bleo_mots_accroche(text) is
  'BLEO (0631) : les mots qui portent l''idée d''un hook (sans accents ni casse, 3 lettres et plus, sans mots outils ni signatures de format, pluriel ramené au singulier), pour repérer deux hooks voisins.';

create or replace function public.bleo_communs_accroches(a text[], b text[])
returns integer
language sql
immutable
as $function$
  select count(*)::int from unnest(coalesce(a, '{}')) x where x = any(coalesce(b, '{}'))
$function$;

create or replace function public.bleo_proximite_accroches(a text[], b text[])
returns numeric
language sql
immutable
as $function$
  select case when least(cardinality(coalesce(a, '{}')), cardinality(coalesce(b, '{}'))) = 0 then 0
              else public.bleo_communs_accroches(a, b)::numeric
                   / least(cardinality(coalesce(a, '{}')), cardinality(coalesce(b, '{}'))) end
$function$;

comment on function public.bleo_proximite_accroches(text[], text[]) is
  'BLEO (0631) : part des mots en commun de deux hooks, rapportée au plus court (0 à 1).';

update reglages
   set valeur = jsonb_set(jsonb_set(valeur, '{boite,voisine_seuil}', '0.6'::jsonb), '{boite,voisine_mots_min}', '2'::jsonb)
 where cle = 'bleo' and not (valeur->'boite' ? 'voisine_seuil');

-- ---------------------------------------------------------------------------
-- Le guichet : 0628 + le refus `accroche_voisine`
-- ---------------------------------------------------------------------------
create or replace function public.bleo_verifier_depot(
  p_label_id uuid,
  p_type_bleo text,
  p_parent_contenu_id uuid default null,
  p_accroche_norm text default null,
  p_livraison uuid default null
)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $$
declare
  reg jsonb;
  v_gen_max integer;
  v_quota integer;
  v_existante record;
  v_parent record;
  v_fam record;
  v_gen integer;
  v_faites integer;
  v_mots text[];
  v_voisine record;
  v_voisine_seuil numeric;
  v_voisine_mots integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'bleo : réservé aux admins' using errcode = '42501';
  end if;
  select valeur into reg from reglages where cle = 'bleo';
  v_gen_max := coalesce((reg->'boite'->>'generation_max')::int, 2);
  v_quota := coalesce((reg->'boite'->>'declinaisons_par_parent')::int, 3);
  v_voisine_seuil := coalesce((reg->'boite'->>'voisine_seuil')::numeric, 0.6);
  v_voisine_mots := coalesce((reg->'boite'->>'voisine_mots_min')::int, 2);

  if p_type_bleo is null or p_type_bleo not in ('full_test', 'declinaison') then
    return jsonb_build_object('ok', false, 'code', 'type_bleo_invalide',
      'message', format('type_bleo : « full_test » ou « declinaison » (reçu : %s)', coalesce(p_type_bleo, 'rien')));
  end if;

  if p_type_bleo = 'full_test' then
    if p_parent_contenu_id is not null then
      return jsonb_build_object('ok', false, 'code', 'parent_interdit',
        'message', 'un full test n''a pas de parent : pour décliner une famille, type_bleo « declinaison »');
    end if;
    if p_accroche_norm is not null then
      select c.id, c.famille_id, f.verdict, f.close
        into v_existante
        from contenus c
        join contenu_labels cl on cl.contenu_id = c.id and cl.label_id = p_label_id
        left join bleo_familles f on f.id = c.famille_id
       where c.accroche_norm = p_accroche_norm and c.statut <> 'rejete'
       order by c.created_at
       limit 1;
      if found then
        return jsonb_build_object('ok', false, 'code', 'accroche_existante',
          'message', format('cette accroche existe déjà dans le label (contenu %s, famille %s) : pas de second full test ; si la famille est gagnante, la décliner depuis la boîte',
                            left(v_existante.id::text, 8), coalesce(v_existante.verdict, 'pas encore rattachée')),
          'contenu_id', v_existante.id, 'famille_id', v_existante.famille_id);
      end if;
    end if;
    return jsonb_build_object('ok', true, 'type_bleo', 'full_test', 'generation', 0);
  end if;

  -- Déclinaison.
  if p_parent_contenu_id is null then
    return jsonb_build_object('ok', false, 'code', 'parent_requis',
      'message', 'une déclinaison déclare son parent : parent_contenu_id (colonne « parent » de la boîte)');
  end if;
  select c.id, c.famille_id, coalesce(c.generation, 0) as generation, c.verdict, c.accroche_norm
    into v_parent
    from contenus c
    join contenu_labels cl on cl.contenu_id = c.id and cl.label_id = p_label_id
   where c.id = p_parent_contenu_id and c.statut = 'valide';
  if not found then
    return jsonb_build_object('ok', false, 'code', 'parent_introuvable',
      'message', format('parent %s introuvable dans le label (ou pas valide)', left(p_parent_contenu_id::text, 8)));
  end if;
  if v_parent.famille_id is null then
    return jsonb_build_object('ok', false, 'code', 'famille_inconnue',
      'message', 'le parent n''est pas encore rattaché à une famille (rattachement à 5 h 15) : le décliner demain');
  end if;
  select f.id, f.verdict, f.close, f.accroche_norm into v_fam from bleo_familles f where f.id = v_parent.famille_id;
  if v_fam.verdict is distinct from 'gagnante' then
    return jsonb_build_object('ok', false, 'code', 'famille_non_gagnante',
      'message', format('la famille du parent n''est pas gagnante (%s) : on ne décline que les familles gagnantes de la boîte', coalesce(v_fam.verdict, '—')),
      'famille_id', v_fam.id);
  end if;
  if v_fam.close then
    return jsonb_build_object('ok', false, 'code', 'famille_close',
      'message', 'la famille est close (ses déclinaisons ne rapportent plus) : elle n''est plus dans la boîte',
      'famille_id', v_fam.id);
  end if;
  v_gen := v_parent.generation + 1;
  if v_gen > v_gen_max then
    return jsonb_build_object('ok', false, 'code', 'generation_max',
      'message', format('le parent est déjà une génération %s : pas de génération %s (maximum %s)', v_parent.generation, v_gen, v_gen_max),
      'famille_id', v_fam.id);
  end if;
  if v_gen >= 2 and v_parent.verdict is distinct from 'gagnant' then
    return jsonb_build_object('ok', false, 'code', 'parent_non_gagnant',
      'message', format('une génération 2 se fait sur une génération 1 gagnante ; ce parent est « %s »', coalesce(v_parent.verdict, 'en_attente')),
      'famille_id', v_fam.id);
  end if;

  select (select count(*) from contenus c where c.parent_bleo_id = v_parent.id and c.statut <> 'rejete')
       + (select count(*)
            from pod_livraisons pl
           where pl.parent_contenu_id = v_parent.id
             and pl.id is distinct from p_livraison
             and (pl.statut = 'a_valider'
                  or (pl.statut = 'validee'
                      and not exists (select 1 from contenus c where c.id = pl.contenu_id and c.parent_bleo_id is not null))))
    into v_faites;
  if v_faites >= v_quota then
    return jsonb_build_object('ok', false, 'code', 'quota_atteint',
      'message', format('ce parent a déjà %s déclinaison(s) sur %s : prendre la ligne suivante de la boîte', v_faites, v_quota),
      'famille_id', v_fam.id);
  end if;

  -- 0628 : une déclinaison par famille et par jour (jour de Paris), tous parents confondus.
  if exists (
    select 1
      from pod_livraisons pl
      join contenus pc on pc.id = pl.parent_contenu_id
     where pc.famille_id = v_fam.id
       and pl.id is distinct from p_livraison
       and pl.statut in ('a_valider', 'validee')
       and pl.depose_le >= ((now() at time zone 'Europe/Paris')::date)::timestamp at time zone 'Europe/Paris'
  ) then
    return jsonb_build_object('ok', false, 'code', 'famille_du_jour',
      'message', 'cette famille a déjà une déclinaison aujourd''hui : une par famille et par jour, prendre la ligne suivante de la boîte',
      'famille_id', v_fam.id);
  end if;

  if p_accroche_norm is not null and coalesce(v_fam.accroche_norm, v_parent.accroche_norm) is not null then
    if v_gen = 1 and p_accroche_norm <> coalesce(v_fam.accroche_norm, v_parent.accroche_norm) then
      return jsonb_build_object('ok', false, 'code', 'accroche_differente',
        'message', format('génération 1 : l''accroche reste celle de la famille, mot pour mot (« %s »)', coalesce(v_fam.accroche_norm, v_parent.accroche_norm)),
        'famille_id', v_fam.id);
    end if;
    if v_gen >= 2 and p_accroche_norm = coalesce(v_fam.accroche_norm, v_parent.accroche_norm) then
      return jsonb_build_object('ok', false, 'code', 'accroche_identique',
        'message', 'génération 2 : l''accroche est reformulée (même promesse, autres mots)',
        'famille_id', v_fam.id);
    end if;
  end if;

  -- 0631 : pas deux déclinaisons au hook voisin le même jour dans le label (mots en
  -- commun, voir bleo_mots_accroche), comparées à tout ce que ses podz ont déposé
  -- aujourd'hui. Deux familles quasi identiques comptent pour deux familles : sans
  -- cette règle, « 6 hobbies that make you unexpectedly smarter » et « 6 hobbies
  -- that make you smarter without actually studying » partaient le même jour.
  if p_accroche_norm is not null then
    v_mots := public.bleo_mots_accroche(p_accroche_norm);
    select pl.id, x.accroche,
           public.bleo_proximite_accroches(v_mots, public.bleo_mots_accroche(x.accroche)) as prox
      into v_voisine
      from pod_livraisons pl
      join pods po on po.slug = pl.pod and po.label_id = p_label_id
      cross join lateral (
        select s->>'texte_overlay' as accroche
          from jsonb_array_elements(
                 case when jsonb_typeof(pl.decks -> pl.langue_source -> 'slides') = 'array'
                      then pl.decks -> pl.langue_source -> 'slides'
                      else coalesce((select d.value -> 'slides' from jsonb_each(case when jsonb_typeof(pl.decks) = 'object' then pl.decks else '{}'::jsonb end) d
                                      where jsonb_typeof(d.value -> 'slides') = 'array' limit 1), '[]'::jsonb) end) s
         order by (s->>'position')::int
         limit 1) x
     where pl.id is distinct from p_livraison
       and pl.statut in ('a_valider', 'validee')
       and pl.depose_le >= ((now() at time zone 'Europe/Paris')::date)::timestamp at time zone 'Europe/Paris'
       and public.bleo_communs_accroches(v_mots, public.bleo_mots_accroche(x.accroche)) >= v_voisine_mots
       and public.bleo_proximite_accroches(v_mots, public.bleo_mots_accroche(x.accroche)) >= v_voisine_seuil
     order by 3 desc
     limit 1;
    if found then
      return jsonb_build_object('ok', false, 'code', 'accroche_voisine',
        'message', format('une livraison du jour du label a déjà une accroche voisine (« %s », livraison %s) : prendre la ligne suivante de la boîte',
                          left(regexp_replace(coalesce(v_voisine.accroche, ''), '\s+', ' ', 'g'), 80), left(v_voisine.id::text, 8)),
        'famille_id', v_fam.id, 'livraison_voisine', v_voisine.id);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'type_bleo', 'declinaison', 'famille_id', v_fam.id, 'generation', v_gen,
    'accroche_attendue', case when v_gen = 1 then 'identique' else 'reformulee' end, 'faites', v_faites);
end;
$$;
