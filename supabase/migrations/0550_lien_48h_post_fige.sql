-- 0550 : bugs du dashboard posteur (6/11).
--
-- c. Un post « Missed » : le lien est encore accepté 48 h après l'échéance
--    (fin du jour du post à l'heure locale), et il compte pour le jour
--    d'origine (la paie et semaine_comptes comptent déjà publie_url sur
--    date_publication_prevue). echeance_lien() = echeance_publication() + 48 h ;
--    le trigger refuser_publication_hors_delai l'utilise. « Missed » (les
--    étiquettes, ckd, nudges) garde echeance_publication.
-- b. Un post publié ne change plus : dès que le post (ou le passage) est
--    publié, ses slides (image, texte, ordre) et le contenu du passage sont
--    figés. Une écriture qui voudrait les changer garde l'ancienne valeur
--    (sans erreur : un traitement par lots ne casse pas) ; seuls l'admin et le
--    Head of Ops peuvent encore les corriger.
--
-- Additif : une fonction, deux triggers, un trigger réécrit.

create or replace function public.echeance_lien(p_date date, p_pays text)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select public.echeance_publication(p_date, p_pays) + interval '48 hours';
$$;

create or replace function public.refuser_publication_hors_delai()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pays text;
  v_echeance timestamptz;
begin
  if new.publie_at is not distinct from old.publie_at
     and new.publie_url is not distinct from old.publie_url then
    return new;
  end if;
  if coalesce(auth.role(), '') <> 'authenticated' or public.is_admin() then
    return new;
  end if;
  if new.date_publication_prevue is null
     or new.date_publication_prevue < date '2026-10-19'
     or coalesce((to_jsonb(new) ->> 'est_test')::boolean, false) then
    return new;
  end if;
  select c.pays into v_pays from public.comptes c where c.id = new.compte_id;
  -- 0550 : 48 h de plus pour coller le lien d'un post manqué (compté pour son jour).
  v_echeance := public.echeance_lien(new.date_publication_prevue, v_pays);
  if now() > v_echeance then
    raise exception
      'DELAI_PUBLICATION_DEPASSE:% — le lien de ce post pouvait être ajouté jusqu''à 48 h après la fin du % (heure locale) : il compte comme manqué',
      new.date_publication_prevue, new.date_publication_prevue
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- b. Les slides d'un post publié sont figées.
create or replace function public.post_slides_figer_publie()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then return new; end if;
  if exists (select 1 from public.posts p where p.id = old.post_id and p.publie_at is not null) then
    new.post_id := old.post_id;
    new.position := old.position;
    new.media_id := old.media_id;
    new.texte_overlay := old.texte_overlay;
    new.position_sophia := old.position_sophia;
    new.reference_url := old.reference_url;
  end if;
  return new;
end;
$$;
revoke execute on function public.post_slides_figer_publie() from public, anon, authenticated;

create or replace trigger post_slides_figer_publie
  before update on public.post_slides
  for each row execute function public.post_slides_figer_publie();

-- b. Le contenu d'un passage publié est figé (les stats, le lien, etc. restent modifiables).
create or replace function public.passages_figer_publie()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.publie_at is null or public.is_admin() then return new; end if;
  -- Seulement ce qui était déjà là : un lien posé après coup (post_id vide) reste possible.
  new.slides := coalesce(old.slides, new.slides);
  new.contenu_id := coalesce(old.contenu_id, new.contenu_id);
  new.post_id := coalesce(old.post_id, new.post_id);
  return new;
end;
$$;
revoke execute on function public.passages_figer_publie() from public, anon, authenticated;

create or replace trigger passages_figer_publie
  before update of slides, contenu_id, post_id on public.passages
  for each row execute function public.passages_figer_publie();
