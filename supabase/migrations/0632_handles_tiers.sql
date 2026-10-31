-- 0632 : plus jamais le handle d'un autre compte dans nos slides (Adrien, 31/10).
--
-- Les remakes de @richgirlacadmy_1 (smart_girl) gardaient sa dernière slide :
-- « Follow @richgirlacadmy to align your life… », parfois avec son guide « dans
-- la bio ». Les traductions la recopiaient, langue par langue : en octobre, 862
-- passages ont affiché ce handle (148 contenus), et le 31/10 au matin 14 posts du
-- jour l'avaient encore. D'autres handles traînaient aussi (@wagamamalover,
-- @motiontoughts, @mentoridaily…). Au total, 1 115 slides dans 25 langues, dont
-- 1 068 sont la dernière slide du deck, tout entière l'outro du concurrent.
--
-- Règle, en base pour couvrir tous les chemins (import, dépôt des podz,
-- traduction, variations, deck par appli, saisie à la main) :
--   - un handle tiers est un « @nom » qui n'est pas celui d'un de nos comptes
--     (`comptes.handle_tiktok`, `comptes.handle_instagram`) ; une adresse mail
--     (« x@y.com ») n'en est pas un ;
--   - la dernière slide d'un deck qui en porte un est l'outro du compte copié :
--     elle est remplacée par une outro neutre dans la langue (« follow for
--     more ») ; sauf la slide de l'appli, dont on retire seulement le handle ;
--   - ailleurs, le handle est retiré du texte.
-- Les triggers de `contenu_langues` (slides, slides_base) appliquent la règle à
-- chaque écriture ; celui de `post_slides` retire les handles en filet (il ne
-- sait pas quelle slide est la dernière d'un post en cours d'écriture).
--
-- Nettoyés ici une fois : tous les decks de `contenu_langues`, et les slides des
-- posts pas encore publiés. Les posts publiés restent tels quels (déjà en ligne).
--
-- Retour arrière : supprimer les deux triggers ; les textes nettoyés ne
-- reviennent pas (aucun n'était voulu).

set lock_timeout = '5s';

create or replace function public.outro_suivre(p_langue text)
returns text
language sql
immutable
as $function$
  select case lower(coalesce(p_langue, 'en'))
    when 'pt-br' then 'siga para mais dicas'
    else case split_part(lower(coalesce(p_langue, 'en')), '-', 1)
      when 'fr' then 'abonne-toi pour plus de conseils'
      when 'es' then 'sígueme para más consejos'
      when 'pt' then 'segue para mais dicas'
      when 'de' then 'folge mir für mehr Tipps'
      when 'it' then 'seguimi per altri consigli'
      when 'nl' then 'volg mij voor meer tips'
      when 'tr' then 'daha fazlası için takip et'
      when 'cs' then 'sleduj mě pro další tipy'
      when 'sk' then 'sleduj ma pre ďalšie tipy'
      when 'pl' then 'obserwuj, by zobaczyć więcej porad'
      when 'hu' then 'kövess további tippekért'
      when 'ro' then 'urmărește-mă pentru mai multe sfaturi'
      when 'el' then 'ακολούθησέ με για περισσότερες συμβουλές'
      when 'fi' then 'seuraa, niin saat lisää vinkkejä'
      when 'sv' then 'följ mig för fler tips'
      when 'no' then 'følg meg for flere tips'
      when 'nb' then 'følg meg for flere tips'
      when 'da' then 'følg mig for flere tips'
      when 'et' then 'jälgi mind, et saada rohkem nõuandeid'
      when 'lv' then 'seko man, lai uzzinātu vairāk padomu'
      when 'lt' then 'sek mane, kad sužinotum daugiau patarimų'
      when 'sl' then 'sledi mi za več nasvetov'
      when 'hr' then 'zaprati me za još savjeta'
      when 'sr' then 'zaprati me za još saveta'
      when 'bs' then 'zaprati me za još savjeta'
      when 'bg' then 'последвай ме за още съвети'
      when 'uk' then 'підписуйся, щоб отримати більше порад'
      when 'ru' then 'подпишись, чтобы узнать больше советов'
      when 'ar' then 'تابعني لمزيد من النصائح'
      when 'he' then 'עקבו אחריי לעוד טיפים'
      else 'follow for more'
    end
  end
$function$;

comment on function public.outro_suivre(text) is
  '0632 : outro neutre (« follow for more ») dans la langue, à la place d''une outro qui renvoyait vers un autre compte.';

-- Le texte sans handle tiers. p_outro : c'est la dernière slide (hors slide de
-- l'appli) ; si elle portait un handle tiers, elle devient l'outro neutre.
create or replace function public.texte_sans_handle_tiers(p_texte text, p_langue text, p_outro boolean)
returns text
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v text := p_texte;
  h text;
  tiers boolean := false;
begin
  if p_texte is null or position('@' in p_texte) = 0 then
    return p_texte;
  end if;
  for h in
    select distinct m[2]
      from regexp_matches(p_texte, '(^|[^A-Za-z0-9_@.])@([A-Za-z0-9_](?:[A-Za-z0-9_.]*[A-Za-z0-9_])?)', 'g') m
  loop
    if not exists (select 1 from comptes c
                    where lower(c.handle_tiktok) = lower(h) or lower(c.handle_instagram) = lower(h)) then
      tiers := true;
      v := regexp_replace(v, '[ \t]*@' || replace(h, '.', '\.') || '(?![A-Za-z0-9_])', '', 'gi');
    end if;
  end loop;
  if not tiers then
    return p_texte;
  end if;
  if p_outro then
    return public.outro_suivre(p_langue);
  end if;
  v := regexp_replace(v, '[ \t]{2,}', ' ', 'g');
  v := regexp_replace(v, '[ \t]+\n', E'\n', 'g');
  return btrim(v, E' \t\n');
end;
$function$;

comment on function public.texte_sans_handle_tiers(text, text, boolean) is
  '0632 : retire d''un texte de slide les handles qui ne sont pas à nous ; la dernière slide qui en portait un devient l''outro neutre de la langue.';

create or replace function public.slides_sans_handle_tiers(p_slides jsonb, p_langue text)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_dern integer;
begin
  if p_slides is null or jsonb_typeof(p_slides) <> 'array' or position('@' in p_slides::text) = 0 then
    return p_slides;
  end if;
  select max((e->>'position')::int) into v_dern from jsonb_array_elements(p_slides) e;
  return (
    select jsonb_agg(
             case when jsonb_typeof(e) = 'object' and position('@' in coalesce(e->>'texte_overlay', '')) > 0
                  then jsonb_set(e, '{texte_overlay}', to_jsonb(public.texte_sans_handle_tiers(
                         e->>'texte_overlay', p_langue,
                         (e->>'position')::int = v_dern and not coalesce((e->>'position_sophia')::boolean, false))))
                  else e end
             order by o)
      from jsonb_array_elements(p_slides) with ordinality as t(e, o)
  );
end;
$function$;

comment on function public.slides_sans_handle_tiers(jsonb, text) is
  '0632 : un deck (tableau de slides) sans handle tiers ; la dernière slide qui en portait un devient l''outro neutre de la langue.';

-- ---------------------------------------------------------------------------
-- Les triggers
-- ---------------------------------------------------------------------------
create or replace function public.contenu_langues_sans_handle_tiers()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.slides := public.slides_sans_handle_tiers(new.slides, new.langue);
  new.slides_base := public.slides_sans_handle_tiers(new.slides_base, new.langue);
  return new;
end;
$function$;

drop trigger if exists contenu_langues_sans_handle_tiers on public.contenu_langues;
create trigger contenu_langues_sans_handle_tiers
  before insert or update of slides, slides_base on public.contenu_langues
  for each row execute function public.contenu_langues_sans_handle_tiers();

create or replace function public.post_slides_sans_handle_tiers()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.texte_overlay is not null and position('@' in new.texte_overlay) > 0 then
    new.texte_overlay := public.texte_sans_handle_tiers(new.texte_overlay, null, false);
  end if;
  return new;
end;
$function$;

drop trigger if exists post_slides_sans_handle_tiers on public.post_slides;
create trigger post_slides_sans_handle_tiers
  before insert or update of texte_overlay on public.post_slides
  for each row execute function public.post_slides_sans_handle_tiers();

-- ---------------------------------------------------------------------------
-- Nettoyage une fois
-- ---------------------------------------------------------------------------
-- Les posts pas encore publiés : la dernière slide (hors appli) devient l'outro
-- de la langue du passage. Avant les decks, pour lire la langue du passage.
update post_slides ps
   set texte_overlay = public.texte_sans_handle_tiers(
         ps.texte_overlay,
         coalesce(pa.langue, co.langue),
         ps.position = (select max(ps2.position) from post_slides ps2 where ps2.post_id = ps.post_id)
           and not coalesce(ps.position_sophia, false))
  from posts po
  left join lateral (select p.langue from passages p where p.post_id = po.id limit 1) pa on true
  left join comptes co on co.id = po.compte_id
 where po.id = ps.post_id
   and po.statut::text <> 'publie'
   and po.date_publication_prevue >= (now() at time zone 'Europe/Paris')::date
   and ps.texte_overlay ~ '@[A-Za-z0-9_]';

update contenu_langues
   set slides = public.slides_sans_handle_tiers(slides, langue),
       slides_base = public.slides_sans_handle_tiers(slides_base, langue)
 where position('@' in coalesce(slides::text, '') || coalesce(slides_base::text, '')) > 0;
