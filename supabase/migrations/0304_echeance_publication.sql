-- 0304 : « Mark as published » seulement jusqu'à la fin du jour du post,
-- à l'heure locale du poster (ticket Aram, « 4 Changes to Calendar », change 3).
--
-- Avant : un poster pouvait marquer un post publié n'importe quand, des jours
-- après. D'où des posts « rattrapés » tard pour être payés (3 cas cette
-- semaine), et un « Remaining » faux tant que la journée n'était pas finie
-- partout.
--
-- Maintenant : l'échéance d'un post est la fin de sa date prévue (minuit qui
-- la termine) dans le fuseau du PAYS du compte. Passé ce moment, ni
-- `publie_at` ni `publie_url` ne peuvent plus changer côté poster, ni sur
-- `posts` ni sur `passages` (le poster peut écrire les deux, et c'est
-- `passages` qui compte publiés et manqués) : le post reste manqué. L'admin et le Head of Ops (`is_admin`), le service et les
-- crons ne sont pas concernés : ils corrigent les litiges.
--
-- Le fuseau vient du pays, sans rien à saisir. Quatre pays actifs ont
-- plusieurs fuseaux (US, CA, AU, BR) : on prend le plus à l'ouest, qui finit
-- la journée en dernier. Aucun poster honnête n'est bloqué ; la marge laissée
-- à l'est du pays reste d'environ 3 h. Un pays absent de la table (ou un
-- compte sans pays) prend le fuseau le plus tolérant (Honolulu) : mieux vaut
-- laisser passer que bloquer à tort.
--
-- Départ : posts datés du 19/10/2026 et après. Les plus anciens restent
-- marquables comme avant, les posters n'ayant pas été prévenus.
--
-- Jumeau côté front : FUSEAU_PAYS dans src/features/moteur/echeancePublication.ts.
-- Un test compare les deux tables.
--
-- Retour arrière : `drop trigger posts_refuser_publication_hors_delai on
-- public.posts; drop trigger passages_refuser_publication_hors_delai on
-- public.passages;` (les fonctions peuvent rester).

create or replace function public.fuseau_pays(p_pays text)
returns text
language sql
immutable
set search_path = public
as $$
  select case upper(coalesce(p_pays, ''))
    when 'US' then 'America/Los_Angeles'
    when 'CA' then 'America/Vancouver'
    when 'AU' then 'Australia/Perth'
    when 'BR' then 'America/Rio_Branco'
    when 'MX' then 'America/Tijuana'
    when 'AR' then 'America/Argentina/Buenos_Aires'
    when 'CL' then 'America/Santiago'
    when 'CO' then 'America/Bogota'
    when 'UY' then 'America/Montevideo'
    when 'PE' then 'America/Lima'
    when 'EC' then 'America/Guayaquil'
    when 'VE' then 'America/Caracas'
    when 'PY' then 'America/Asuncion'
    when 'BO' then 'America/La_Paz'
    when 'CR' then 'America/Costa_Rica'
    when 'PA' then 'America/Panama'
    when 'GT' then 'America/Guatemala'
    when 'SV' then 'America/El_Salvador'
    when 'HN' then 'America/Tegucigalpa'
    when 'NI' then 'America/Managua'
    when 'DO' then 'America/Santo_Domingo'
    when 'CU' then 'America/Havana'
    when 'PR' then 'America/Puerto_Rico'
    when 'GB' then 'Europe/London'
    when 'IE' then 'Europe/Dublin'
    when 'IS' then 'Atlantic/Reykjavik'
    when 'PT' then 'Europe/Lisbon'
    when 'ES' then 'Europe/Madrid'
    when 'FR' then 'Europe/Paris'
    when 'BE' then 'Europe/Brussels'
    when 'LU' then 'Europe/Luxembourg'
    when 'NL' then 'Europe/Amsterdam'
    when 'DE' then 'Europe/Berlin'
    when 'AT' then 'Europe/Vienna'
    when 'CH' then 'Europe/Zurich'
    when 'IT' then 'Europe/Rome'
    when 'MT' then 'Europe/Malta'
    when 'DK' then 'Europe/Copenhagen'
    when 'NO' then 'Europe/Oslo'
    when 'SE' then 'Europe/Stockholm'
    when 'FI' then 'Europe/Helsinki'
    when 'EE' then 'Europe/Tallinn'
    when 'LV' then 'Europe/Riga'
    when 'LT' then 'Europe/Vilnius'
    when 'PL' then 'Europe/Warsaw'
    when 'CZ' then 'Europe/Prague'
    when 'SK' then 'Europe/Bratislava'
    when 'HU' then 'Europe/Budapest'
    when 'SI' then 'Europe/Ljubljana'
    when 'HR' then 'Europe/Zagreb'
    when 'BA' then 'Europe/Sarajevo'
    when 'RS' then 'Europe/Belgrade'
    when 'ME' then 'Europe/Podgorica'
    when 'MK' then 'Europe/Skopje'
    when 'AL' then 'Europe/Tirane'
    when 'RO' then 'Europe/Bucharest'
    when 'MD' then 'Europe/Chisinau'
    when 'BG' then 'Europe/Sofia'
    when 'GR' then 'Europe/Athens'
    when 'CY' then 'Asia/Nicosia'
    when 'UA' then 'Europe/Kiev'
    when 'BY' then 'Europe/Minsk'
    when 'RU' then 'Europe/Kaliningrad'
    when 'TR' then 'Europe/Istanbul'
    when 'IL' then 'Asia/Jerusalem'
    when 'JO' then 'Asia/Amman'
    when 'LB' then 'Asia/Beirut'
    when 'EG' then 'Africa/Cairo'
    when 'MA' then 'Africa/Casablanca'
    when 'DZ' then 'Africa/Algiers'
    when 'TN' then 'Africa/Tunis'
    when 'SA' then 'Asia/Riyadh'
    when 'AE' then 'Asia/Dubai'
    when 'QA' then 'Asia/Qatar'
    when 'KW' then 'Asia/Kuwait'
    when 'BH' then 'Asia/Bahrain'
    when 'OM' then 'Asia/Muscat'
    when 'KZ' then 'Asia/Almaty'
    when 'AF' then 'Asia/Kabul'
    when 'PK' then 'Asia/Karachi'
    when 'IN' then 'Asia/Kolkata'
    when 'NZ' then 'Pacific/Auckland'
    else 'Pacific/Honolulu'
  end;
$$;

-- Fin du jour `p_date` dans le fuseau du pays.
create or replace function public.echeance_publication(p_date date, p_pays text)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select ((p_date + 1)::timestamp at time zone public.fuseau_pays(p_pays));
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
  v_echeance := public.echeance_publication(new.date_publication_prevue, v_pays);
  if now() > v_echeance then
    raise exception
      'DELAI_PUBLICATION_DEPASSE:% — ce post devait être marqué publié avant la fin du % (heure locale) : il compte comme manqué',
      new.date_publication_prevue, new.date_publication_prevue
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger posts_refuser_publication_hors_delai
  before update of publie_at, publie_url on public.posts
  for each row execute function public.refuser_publication_hors_delai();

create trigger passages_refuser_publication_hors_delai
  before update of publie_at, publie_url on public.passages
  for each row execute function public.refuser_publication_hors_delai();
