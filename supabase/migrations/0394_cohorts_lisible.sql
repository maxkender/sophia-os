-- 0394 — Chantier du 28 oct., partie B : la page Cohorts, plus lisible.
--
-- 1. `cohorte_recrues` rend aussi l'id du contrat Upwork (`contrat_id`) :
--    sans lui, une relance par Upwork ne peut pas partir (« X contracts not
--    linked: reminders can't reach them »). Même calcul sinon. Le type de
--    retour change : la fonction est recréée.
-- 2. `cohorte_relier_contrat(p_poster, p_url)` : le bouton « Link » de la
--    page. Même contrôle que `paie_enregistrer_contrat` (0361 : l'admin ou la
--    HM du posteur, un lien upwork.com), et il faut l'id du contrat dans le
--    lien (…/workroom/44784352/…) : il remplit `upwork_contract_id`, et
--    `upwork_contrat_url` s'il est vide.
--
-- Additive : aucune donnée existante modifiée par la migration.
-- Retour arrière : drop function public.cohorte_relier_contrat(uuid, text) ;
-- recréer cohorte_recrues de 0392.

drop function if exists public.cohorte_recrues(date[]);

create or replace function public.cohorte_recrues(p_lundis date[])
returns table (
  poster_id             uuid,
  nom                   text,
  pays                  text,
  hm_id                 uuid,
  hm_prenom             text,
  contrat               boolean,
  is_active             boolean,
  offre_at              timestamptz,
  cohorte_lundi         date,
  premiere_connexion_at timestamptz,
  slack_lie             boolean,
  slack_lie_at          timestamptz,
  compte_id             uuid,
  handle                text,
  tiktok_existe         boolean,
  tiktok_vu_at          timestamptz,
  abonnements           integer,
  warmup_started_at     timestamptz,
  warmup_reposts_at     timestamptz,
  semaine1              jsonb,
  samedi                jsonb,
  nudges                jsonb,
  prevues               jsonb,
  rouges                jsonb,
  contrat_id            text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_hm uuid;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    if not public.is_hiring_manager() then
      raise exception 'cohorte_recrues : réservé à l''admin et aux HMs';
    end if;
    v_hm := auth.uid();
  end if;

  return query
  with po as (
    select pr.* from public.profiles pr
     where pr.cohorte_lundi = any(p_lundis)
       and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
       and (v_hm is null or pr.manager_id = v_hm)
  ),
  -- Le 1er compte perso (le Double et le recréé viennent après).
  cpt as (
    select distinct on (c.poster_id) c.poster_id, c.id, c.handle_tiktok, c.pays, c.warmup_started_at, c.warmup_reposts_at
      from public.comptes c
     where c.poster_id in (select id from po) and c.type_compte = 'perso'
     order by c.poster_id, c.created_at
  )
  select po.id,
         coalesce(nullif(btrim(concat_ws(' ', po.prenom, po.nom)), ''), po.email),
         coalesce(cpt.pays, po.nationalite),
         po.manager_id, hm.prenom,
         (po.upwork_contract_id is not null or nullif(btrim(po.upwork_contrat_url), '') is not null),
         po.is_active,
         coalesce(po.offre_acceptee_le, po.created_at), po.cohorte_lundi,
         coalesce(po.premiere_connexion_at, u.last_sign_in_at),
         po.slack_user_id is not null, po.slack_lie_at,
         cpt.id, cpt.handle_tiktok, r.existe, r.releve_at, r.abonnements,
         cpt.warmup_started_at, cpt.warmup_reposts_at,
         -- Semaine 1 : posts publiés / prévus, compte par compte (lundi → dimanche).
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'compte_id', c.id, 'handle', c.handle_tiktok, 'is_active', c.is_active,
                    'prevus', s.prevus, 'publies', s.publies, 'publies_lun_mar', s.publies_lun_mar)
                  order by c.created_at)
             from public.comptes c
             cross join lateral (
               select count(*)::int as prevus,
                      count(*) filter (where x.publie_url is not null or x.publie_at is not null
                                          or x.statut::text = 'publie')::int as publies,
                      count(*) filter (where (x.publie_url is not null or x.publie_at is not null
                                              or x.statut::text = 'publie')
                                         and x.date_publication_prevue <= po.cohorte_lundi + 1)::int as publies_lun_mar
                 from public.passages x
                where x.compte_id = c.id
                  and not coalesce(x.est_rappel, false)
                  and x.statut::text <> 'brouillon'
                  and x.date_publication_prevue between po.cohorte_lundi and po.cohorte_lundi + 6
             ) s
            where c.poster_id = po.id and c.type_compte = 'perso'), '[]'::jsonb),
         -- Samedi de la semaine 1 : les propositions de Check, Kill or Double et leur décision.
         coalesce((
           select jsonb_agg(jsonb_build_object('regle', p.regle, 'action', p.action, 'decision', p.decision,
                                               'compte_id', p.compte_id))
             from public.ckd_propositions p
            where p.poster_id = po.id and p.type = 'samedi' and p.jour = po.cohorte_lundi + 5), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('type', n.type, 'periode', n.periode, 'envoye_at', n.envoye_at,
                                                       'canal', n.canal, 'resolu_at', n.resolu_at, 'erreur', n.slack_erreur)
                                    order by n.envoye_at)
                     from public.nudges n where n.poster_id = po.id and n.periode is not null), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('type', v.type, 'periode', v.periode, 'statut', v.statut,
                                                       'canal', v.canal, 'raison', v.raison))
                     from public.relances_prevues v where v.poster_id = po.id), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('etape', x.etape, 'periode', x.periode, 'rouge_at', x.rouge_at,
                                                       'decision', x.decision, 'decision_at', x.decision_at)
                                    order by x.rouge_at)
                     from public.recrues_rouges x where x.poster_id = po.id), '[]'::jsonb),
         -- L'id du contrat : c'est lui que les relances par Upwork utilisent (0391).
         po.upwork_contract_id
    from po
    left join public.profiles hm on hm.id = po.manager_id
    left join auth.users u on u.id = po.id
    left join cpt on cpt.poster_id = po.id
    -- Le dernier relevé lisible du profil TikTok avant le lundi de la cohorte.
    left join lateral (
      select w.existe, w.abonnements, w.releve_at from public.ckd_warmup_releves w
       where w.compte_id = cpt.id and w.existe is not null
         and w.releve_at < (po.cohorte_lundi::timestamp at time zone 'Europe/Paris')
       order by w.releve_at desc limit 1
    ) r on true;
end;
$$;

revoke execute on function public.cohorte_recrues(date[]) from public, anon;
grant execute on function public.cohorte_recrues(date[]) to authenticated;


create or replace function public.cohorte_relier_contrat(p_poster uuid, p_url text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
begin
  if not public.paie_droit_posteur(p_poster) then
    raise exception 'Réservé à l''admin et à la HM du posteur';
  end if;
  if p_url is null or btrim(p_url) !~* '^https://([a-z0-9-]+\.)*upwork\.com/' then
    raise exception 'Lien Upwork attendu (https://www.upwork.com/…)';
  end if;
  v_id := substring(btrim(p_url) from '/(?:workroom|contracts?)/([0-9]{6,})');
  if v_id is null then
    raise exception 'Lien du contrat attendu (…/workroom/44784352/…) : l''id du contrat n''y est pas';
  end if;
  update public.profiles
     set upwork_contract_id = v_id,
         upwork_contrat_url = coalesce(nullif(btrim(upwork_contrat_url), ''), btrim(p_url))
   where id = p_poster;
  return v_id;
end;
$$;

revoke execute on function public.cohorte_relier_contrat(uuid, text) from public, anon;
grant execute on function public.cohorte_relier_contrat(uuid, text) to authenticated;

notify pgrst, 'reload schema';
