-- 0781 : les langues d'un podz, une seule liste et un seul geste (étape 3 du
-- chantier « clarifier les podz », décision d'Adrien du 20/11).
--
-- LE BUG. `pods.langues` avait deux maîtres :
--   * la soupape de nuit (0722) y AJOUTE une langue à 4 h 40 ;
--   * l'atelier du podz y RÉÉCRIT sa liste `LANGUES` à chaque `npm run boite` ou
--     `npm run livrer` (action `langues`, `declarerLangues` de la fonction `pods`).
-- La langue ouverte la nuit disparaissait donc le matin, et la soupape la
-- rouvrait la nuit suivante : le hongrois ouvert à Dorian les 16, 17, 19 et
-- 20/11, à Sagace les 17, 19 et 20/11, sans jamais rester. Entre-temps, le
-- choix de label y envoyait un compte (Dorian a un compte hongrois), qui ne
-- recevait rien.
--
-- DÉSORMAIS, deux listes qui disent deux choses :
--   * `pods.langues` : les langues OUVERTES. C'est la décision (Adrien, Max, la
--     soupape). L'attribution des comptes, les langues à livrer et le rattrapage
--     continuent de la lire, sans changement.
--   * `pods.langues_pretes` : les langues que l'atelier SAIT produire (sa liste
--     `LANGUES`). L'atelier ne réécrit plus que celle-ci.
-- Une langue ouverte et pas prête est « à préparer » : le podz doit l'ajouter à
-- son atelier (textes, écrans traduits). Une langue que l'atelier ajoute à
-- `LANGUES` s'ouvre toujours toute seule, comme avant (c'est la fonction `pods`
-- qui appelle `podz_langue`) ; une langue qu'il retire reste ouverte.
--
-- UN SEUL GESTE : `podz_langue(podz, langue, 'ouvrir' | 'fermer', par, raison)`.
-- La page Podz, Claude (SQL), la soupape et la fonction `pods` passent tous par
-- elle, et chaque geste est noté dans `bleo_langues_ouvertes` (qui devient le
-- journal : `action`, `par`, `auteur`).
--   * Un podz en texte + banque n'a pas de liste (l'OS traduit) : refusé.
--   * Une langue d'un label n'appartient qu'à UN de ses podz (un label peut
--     avoir plusieurs podz, ils se partagent les langues) : ouvrir une langue
--     déjà ouverte chez un autre podz actif du label est refusé.
--   * La dernière langue ne se ferme pas (la liste vide ferait du podz un podz
--     en texte + banque) : on met le podz en pause à la place.
--
-- `pod_langues` rend en plus `pretes` et `a_preparer`. `declarees`, `comptes` et
-- `a_livrer` ne changent pas : les ateliers déjà en place continuent de marcher.
--
-- Additive : une colonne, trois colonnes de journal, une fonction, deux
-- fonctions mises à jour. Aucune langue n'est ouverte ni fermée par cette
-- migration : `langues_pretes` part de `langues` (la liste de l'atelier, telle
-- qu'il l'a réécrite ce matin).
--
-- ✅ Appliquée le 2026-11-20 (MCP), après un essai complet dans une transaction
-- annulée (ouvrir, fermer, refus, deux podz sur un label, soupape à blanc).
--
-- Retour arrière : réappliquer `bleo_ouvrir_langues_podz` de 0722 et
-- `pod_langues` de 0654 ; `drop function public.podz_langue(text, text, text,
-- text, jsonb)` ; les colonnes peuvent rester. Et redéployer la fonction `pods`
-- d'avant (sinon elle n'écrit plus `pods.langues`).

set lock_timeout = '5s';

-- 1. Ce que l'atelier sait produire.
alter table public.pods add column if not exists langues_pretes text[];

comment on column public.pods.langues is
  'Les langues OUVERTES d''un podz en images finies (0654, 0781) : la décision. Nul : podz en texte + banque, l''OS traduit. Ne se modifie que par podz_langue().';
comment on column public.pods.langues_pretes is
  'Les langues que l''atelier du podz sait produire (0781) : sa liste LANGUES, envoyée à chaque `npm run boite`. Une langue ouverte et pas prête est « à préparer ».';

update public.pods set langues_pretes = langues where langues is not null and langues_pretes is null;

-- 2. Le journal : qui a ouvert ou fermé quoi.
alter table public.bleo_langues_ouvertes add column if not exists action text not null default 'ouverte';
alter table public.bleo_langues_ouvertes add column if not exists par text not null default 'soupape';
alter table public.bleo_langues_ouvertes add column if not exists auteur uuid;
do $p$
begin
  if not exists (select 1 from pg_constraint where conname = 'bleo_langues_ouvertes_action_check') then
    alter table public.bleo_langues_ouvertes add constraint bleo_langues_ouvertes_action_check
      check (action in ('ouverte', 'fermee'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bleo_langues_ouvertes_par_check') then
    alter table public.bleo_langues_ouvertes add constraint bleo_langues_ouvertes_par_check
      check (par in ('soupape', 'admin', 'podz', 'claude'));
  end if;
end
$p$;

-- Les ouvertures faites à la main le 15/11 (raison {"manuel": …}).
update public.bleo_langues_ouvertes set par = 'admin' where raison ? 'manuel' and par = 'soupape';

comment on table public.bleo_langues_ouvertes is
  'Le journal des langues des podz (0722, 0781) : chaque ouverture ou fermeture, par qui (soupape, admin, podz, claude). Écrit par podz_langue().';

-- 3. Le seul geste.
create or replace function public.podz_langue(
  p_pod text, p_langue text, p_action text default 'ouvrir', p_par text default null, p_raison jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pod public.pods;
  v_demandee text := nullif(trim(p_langue), '');
  v_langue text;
  v_par text := coalesce(p_par, case when auth.uid() is null then 'claude' else 'admin' end);
  v_autre text;
  v_comptes integer;
  v_langues text[];
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'podz : réservé aux admins' using errcode = '42501';
  end if;
  if p_action not in ('ouvrir', 'fermer') then
    raise exception 'podz : action inconnue (%) : ouvrir ou fermer', p_action;
  end if;
  if v_par not in ('soupape', 'admin', 'podz', 'claude') then
    raise exception 'podz : auteur inconnu (%)', v_par;
  end if;
  if v_demandee is null or v_demandee !~* '^[a-z]{2,3}(-[a-z0-9]{2,4})?$' then
    raise exception 'podz : langue invalide (%)', coalesce(p_langue, 'vide');
  end if;

  select * into v_pod from pods where slug = p_pod for update;
  if not found then
    raise exception 'podz : % inconnu', p_pod;
  end if;
  if v_pod.langues is null or cardinality(v_pod.langues) = 0 then
    raise exception 'podz : % est en texte + banque, l''OS traduit dans toutes les langues : il n''a pas de liste', p_pod;
  end if;

  -- L'écriture de la langue : celle de la liste, sinon celle des comptes (« pt-BR »), sinon telle que demandée.
  v_langue := coalesce(
    (select x from unnest(v_pod.langues) x where lower(x) = lower(v_demandee) limit 1),
    (select max(c.langue) from comptes c where lower(c.langue) = lower(v_demandee) and c.is_active),
    lower(v_demandee));

  select count(*)::integer into v_comptes
    from compte_labels cl join comptes c on c.id = cl.compte_id and c.is_active
   where cl.label_id = v_pod.label_id and lower(c.langue) = lower(v_langue);

  if p_action = 'ouvrir' then
    if exists (select 1 from unnest(v_pod.langues) x where lower(x) = lower(v_langue)) then
      return jsonb_build_object('ok', true, 'change', false, 'pod', p_pod, 'langue', v_langue,
                                'langues', to_jsonb(v_pod.langues), 'comptes', v_comptes);
    end if;
    -- Une langue d'un label n'appartient qu'à un de ses podz.
    select p2.slug into v_autre
      from pods p2
     where p2.label_id = v_pod.label_id and p2.slug <> v_pod.slug and p2.actif
       and exists (select 1 from unnest(p2.langues) x where lower(x) = lower(v_langue))
     limit 1;
    if v_autre is not null then
      raise exception 'podz : % est déjà ouverte chez % (même label) : une langue d''un label n''appartient qu''à un podz', v_langue, v_autre;
    end if;
    v_langues := v_pod.langues || v_langue;
  else
    if not exists (select 1 from unnest(v_pod.langues) x where lower(x) = lower(v_langue)) then
      return jsonb_build_object('ok', true, 'change', false, 'pod', p_pod, 'langue', v_langue,
                                'langues', to_jsonb(v_pod.langues), 'comptes', v_comptes);
    end if;
    v_langues := array(select x from unnest(v_pod.langues) with ordinality as t(x, n)
                        where lower(x) <> lower(v_langue) order by n);
    if cardinality(v_langues) = 0 then
      raise exception 'podz : % est la dernière langue de % : mets le podz en pause plutôt que de la fermer', v_langue, p_pod;
    end if;
  end if;

  update pods set langues = v_langues where slug = p_pod;
  insert into bleo_langues_ouvertes (pod, langue, raison, action, par, auteur)
  values (p_pod, v_langue, p_raison, case when p_action = 'ouvrir' then 'ouverte' else 'fermee' end, v_par, auth.uid());

  return jsonb_build_object('ok', true, 'change', true, 'pod', p_pod, 'langue', v_langue,
                            'langues', to_jsonb(v_langues), 'comptes', v_comptes);
end;
$function$;

comment on function public.podz_langue(text, text, text, text, jsonb) is
  'Le seul geste sur les langues d''un podz (0781) : ouvrir ou fermer une langue de sa liste (pods.langues), noté dans bleo_langues_ouvertes. Appelée par la page Podz, par Claude (SQL), par la soupape et par la fonction `pods`. Rend {ok, change, langue, langues, comptes} ; comptes = comptes actifs du label dans cette langue.';

revoke all on function public.podz_langue(text, text, text, text, jsonb) from public, anon;
grant execute on function public.podz_langue(text, text, text, text, jsonb) to authenticated, service_role;

-- 4. La soupape passe par le même geste.
create or replace function pg_temp.fonction_patcher(p_fn regprocedure, p_paires text[])
returns void
language plpgsql
as $function$
declare
  d text;
  i integer;
  n integer;
begin
  d := pg_get_functiondef(p_fn);
  for i in 1 .. array_length(p_paires, 1) / 2 loop
    n := (length(d) - length(replace(d, p_paires[2 * i - 1], ''))) / length(p_paires[2 * i - 1]);
    if n <> 1 then
      raise exception '0781 : % : bloc % trouvé % fois (attendu 1), rien n''est changé', p_fn, i, n;
    end if;
    d := replace(d, p_paires[2 * i - 1], p_paires[2 * i]);
  end loop;
  execute d;
end;
$function$;

select pg_temp.fonction_patcher('public.bleo_ouvrir_langues_podz(boolean)'::regprocedure, array[
$a$      update pods set langues = langues || (
               select coalesce(max(c.langue), v_langue) from comptes c
                where lower(c.langue) = v_langue and c.is_active)
       where slug = r.slug;
      insert into bleo_langues_ouvertes (pod, langue, raison)
      values (r.slug, v_langue, jsonb_build_object('perf', round(s.perf, 3), 'posts', s.passages));$a$,
$b$      -- 0781 : le même geste que la page Podz et que Claude, noté au journal.
      perform public.podz_langue(r.slug, v_langue, 'ouvrir', 'soupape',
                                 jsonb_build_object('perf', round(s.perf, 3), 'posts', s.passages));$b$
]);

-- 5. Les langues d'un podz : en plus, celles que l'atelier sait produire et celles à préparer.
create or replace function public.pod_langues(p_pod text)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  with p as (
    select slug, label_id, langues, langues_pretes from pods where slug = p_pod
  ),
  decl as (
    select x.langue, x.n from p cross join lateral unnest(p.langues) with ordinality as x(langue, n)
  ),
  comptes_l as (
    select c.langue, count(*)::integer as n
    from p
    join compte_labels cl on cl.label_id = p.label_id
    join comptes c on c.id = cl.compte_id and c.is_active and c.langue is not null
    group by c.langue
  )
  select jsonb_build_object(
    'declarees', (select to_jsonb(langues) from p),
    'comptes', coalesce((select jsonb_object_agg(langue, n) from comptes_l), '{}'::jsonb),
    'a_livrer', case when (select langues from p) is null then null else coalesce((
      select jsonb_agg(d.langue order by d.n)
      from decl d
      where exists (
        select 1 from comptes_l c
        where lower(c.langue) = lower(d.langue)
           or (split_part(lower(c.langue), '-', 1) = lower(d.langue)
               and not exists (select 1 from decl d2 where lower(d2.langue) = lower(c.langue)))
      )
    ), '[]'::jsonb) end,
    -- 0781 : ce que l'atelier sait produire, et les langues ouvertes qu'il doit encore préparer.
    'pretes', (select to_jsonb(langues_pretes) from p),
    'a_preparer', case when (select langues from p) is null or (select langues_pretes from p) is null then null else coalesce((
      select jsonb_agg(d.langue order by d.n)
      from decl d
      where not exists (select 1 from p cross join lateral unnest(p.langues_pretes) x where lower(x) = lower(d.langue))
    ), '[]'::jsonb) end
  );
$function$;

comment on function public.pod_langues(text) is
  'Langues d''un podz (0654, 0781) : declarees (ouvertes, `pods.langues`), comptes actifs de son label par langue, a_livrer (les ouvertes qui ont un compte, ou une variante de compte non ouverte à part), pretes (ce que l''atelier sait produire) et a_preparer (ouvertes, pas encore prêtes). Lue par les actions `langues` et `boite` des podz.';
