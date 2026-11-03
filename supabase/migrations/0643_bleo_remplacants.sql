-- 0643 : BLEO, un créneau hors plan est servi par BLEO, plus par la tierlist (D49).
--
-- Bilan du 2/11 : 29 posts rendus à la tierlist (`bras = 'temoin'`), dont 22
-- remplacements dans la journée (un post retiré puis remplacé, 8 h 28 à 22 h 03)
-- et 7 créneaux de minuit non servables. Un remplacement relance l'assignation
-- du compte : le plan du compte a déjà ses deux créneaux posés, le contenu
-- retiré est exclu, il ne reste rien au plan, et l'assignation retombait sur la
-- tierlist (`choisirContenu`). La tierlist doit être retirée vers le 16/11.
--
-- `bleo_remplacants(compte, jour, application, exclure, limite)` rend, pour UN
-- créneau, les meilleurs candidats BLEO de ce compte, dans l'ordre où les
-- essayer (le deck du premier peut rater) :
--   * le même vivier que le tirage pour ce compte et cette application : labels
--     du compte, contenu valide et importé, UGC selon le compte, pertinence et
--     deck pas refusé pour une autre application que Sophia, deck livré prêt
--     pour un contenu livré, pas le même contenu pour une autre application à
--     moins de 7 jours ;
--   * la file `valeur` du tirage : contenu jugé, valeur de la nuit > 0 dans la
--     langue du compte ;
--   * jamais le même contenu sur le compte à moins de `meme_contenu_jours` ;
--   * les garde-fous relâchés dans l'ordre du tirage, au besoin : budget du
--     thème, puis couverture, puis même thème (le moins de garde-fous enfreints
--     d'abord) ;
--   * à garde-fous égaux, un tirage au sort pondéré par valeur^exposant, comme
--     le tirage (clé de Efraimidis-Spirakis : ln(u) / poids).
-- L'assignation (`assignation_contenu.ts`) essaie ces candidats avant la
-- tierlist, qui ne reste que le dernier secours.
--
-- Retour arrière : drop function public.bleo_remplacants(uuid, date, uuid, uuid[], integer);
-- (l'assignation retombe alors sur la tierlist, comme avant).

create or replace function public.bleo_remplacants(
  p_compte uuid,
  p_jour date,
  p_application uuid default null,
  p_exclure uuid[] default '{}',
  p_limite integer default 5
)
returns table (contenu_id uuid, langue text, application_id uuid, valeur numeric, categorie text, relache text)
language plpgsql
set search_path to 'public'
as $function$
declare
  reg jsonb;
  v_langue text;
  v_ugc boolean;
  v_app uuid;
  v_slug text;
  v_j_contenu integer;
  v_j_famille integer;
  v_j_couverture integer;
  v_budget numeric;
  v_plancher numeric;
  v_budget_jours integer;
  v_exposant double precision;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'bleo : réservé aux admins' using errcode = '42501';
  end if;
  select r.valeur into reg from reglages r where r.cle = 'bleo';
  if reg is null then return; end if;
  select co.langue, (coalesce(co.ugc_ai, false) and not coalesce(co.ugc_ai_video, false))
    into v_langue, v_ugc
    from comptes co where co.id = p_compte;
  if v_langue is null then return; end if;
  select a.id, a.slug into v_app, v_slug
    from applications a where a.id = coalesce(p_application, '00000000-0000-4000-8000-000000000001'::uuid);
  if v_app is null then return; end if;

  v_j_contenu := (reg->'garde_fous'->>'meme_contenu_jours')::int;
  v_j_famille := (reg->'garde_fous'->>'meme_famille_jours')::int;
  v_j_couverture := (reg->'garde_fous'->>'meme_couverture_jours')::int;
  v_budget := (reg->'garde_fous'->>'budget_famille')::numeric;
  v_plancher := (reg->'garde_fous'->>'budget_plancher')::numeric;
  v_budget_jours := (reg->'garde_fous'->>'budget_jours')::int;
  v_exposant := coalesce((reg->'valeur'->>'exposant')::double precision, 3);

  return query
  with hist as materialized (
    select p.contenu_id as cid, public.bleo_theme_famille(c.famille_id) as theme,
           c.couverture_empreinte as couv, p.date_publication_prevue as jour
      from passages p
      join contenus c on c.id = p.contenu_id
     where p.compte_id = p_compte
       and abs(p.date_publication_prevue - p_jour) < greatest(v_j_contenu, v_j_famille, v_j_couverture)
  ),
  cand as materialized (
    select c.id, v.valeur as val, v.n_post, c.couverture_empreinte as couv,
           coalesce(f.theme_id, c.famille_id) as theme,
           case when coalesce(c.verdict, 'en_attente') = 'en_attente' and f.verdict = 'gagnante' then 'gagnant'
                else coalesce(c.verdict, 'en_attente') end as verdict,
           (select min(cl.label_id::text)::uuid from contenu_labels cl
             where cl.contenu_id = c.id
               and cl.label_id in (select x.label_id from compte_labels x where x.compte_id = p_compte)) as label_id
      from bleo_valeurs v
      join contenus c on c.id = v.contenu_id
      left join bleo_familles f on f.id = c.famille_id
     where v.langue = v_langue and v.valeur > 0
       and c.statut = 'valide' and c.import_statut = 'done' and c.etat_bleo = 'juge'
       and c.ugc_compatible = v_ugc
       and not (c.id = any(coalesce(p_exclure, '{}'::uuid[])))
       and exists (select 1 from compte_labels x join contenu_labels cl on cl.label_id = x.label_id
                    where x.compte_id = p_compte and cl.contenu_id = c.id)
       and (
         (v_slug = 'sophia'
          and not exists (select 1 from contenu_pertinences cp
                           where cp.contenu_id = c.id and cp.application_id = v_app and cp.eligible = false))
         or
         (v_slug <> 'sophia' and not v_ugc and c.ugc_compatible = false
          and exists (select 1 from contenu_pertinences cp
                       where cp.contenu_id = c.id and cp.application_id = v_app and cp.eligible)
          and not exists (select 1 from contenu_langue_decks d
                           where d.contenu_id = c.id and d.application_id = v_app
                             and d.langue = v_langue and d.variante = v_slug
                             and (d.statut = 'ineligible'
                                  or (d.statut = 'echec' and d.updated_at > now() - interval '24 hours'))))
       )
       and (not coalesce(c.livre, false)
            or (v_slug = 'sophia' and exists (
                  select 1 from contenu_langues l
                   where l.contenu_id = c.id and l.langue = any(bleo_langues_livre(v_langue))
                     and bleo_deck_livre_pret(l.slides)))
            or (v_slug <> 'sophia' and exists (
                  select 1 from contenu_langue_decks d
                   where d.contenu_id = c.id and d.variante = v_slug
                     and d.langue = any(bleo_langues_livre(v_langue))
                     and d.statut = 'pret' and bleo_deck_livre_pret(d.slides))))
       and not exists (select 1 from passages p
                        where p.compte_id = p_compte and p.contenu_id = c.id
                          and p.application_id <> v_app
                          and abs(p.date_publication_prevue - p_jour) < 7)
       and not exists (select 1 from hist h where h.cid = c.id and abs(h.jour - p_jour) < v_j_contenu)
  ),
  bud_theme as materialized (
    select public.bleo_theme_famille(c.famille_id) as theme, count(*)::numeric as n
      from passages p join contenus c on c.id = p.contenu_id
     where p.date_publication_prevue between p_jour - (v_budget_jours - 1) and p_jour
       and not coalesce(p.est_rappel, false) and c.famille_id is not null
       and public.bleo_theme_famille(c.famille_id) in (select distinct cand.theme from cand)
     group by 1
  ),
  bud_label as materialized (
    select cl.label_id, count(*)::numeric as n
      from passages p join contenu_labels cl on cl.contenu_id = p.contenu_id
     where p.date_publication_prevue between p_jour - (v_budget_jours - 1) and p_jour
       and not coalesce(p.est_rappel, false)
       and cl.label_id in (select x.label_id from compte_labels x where x.compte_id = p_compte)
     group by 1
  ),
  note as (
    select cand.*,
           exists (select 1 from hist h where h.theme = cand.theme and abs(h.jour - p_jour) < v_j_famille) as v_theme,
           (cand.couv is not null and exists (
              select 1 from hist h
               where h.couv is not null and abs(h.jour - p_jour) < v_j_couverture
                 and length(h.couv) = 16 and length(cand.couv) = 16
                 and bit_count(('x' || h.couv)::bit(64) # ('x' || cand.couv)::bit(64)) <= 8)) as v_couv,
           (cand.theme is not null and
            coalesce((select b.n from bud_theme b where b.theme = cand.theme), 0) + 1
              > greatest(v_plancher, v_budget * (coalesce((select bl.n from bud_label bl where bl.label_id = cand.label_id), 0) + 1)))
             as hors_budget
      from cand
  )
  select note.id, v_langue, v_app, note.val,
         case when note.verdict = 'gagnant' and note.n_post = 0 then 'recolte'
              when note.verdict = 'gagnant' then 'gagnant_servi'
              when note.n_post = 0 then 'non_gagnant_neuve'
              else 'non_gagnant_servie' end,
         case when note.v_theme then 'budget+couverture+famille'
              when note.v_couv then 'budget+couverture'
              when note.hors_budget then 'budget'
              else null end
    from note
   order by (note.v_theme::int * 4 + note.v_couv::int * 2 + note.hors_budget::int),
            ln(greatest(random(), 1e-12)) / greatest(power(note.val::double precision, v_exposant), 1e-300) desc,
            note.id
   limit greatest(1, least(coalesce(p_limite, 5), 20));
end;
$function$;

comment on function public.bleo_remplacants(uuid, date, uuid, uuid[], integer) is
  'BLEO (0643, D49) : les meilleurs candidats BLEO pour UN créneau d''un compte hors plan (remplacement en journée, créneau du plan non servable, compte absent du plan) : vivier et garde-fous du tirage (au thème), relâchés au besoin, tirage pondéré par valeur^exposant.';
