-- 0628 : BLEO, une déclinaison par famille et par jour (décision d'Adrien, 30/10).
--
-- La boîte (A9) liste des PARENTS à décliner : une famille dont plusieurs G1
-- ont gagné y avait autant de lignes de G2, à la suite depuis D35 (G2 en tête).
-- weird_alpha : 3 G2 de « hobbies that will make you dangerously confident »
-- aux rangs 1 à 3, une famille déjà à son budget de diffusion (A8) : 3 posts
-- fabriqués le même jour, qui auraient attendu dans le stock. L'ancienne
-- routine des podz limitait ce cas ; la routine BLEO ne le faisait plus.
--
--   bleo_boite            une seule ligne par famille (sa G2 d'abord, puis le
--                         parent qui a le moins de déclinaisons) ; les
--                         familles au budget passent en fin de boîte.
--   bleo_verifier_depot   refuse une déclinaison quand la famille en a déjà
--                         une déposée aujourd'hui (jour de Paris) : code
--                         `famille_du_jour`. Le reste est inchangé (0615).
--
-- La jauge (`bleo_jauge`) compte des familles : elle ne bouge pas.
-- Retour arrière : rejouer la vue de 0606 et la fonction de 0615.

set lock_timeout = '5s';

create or replace view public.bleo_boite
  with (security_invoker = true)
as
with reg as (
  select reglages.valeur from reglages where reglages.cle = 'bleo'
), fam as (
  select f_1.id, f_1.label_id, f_1.accroche_norm, f_1.racine_contenu_id, f_1.verdict, f_1.verdict_le,
         f_1.close, f_1.close_le, f_1.created_at
    from bleo_familles f_1
    join labels l on l.id = f_1.label_id
   where f_1.verdict = 'gagnante' and not f_1.close and l.voie = 1
), enfants as (
  select z.parent, count(*) as n
    from (select c.parent_bleo_id as parent
            from contenus c
           where c.parent_bleo_id is not null and c.statut <> 'rejete'::contenu_statut
          union all
          select pl.parent_contenu_id
            from pod_livraisons pl
           where pl.parent_contenu_id is not null and pl.statut = 'a_valider') z
   group by z.parent
), sept as (
  select c.famille_id, cl.label_id
    from passages p
    join contenus c on c.id = p.contenu_id
    join contenu_labels cl on cl.contenu_id = p.contenu_id
   where p.date_publication_prevue >= ((now() at time zone 'Europe/Paris')::date - 6)
     and p.date_publication_prevue <= (now() at time zone 'Europe/Paris')::date
     and not coalesce(p.est_rappel, false)
), budget as (
  select fam.id as famille_id,
         ((select count(*) from sept s where s.famille_id = fam.id))::numeric
           >= greatest(((reg.valeur -> 'garde_fous') ->> 'budget_plancher')::numeric,
                       (((reg.valeur -> 'garde_fous') ->> 'budget_famille')::numeric)
                         * ((select count(*) from sept s where s.label_id = fam.label_id))::numeric) as au_budget
    from fam, reg
), g1 as (
  select fam.label_id, fam.id as famille_id, 'g1'::text as sorte, fam.racine_contenu_id as parent_contenu_id,
         coalesce((select e.n from enfants e where e.parent = fam.racine_contenu_id), 0::bigint) as faites,
         fam.verdict_le
    from fam
), g2 as (
  select fam.label_id, fam.id as famille_id, 'g2'::text as sorte, c.id as parent_contenu_id,
         coalesce((select e.n from enfants e where e.parent = c.id), 0::bigint) as faites,
         fam.verdict_le
    from fam
    join contenus c on c.famille_id = fam.id and c.generation = 1 and c.statut = 'valide'::contenu_statut
                   and c.verdict = 'gagnant'
), tout as (
  select * from g1
  union all
  select * from g2 where ((select ((reg.valeur -> 'boite') ->> 'generation_max')::integer from reg)) >= 2
), ouvertes as (
  -- Les lignes encore déclinables (quota par parent), avec ce qu'il faut pour les ranger.
  select t.*, b.au_budget,
         ((select count(*) from contenus c2 where c2.famille_id = t.famille_id and c2.generation > 0)) = 0 as jamais_declinee
    from tout t
    join budget b on b.famille_id = t.famille_id
   where t.faites < ((select ((reg.valeur -> 'boite') ->> 'declinaisons_par_parent')::integer from reg))
), une as (
  -- Une seule ligne par famille : sa G2 d'abord (D35), puis le parent le moins décliné.
  select o.*,
         row_number() over (partition by o.famille_id
                            order by (o.sorte = 'g2') desc, o.faites, o.parent_contenu_id) as k
    from ouvertes o
)
select u.label_id,
       u.famille_id,
       coalesce(f.accroche_norm, pc.titre) as accroche,
       u.sorte,
       u.parent_contenu_id,
       u.faites,
       u.verdict_le,
       u.au_budget,
       row_number() over (partition by u.label_id
                          order by u.au_budget, (u.sorte = 'g2') desc, u.jamais_declinee desc,
                                   u.verdict_le desc nulls last, u.parent_contenu_id) as rang,
       case u.sorte when 'g1' then 'identique' else 'reformulee' end as accroche_attendue
  from une u
  join bleo_familles f on f.id = u.famille_id
  left join contenus pc on pc.id = u.parent_contenu_id
 where u.k = 1;

comment on view public.bleo_boite is
  'BLEO, boîte des podz (A9, D35, 0628) : une ligne par famille gagnante et ouverte de la voie 1 (sa G2 d''abord, puis le parent le moins décliné), les familles au budget de diffusion en fin de boîte.';

-- ---------------------------------------------------------------------------
-- Le guichet : une déclinaison par famille et par jour
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
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'bleo : réservé aux admins' using errcode = '42501';
  end if;
  select valeur into reg from reglages where cle = 'bleo';
  v_gen_max := coalesce((reg->'boite'->>'generation_max')::int, 2);
  v_quota := coalesce((reg->'boite'->>'declinaisons_par_parent')::int, 3);

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

  return jsonb_build_object('ok', true, 'type_bleo', 'declinaison', 'famille_id', v_fam.id, 'generation', v_gen,
    'accroche_attendue', case when v_gen = 1 then 'identique' else 'reformulee' end, 'faites', v_faites);
end;
$$;
