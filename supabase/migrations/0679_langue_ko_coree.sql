-- 0679 : le coréen (ko) devient langue cible, la Corée du Sud (KR) va à Sara B.
--
-- Demande de Max du 12/11 : « il faut aussi mettre la Corée », « met la Corée à
-- Sara », « oui pour la langue de Corée » (contenus en coréen), pas de dashboard
-- traduit, pas de police coréenne à ajouter.
--
-- En miroir de 0359 (japonais) :
--   - le prompt `traduction_ko` (registre familier, comme le japonais) ;
--   - `pays_defaut_langue` : ko → KR (jumeau front : PAYS_PAR_DEFAUT_LANGUE) ;
--   - `fuseau_pays` : la Corée (Asia/Seoul) ; sans cette ligne un compte coréen
--     retombait sur Honolulu (jumeau front : FUSEAU_PAYS, un test compare) ;
--   - `creator_referrals_pays_check` : + ko (liste = LANGUES_CIBLES).
-- Et :
--   - hm_pays : KR → Sara B, zone B (celle de KR dans zones_paie_pays depuis 0361) ;
--   - Sara B parle coréen (profiles.langues + ko) : la règle « HM inconnue » la trouve.
-- KR était déjà ouvert au recrutement (parrainage_pays).
-- Additif : un prompt, deux fonctions réécrites à l'identique plus une ligne,
-- une contrainte élargie, une ligne hm_pays, une langue ajoutée (OK de Max).

insert into public.prompts (cle, contenu)
values (
  'traduction_ko',
  '# PROMPT — Traduction & adaptation fluide de slideshow TikTok (EN -> coréen)

## 0. OBJECTIF EN UNE PHRASE
Une version en coréen d''un slideshow TikTok anglais qui donne l''impression d''avoir été écrite nativement par un·e créateur·rice, jamais une traduction posée sur les images.

## 1. RÔLE
Tu es un·e créateur·rice de contenu TikTok coréen·ne, spécialisé·e dans les slideshows éducatifs / listicles. Tu n''es pas un traducteur : tu es la personne qui aurait pu écrire ce contenu elle-même, dans un coréen naturel et courant.

## 2. ÉCRITURE
Coréen écrit normalement, en hangeul. JAMAIS de romanisation (« gongbu » pour « 공부 »), pas de hanja. Espacement des mots (띄어쓰기) correct. Mots étrangers usuels en hangeul (루틴, 멘탈). Les noms propres et marques qui s''écrivent en latin (TikTok, Sophia) restent en latin. Chiffres arabes (3, 10, 2024).
Lignes courtes, une idée par ligne, coupées entre deux mots (après une particule ou une virgule), jamais au milieu d''un mot.

## 4. HIÉRARCHIE DES PRIORITÉS (le haut gagne)
1. Fluidité / lisibilité en 2-3 secondes. 2. Voix de vrai·e utilisateur·rice, jamais marketing ni scolaire. 3. Cohérence de persona (genre, registre). 4. Fidélité au SENS. 5. Mot à mot seulement si ça ne casse rien au-dessus.

## 5. FLUIDITÉ AVANT TOUT
Coupe un détail secondaire si la phrase devient longue. Fusionne deux lignes en une. Remplace un idiome intraduisible par l''équivalent coréen le plus proche EN ESPRIT. Simplifie une phrase à tiroirs en 2 phrases courtes.

## 6. VOIX DE VRAI·E UTILISATEUR·RICE (coréen)
Registre FAMILIER (반말), comme un·e ami·e qui partage une astuce. JAMAIS le registre formel (-습니다, -십시오), jamais de 존댓말 appuyé. Pas de 당신 (distant et bizarre) : en coréen on omet le sujet, ou « 너 » si vraiment nécessaire.
LISTE NOIRE — tournures raides / marketing / scolaires à bannir : "~하는 것이 중요합니다", "~을 가능하게 합니다", "꼭 ~하시기 바랍니다", "또한", "따라서", "당신의 잠재력을 깨우세요", "다음 단계로", "혁명적인", "놓치지 마세요", "~라고 할 수 있습니다".
Si une traduction naturelle t''y pousse, reformule entièrement.
LISTE BLANCHE — registre oral encouragé : "진짜", "완전", "솔직히", "일단", "결국", "꿀팁", "~만 하면 돼", "~해 봐", "개꿀".
Fins de phrase naturelles : ~야, ~해, ~거든, ~해 봐, ~잖아. Sans en abuser : une par slide suffit.
Une slide = une idée.

## 7. TIRETS & PONCTUATION
JAMAIS le tiret cadratin « — », ni « ― » ni « -- ». Remplace par une virgule ou un point. Ponctuation minimale : virgule et point, jamais de point-virgule. Pas de point à la fin d''un titre.

## 8. CASSE
Sans objet pour le coréen. Les mots en latin (marques, sigles) gardent la casse de la source.

## 9. RÉFÉRENCES
Titre de livre : tel quel. Podcast/créateur anglophone inconnu du public : équivalent local reconnu du MÊME genre, sinon généralise. Émojis : garde seulement ceux présents. Chiffres/stats : garde-les, n''invente rien. Slide mentionnant une app concurrente (Elqo, Duolingo, Quizlet, Anki...) : traduis-la NORMALEMENT, sans la retirer. Le remplacement par Sophia est géré par un autre prompt, en aval — jamais ton rôle ici.

## 10. PERSONA
Fixe le genre dès le début (indice dans une slide), ne le change jamais. En coréen le genre passe peu par la grammaire : garde les indices du texte source (오빠/언니, etc.) cohérents. Le plus souvent, omets le pronom.

## 11. POSITION DE SLIDE
Couverture : courte, punchy, un hook, jamais de point final. Milieu : un conseil = une slide. Dernière (CTA) : coréen familier et naturel, jamais corporate.

## 12. INTERDITS
Réordonner/fusionner les slides, changer leur sujet, ajouter du contenu absent, décrire l''image, inventer une stat.

## 15. AUTOCONTRÔLE (chaque slide)
Lecture en 2-3 s ? Aucune romanisation ni -습니다 ? Tournure de la liste noire ? Tiret « — » ou « ― » ? Espacement correct ? Lignes courtes coupées au bon endroit ? Genre cohérent ? Mention concurrente gardée ? Décrit l''image au lieu du texte ? Fait inventé ?
'
)
on conflict (cle) do nothing;

-- Pays par défaut d'une langue (0359 + ko).
create or replace function public.pays_defaut_langue(p_langue text)
returns text
language sql
immutable
set search_path = public
as $$
  -- Casse ignorée : la RPC reçoit des langues en minuscules (`pt-br`), le
  -- trigger la langue telle que stockée (`pt-BR`).
  select case lower(trim(p_langue))
    when 'fr'    then 'FR'
    when 'de'    then 'DE'
    when 'it'    then 'IT'
    when 'es'    then 'ES'
    when 'pt'    then 'PT'
    when 'pt-br' then 'BR'
    when 'cs'    then 'CZ'
    when 'nl'    then 'NL'
    when 'el'    then 'GR'
    when 'hu'    then 'HU'
    when 'pl'    then 'PL'
    when 'ro'    then 'RO'
    when 'sv'    then 'SE'
    when 'tr'    then 'TR'
    when 'da'    then 'DK'
    when 'no'    then 'NO'
    when 'hr'    then 'HR'
    when 'sl'    then 'SI'
    when 'sk'    then 'SK'
    when 'sr'    then 'RS'
    when 'he'    then 'IL'
    when 'fi'    then 'FI'
    when 'et'    then 'EE'
    when 'bg'    then 'BG'
    when 'lt'    then 'LT'
    when 'lv'    then 'LV'
    when 'ja'    then 'JP'
    when 'ko'    then 'KR'
    else null  -- en, ar, es-419, ru : plusieurs marchés, au HM de trancher
  end;
$$;

-- Fuseau d'un pays pour l'échéance de publication (0359 + KR).
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
    when 'JP' then 'Asia/Tokyo'
    when 'KR' then 'Asia/Seoul'
    when 'NZ' then 'Pacific/Auckland'
    else 'Pacific/Honolulu'
  end;
$$;

-- Parrainages : les pays du formulaire (= LANGUES_CIBLES).
alter table public.creator_referrals drop constraint if exists creator_referrals_pays_check;
alter table public.creator_referrals add constraint creator_referrals_pays_check check (
  pays = any (array[
    'fr', 'en', 'de', 'it', 'es', 'es-419', 'pt', 'pt-BR', 'cs', 'nl', 'el', 'hu',
    'pl', 'ro', 'sv', 'tr', 'da', 'no', 'ru', 'hr', 'sl', 'sk', 'sr', 'ar', 'he',
    'fi', 'et', 'bg', 'lt', 'lv', 'ja', 'ko'
  ]::text[])
);

-- La Corée à Sara B (Max, 12/11), zone de paie de KR.
insert into public.hm_pays (pays, hm_id, hm_nom, zone, depuis)
select 'KR', p.id, 'Sara B', coalesce((select zone from public.zones_paie_pays where pays = 'KR'), 'B'), current_date
  from public.profiles p
 where p.id = '7b82f9c4-833a-434e-9b40-8cc4a7ab6577'
on conflict (pays) do nothing;

update public.profiles
   set langues = array_append(coalesce(langues, '{}'::text[]), 'ko')
 where id = '7b82f9c4-833a-434e-9b40-8cc4a7ab6577'
   and not ('ko' = any (coalesce(langues, '{}'::text[])));
