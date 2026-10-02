-- Délai minimum entre deux publications d'un MÊME compte TikTok.
--
-- Mesuré sur 5 212 posts mûrs (22/07 → 25/09), indice normalisé par langue :
--   < 15 min  → 0,86   (597 posts)
--   1-4 h     → 1,02
--   4-12 h    → 1,17   (1 191 posts)
-- Publier deux slideshows collés coûte donc environ 27 % de vues. Le délai
-- retenu ici est de 25 min : il ne capture pas tout le gain (les données ne
-- montrent un indice > 1 qu'à partir de ~45 min), mais il reste acceptable
-- pour les créateurs. Il est réglable sans redéploiement, voir `frequence`.
--
-- PORTÉE : par compte TikTok, pas par créateur. 16 créateurs gèrent 2 ou 3
-- comptes ; l'algorithme TikTok juge des comptes, pas des personnes, donc
-- enchaîner compte A puis compte B n'a aucune raison d'être pénalisé.
--
-- POURQUOI EN BASE et pas dans l'interface : `majPost` est un update PostgREST
-- émis par le navigateur, et la policy `posts_update` n'a pas de WITH CHECK.
-- Un garde-fou React serait contournable depuis la console. Le compte à
-- rebours côté interface est du confort ; la règle, c'est ce trigger.

-- Réglage, fusionné dans la clé existante plutôt qu'une nouvelle clé.
update public.reglages
   set valeur = valeur || '{"delai_min_entre_posts": 25}'::jsonb
 where cle = 'frequence';

insert into public.reglages (cle, valeur)
values ('frequence', '{"posts_par_jour": 1, "delai_min_entre_posts": 25}'::jsonb)
on conflict (cle) do nothing;

/**
 * Refuse une publication trop rapprochée de la précédente, sur le même compte.
 *
 * SECURITY DEFINER par nécessité, pas par confort : la policy `posts_select`
 * n'expose au créateur que ses posts en `pipeline_statut = 'done'`. En droits
 * d'appelant, le MAX ci-dessous raterait un post précédent resté en pipeline
 * et laisserait passer la rafale — exactement ce qu'on veut empêcher.
 *
 * `publie_at` est RÉÉCRIT à now() pour les non-admins. Sans ça la garde serait
 * ornementale : le client fixe lui-même cet horodatage, et il suffirait
 * d'envoyer une date ancienne pour que l'écart paraisse suffisant.
 */
create or replace function public.exiger_delai_entre_publications()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  delai_min   int;
  precedent   timestamptz;
  restant_min int;
begin
  -- Seule la TRANSITION vers « publié » est jugée. Repasser un post déjà
  -- publié à « publié » (ex. correction du lien) ne doit rien déclencher.
  if new.statut::text <> 'publie' then return new; end if;
  if tg_op = 'UPDATE' and old.statut::text = 'publie' then return new; end if;

  if coalesce(new.est_test, false) then return new; end if;
  if is_admin() then return new; end if;

  new.publie_at := now();

  select coalesce((valeur->>'delai_min_entre_posts')::int, 25)
    into delai_min
    from reglages where cle = 'frequence';
  delai_min := coalesce(delai_min, 25);
  if delai_min <= 0 then return new; end if;

  select max(p.publie_at) into precedent
    from posts p
   where p.compte_id = new.compte_id
     and p.id <> new.id
     and p.statut::text = 'publie'
     and p.publie_at is not null
     and coalesce(p.est_test, false) = false;

  if precedent is null then return new; end if;

  restant_min := ceil(
    extract(epoch from (precedent + make_interval(mins => delai_min) - now())) / 60.0
  );
  if restant_min <= 0 then return new; end if;

  -- Le token en tête est lu par l'interface pour afficher le compte à rebours
  -- traduit ; le reste de la phrase sert quand l'erreur remonte brute.
  raise exception
    'DELAI_ENTRE_PUBLICATIONS:% — attends encore % min avant de publier sur ce compte (délai minimum % min)',
    restant_min, restant_min, delai_min
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists posts_exiger_delai_entre_publications on public.posts;
create trigger posts_exiger_delai_entre_publications
  before update of statut on public.posts
  for each row execute function public.exiger_delai_entre_publications();

-- Horodatage RÉEL de la publication TikTok.
--
-- `publie_at` est l'heure à laquelle le créateur a cliqué « marquer comme
-- publié », pas celle de la publication. Le scraper de résolution récupère
-- déjà `createTime` pour apparier les posts, puis le jette. On le garde :
-- sans lui, impossible de vérifier si le délai ci-dessus espace réellement
-- les publications ou seulement les déclarations.
alter table public.passages
  add column if not exists tiktok_publie_at timestamptz;

comment on column public.passages.tiktok_publie_at is
  'Horodatage TikTok réel (createTime du scrape). publie_at, lui, est l''heure de déclaration par le créateur.';

-- Reprise de l'existant : l'ID d'un post TikTok est un flocon dont les 32 bits
-- de poids fort portent la seconde Unix de création. Les 3 662 créneaux déjà
-- résolus portent donc leur vrai horodatage dans leur propre URL.
--
-- Contrôle avant écriture, sur ces 3 662 lignes : écart médian de -1,8 min
-- avec `publie_at`, 83 % à moins de 10 min, p95 à -0,3 min, jamais plus de
-- 11 min APRÈS le clic — l'ordre attendu (on publie, puis on coche). Les 19
-- chiffres sont uniformes et aucune date dérivée ne sort de la plage.
--
-- La clause `between` n'est pas décorative : un lien tronqué donnerait 1970.
update public.passages p
   set tiktok_publie_at = d.quand
  from (
    select id,
           to_timestamp(
             ((regexp_match(publie_url, '/(?:video|photo)/(\d{15,25})'))[1]::numeric
              / 4294967296)::bigint
           ) as quand
      from public.passages
     where publie_url is not null
       and tiktok_publie_at is null
       and publie_url ~ '/(?:video|photo)/\d{15,25}'
  ) d
 where p.id = d.id
   and d.quand between timestamptz '2016-01-01' and now() + interval '1 day';
