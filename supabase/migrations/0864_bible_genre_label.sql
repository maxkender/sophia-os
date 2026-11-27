-- 0864 · Bible : le genre des comptes d'un label se choisit à la création, et il est obligatoire pour le créer.
--
-- ⏳ À appliquer (MCP) avec le déploiement du front (fenêtres de la Bible : « nouveau label », « Modifier ou
-- rattacher »).
--
-- 26/11 : les 6 comptes posteurs du label `looksmaxxing_man` (Atala, créé depuis la Bible le 24/11) avaient un
-- persona féminin (prénom, bio, photo de profil). Le label n'avait pas de genre (`labels.genre` nul) : la Bible ne
-- le demandait pas, `label_propose_valider` ne le remplissait pas, et la devinette d'après le nom ne connaissait
-- pas « man ». Sans genre, un compte prend celui de sa source, et par défaut « femme ». Corrigé à la main pour
-- looksmaxxing_man (genre = homme) ; la devinette reconnaît désormais man, men, guy, boy… (label_theme.ts).
--
-- Désormais :
--   * `labels_proposes.genre` (homme | femme) : choisi dans la Bible à la création d'un label (pré-rempli d'après
--     le nom quand il est clair), modifiable dans « Modifier ou rattacher » ;
--   * `label_propose_valider` refuse de créer le label sans genre, et le recopie sur `labels.genre` (aussi sur un
--     label existant du même nom qui n'en a pas) ;
--   * les propositions encore ouvertes dont le nom dit clairement le genre (girl, woman, male, man…) le reçoivent.
--
-- Retour arrière : `label_propose_valider` de 0763 (corps complet) ; la colonne peut rester.

set lock_timeout = '5s';

alter table public.labels_proposes
  add column if not exists genre text check (genre in ('homme', 'femme'));

comment on column public.labels_proposes.genre is
  '0864 : le genre des comptes du label (prénom, bio, photo de profil). Obligatoire pour créer le label (label_propose_valider), recopié sur labels.genre.';

-- Les propositions ouvertes dont le nom est clair : mots entiers, comme label_theme.ts.
update public.labels_proposes p
   set genre = case
         when exists (select 1 from regexp_split_to_table(lower(p.nom), '[^a-z0-9]+') m
                       where m in ('girl', 'girls', 'femme', 'female', 'woman', 'women', 'lady', 'ladies', 'her', 'she')) then 'femme'
         when exists (select 1 from regexp_split_to_table(lower(p.nom), '[^a-z0-9]+') m
                       where m in ('male', 'homme', 'alpha', 'man', 'men', 'guy', 'guys', 'boy', 'boys', 'gentleman', 'gentlemen', 'bro', 'bros')) then 'homme'
       end
 where p.genre is null and p.statut not in ('valide', 'refuse');

create or replace function public.label_propose_valider(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  p public.labels_proposes;
  v_label uuid;
  v_app uuid;
begin
  if not public.is_admin_strict() then raise exception 'réservé à l''admin' using errcode = '42501'; end if;
  select * into p from public.labels_proposes where id = p_id for update;
  if p.id is null then raise exception 'label proposé introuvable'; end if;
  if p.statut = 'valide' then return jsonb_build_object('ok', true, 'label_id', p.label_id, 'deja', true); end if;
  if p.statut = 'refuse' then raise exception 'ce label a été refusé'; end if;
  if cardinality(p.application_ids) = 0 then
    raise exception 'Choisis d''abord une app existante pour ce label%',
      case when cardinality(p.apps_attente) > 0 then ' (' || array_to_string(p.apps_attente, ', ') || ' n''existe pas encore)' else '' end;
  end if;
  -- 0864 : le genre des comptes, sinon ils prennent celui de leur source (femme par défaut).
  if p.genre is null then
    raise exception 'Choisis le genre des comptes de ce label (femme ou homme) dans « Modifier ou rattacher » : il fixe leur prénom, leur bio et leur photo de profil.';
  end if;
  select id into v_label from public.labels where lower(nom) = p.nom limit 1;
  if v_label is null then
    v_app := p.application_ids[1];
    insert into public.labels (nom, slug, style_theme, application_id, genre)
    values (p.nom, replace(p.nom, '_', '-'), nullif(btrim(coalesce(p.description_da, '')), ''), v_app, p.genre)
    returning id into v_label;
  else
    update public.labels set genre = p.genre where id = v_label and genre is null;
  end if;
  insert into public.label_applications (label_id, application_id)
  select v_label, a from unnest(p.application_ids) a
  on conflict do nothing;
  update public.labels_proposes
     set statut = 'valide', label_id = v_label, decide_par = auth.uid(), decide_at = now(),
         badge = case when section is not null then 'existe' else badge end
   where id = p.id;
  -- 0763 : les comptes gardent leur carte (label_propose_id) et prennent le vrai label.
  update public.bible_comptes set label_id = v_label where label_propose_id = p.id;
  return jsonb_build_object('ok', true, 'label_id', v_label);
end;
$function$;
