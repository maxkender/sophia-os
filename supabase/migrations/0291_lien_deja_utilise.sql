-- 0291 : refuser un lien TikTok déjà déclaré pour un autre slideshow du même compte.
--
-- Le 15/10, asya.ogrenir761 a déclaré trois slideshows avec le même post
-- TikTok (le lien complet, puis deux fois le même en lien court « Partager »),
-- et mia.thrives282 quatre. La file de reviews affichait le même TikTok pour
-- chacun, la relecture automatique comparait des originaux au mauvais post, et
-- le relevé de vues comptait le même post plusieurs fois.
--
-- La page du créateur transforme déjà un lien court en lien complet avant
-- d'enregistrer (fonction `resoudre-tiktok`) : la comparaison se fait donc sur
-- l'ID du post. Un lien court qui n'a pas pu être résolu est comparé tel quel.
--
-- POURQUOI EN BASE : comme le délai entre publications (0259), `majPost` est un
-- update PostgREST émis par le navigateur ; une garde React se contournerait.
-- Le token en tête du message est lu par l'interface pour un message traduit.
--
-- Hors champ : les liens qui ne désignent pas un post (URL de profil, cf. 0242)
-- — c'est la résolution des publications qui les rattrape —, les posts de test
-- et les admins, qui corrigent les liens à la main.

create or replace function public.cle_lien_tiktok(url text)
returns text
language sql
immutable
as $$
  select case
    when url ~ '/(?:video|photo)/\d{15,25}'
      then 'id:' || (regexp_match(url, '/(?:video|photo)/(\d{15,25})'))[1]
    when url ~* '//(?:vm|vt)\.tiktok\.com/|tiktok\.com/t/'
      then regexp_replace(regexp_replace(lower(btrim(url)), '[?#].*$', ''), '/+$', '')
    else null
  end
$$;

comment on function public.cle_lien_tiktok(text) is
  'Clé d''un lien de post TikTok : l''ID du post (lien complet) ou le lien court nettoyé ; null si le lien ne désigne pas un post (profil…).';

/**
 * SECURITY DEFINER pour la même raison que 0259 : la policy `posts_select`
 * cache au créateur une partie de ses posts, la recherche du doublon les
 * raterait en droits d'appelant.
 */
create or replace function public.refuser_lien_deja_utilise()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  cle     text;
  autre   timestamptz;
begin
  if new.publie_url is null or btrim(new.publie_url) = '' then return new; end if;
  if tg_op = 'UPDATE' and new.publie_url is not distinct from old.publie_url then return new; end if;
  if coalesce(new.est_test, false) then return new; end if;
  if is_admin() then return new; end if;

  cle := cle_lien_tiktok(new.publie_url);
  if cle is null then return new; end if;

  select p.publie_at into autre
    from posts p
   where p.compte_id = new.compte_id
     and p.id <> new.id
     and coalesce(p.est_test, false) = false
     and p.publie_url is not null
     and cle_lien_tiktok(p.publie_url) = cle
   order by p.publie_at desc nulls last
   limit 1;
  if not found then return new; end if;

  raise exception
    'LIEN_DEJA_UTILISE:% — ce lien TikTok est déjà celui d''un autre slideshow de ce compte (déclaré le %) : colle le lien du post de CE slideshow',
    coalesce(to_char(autre at time zone 'Europe/Paris', 'DD/MM HH24:MI'), '?'),
    coalesce(to_char(autre at time zone 'Europe/Paris', 'DD/MM HH24:MI'), '?')
    using errcode = 'check_violation';
end;
$$;

create trigger posts_refuser_lien_deja_utilise
  before update of publie_url on public.posts
  for each row execute function public.refuser_lien_deja_utilise();
