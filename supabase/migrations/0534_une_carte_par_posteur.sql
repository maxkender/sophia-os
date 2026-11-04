-- 0534 — Simplification (04/11), partie 1 : UNE carte par posteur (ou par HM,
-- ou par offre), et trois onglets.
--
-- 1. Tous les sujets d'un même posteur vont dans sa carte : la carte gardée a
--    un sujet principal (ses colonnes habituelles) et les autres dans `sujets`
--    (catégorie, résumé, diagnostic, proposition, question…). Jamais deux
--    cartes ni deux décisions en parallèle pour la même personne.
--      - probleme_ajouter : un nouveau sujet d'un posteur qui a déjà une carte
--        ouverte s'y ajoute (sources + sujets) ;
--      - problemes_fusionner_par_posteur : fusionne les cartes ouvertes
--        actuelles (les autres sont fermées « fusionné dans … », rien n'est
--        supprimé) ;
--      - probleme_fermer_sujet : quand le recalcul règle le sujet principal,
--        le sujet suivant prend sa place ; la carte ne se ferme que quand il
--        n'en reste aucun. Une décision de Max ferme la carte entière.
-- 2. probleme_onglet : ⚡ urgent (argent, offres HM à refaire, alertes,
--    doute d'arrêt, menace, bot pas sûr : confiance < 0,8, ou une question
--    posée à Max), 📅 samedi (kill, doubler, recréer, reporter, stop, 0 post,
--    vues, 2e compte, absence, retirer de Slack, niveau samedi), sinon 🤖 bots.
-- 3. Le réglage « autonomie_bots » (off) : les bots n'agissent seuls que s'il
--    est sur on (partie 3).
--
-- Additif : 2 colonnes, des fonctions ; probleme_ajouter, problemes_recalculer,
-- problemes_liste et probleme_bot_lire patchées ou remplacées (mêmes signatures).

alter table public.problemes add column if not exists sujets jsonb not null default '[]'::jsonb;
alter table public.problemes add column if not exists confiance numeric;

insert into public.reglages (cle, valeur)
values ('autonomie_bots', '"off"'::jsonb)
on conflict (cle) do nothing;

-- Le sujet d'une carte, tel qu'il est rangé dans `sujets` quand une autre carte le prend.
create or replace function public.probleme_en_sujet(p public.problemes)
returns jsonb
language sql
stable
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'carte_id', p.id, 'categorie', p.categorie, 'niveau', p.niveau, 'resume', p.resume, 'at', p.created_at,
    'diagnostic', p.diagnostic, 'diagnostic_par', p.diagnostic_par,
    'proposition_action', p.proposition_action, 'proposition_reponse', p.proposition_reponse, 'canal_reponse', p.canal_reponse,
    'propose_par', p.propose_par, 'question', p.question, 'options', p.options,
    'kill_samedi_lundi', p.kill_samedi_lundi, 'rituel_choix', p.rituel_choix, 'rituel_lundi', p.rituel_lundi));
$$;

-- L'ordre de priorité pour garder une carte : décision, argent, arrêt, kill/rituel prévus, niveau, ancienneté.
create or replace function public.probleme_rang_garde(p public.problemes)
returns int
language sql
stable
as $$
  select (case when p.question is not null and p.categorie in ('paie', 'kill_contrat') then 0
               when p.question is not null then 1
               when p.categorie in ('paie', 'kill_contrat') then 2
               when p.categorie in ('stop', 'stop_doute') then 3
               when p.kill_samedi_lundi is not null or p.rituel_choix is not null then 4
               when p.niveau = 'urgent' then 5
               when p.niveau = 'aujourdhui' then 6 else 7 end);
$$;

-- probleme_ajouter : même signature ; un posteur = une carte.
create or replace function public.probleme_ajouter(
  p_type text, p_ref text, p_poster uuid, p_contrat text, p_categorie text, p_resume text,
  p_texte text default null, p_at timestamptz default null, p_lien text default null, p_canal text default null,
  p_par text default 'os'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_cle text := coalesce(p_poster::text, case when p_contrat is not null then 'contrat:' || p_contrat end, p_type || ':' || p_ref);
  v_niveau text := public.probleme_niveau(p_categorie);
  v_source jsonb := jsonb_strip_nulls(jsonb_build_object('type', p_type, 'ref', p_ref, 'at', coalesce(p_at, now()),
                      'texte', left(p_texte, 500), 'lien', p_lien, 'canal', p_canal, 'par', p_par, 'categorie', p_categorie));
  v_hm text;
  v_carte public.problemes;
begin
  if exists (select 1 from public.problemes_sources s where s.type = p_type and s.ref = p_ref) then
    return (select s.probleme_id from public.problemes_sources s where s.type = p_type and s.ref = p_ref);
  end if;
  -- Cohorte RUUL exclue.
  if p_poster is not null and exists (select 1 from public.hub_posteurs h where h.profile_id = p_poster) then
    insert into public.problemes_sources (type, ref, poster_id, texte, recu_at, archive, raison)
    values (p_type, p_ref, p_poster, left(p_texte, 500), p_at, true, 'RUUL (exclu)') on conflict do nothing;
    return null;
  end if;

  -- 0534 : une carte ouverte par posteur (ou par contrat, ou par source) : le nouveau sujet s'y ajoute.
  select * into v_carte from public.problemes p
   where p.cle_groupe = v_cle and p.statut = 'ouvert'
   order by (p.categorie = p_categorie) desc, public.probleme_rang_garde(p), p.created_at
   limit 1;
  if found then
    update public.problemes p
       set sources = p.sources || jsonb_build_array(v_source),
           sujets = case when p.categorie = p_categorie
                              or exists (select 1 from jsonb_array_elements(p.sujets) s where s->>'categorie' = p_categorie)
                         then p.sujets
                         else p.sujets || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
                                'categorie', p_categorie, 'niveau', v_niveau, 'resume', left(coalesce(nullif(btrim(p_resume), ''), p_categorie), 200),
                                'at', coalesce(p_at, now()), 'type', p_type, 'ref', p_ref,
                                'proposition_action', public.probleme_action_defaut(p_categorie)))) end,
           niveau = case when v_niveau = 'urgent' or p.niveau = 'urgent' then 'urgent'
                         when v_niveau = 'aujourdhui' and p.niveau = 'samedi' and not p.niveau_force then 'aujourdhui' else p.niveau end,
           maj_at = now()
     where p.id = v_carte.id
     returning p.id into v_id;
  else
    select nullif(btrim(concat_ws(' ', m.prenom, m.nom)), '') into v_hm
      from public.profiles pr join public.profiles m on m.id = pr.manager_id where pr.id = p_poster;
    insert into public.problemes as p (poster_id, contrat_id, hm, cle_groupe, categorie, niveau, resume, sources, proprietaire,
                                       proposition_action, propose_par, propose_at)
    values (p_poster, coalesce(p_contrat, (select pr.upwork_contract_id from public.profiles pr where pr.id = p_poster)), v_hm,
            v_cle, p_categorie, v_niveau, left(coalesce(nullif(btrim(p_resume), ''), p_categorie), 200), jsonb_build_array(v_source),
            public.probleme_proprietaire(p_poster, p_categorie), public.probleme_action_defaut(p_categorie),
            case when public.probleme_action_defaut(p_categorie) is not null then 'os' end,
            case when public.probleme_action_defaut(p_categorie) is not null then now() end)
    on conflict (cle_groupe, categorie) where statut = 'ouvert' do update
       set sources = p.sources || excluded.sources,
           niveau = case when excluded.niveau = 'urgent' then 'urgent' else p.niveau end,
           maj_at = now()
    returning p.id into v_id;
  end if;

  insert into public.problemes_sources (type, ref, probleme_id, poster_id, texte, recu_at)
  values (p_type, p_ref, v_id, p_poster, left(p_texte, 500), p_at) on conflict do nothing;
  return v_id;
end;
$$;
revoke all on function public.probleme_ajouter(text, text, uuid, text, text, text, text, timestamptz, text, text, text) from public, anon, authenticated;

-- Bots (0532) : la carte cible d'un « creer » est la carte ouverte du posteur, quel que soit le sujet.
create or replace function public.probleme_fusion_cible(p_poster uuid, p_categorie text, p_texte text, p_etape text default null)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from public.problemes p
   where p_poster is not null and p.poster_id = p_poster and p.statut = 'ouvert' and coalesce(p.sujet, 'posteur') = 'posteur'
   order by (p.categorie = p_categorie) desc, public.probleme_rang_garde(p), p.created_at
   limit 1;
$$;

-- Un sujet de plus dans une carte (fusion d'un « creer » de bot).
create or replace function public.probleme_fusionner_source(p_id uuid, p_type text, p_ref text, p_texte text, p_par text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.problemes
     set sources = sources || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
                     'type', p_type, 'ref', p_ref, 'at', now(), 'texte', left(p_texte, 500), 'par', p_par))),
         maj_at = now(),
         journal = journal || jsonb_build_object('at', now(), 'par', p_par, 'action', 'fusion', 'ref', p_ref)
   where id = p_id;
  insert into public.problemes_sources (type, ref, probleme_id, poster_id, texte, recu_at)
  select p_type, p_ref, p_id, p.poster_id, left(p_texte, 500), now() from public.problemes p where p.id = p_id
  on conflict do nothing;
end;
$$;
revoke all on function public.probleme_fusionner_source(uuid, text, text, text, text) from public, anon, authenticated;

-- Fusionner les cartes ouvertes : une par posteur (ou par contrat / source).
create or replace function public.problemes_fusionner_par_posteur()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g record;
  r public.problemes;
  v_garde public.problemes;
  n int := 0;
  v_detail jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role') and not public.is_admin() then
    raise exception 'problemes_fusionner_par_posteur : réservé à l''admin' using errcode = '42501';
  end if;
  for g in select cle_groupe from public.problemes where statut = 'ouvert' group by 1 having count(*) > 1 loop
    select * into v_garde from public.problemes p where p.cle_groupe = g.cle_groupe and p.statut = 'ouvert'
     order by public.probleme_rang_garde(p), p.created_at limit 1;
    for r in select * from public.problemes p where p.cle_groupe = g.cle_groupe and p.statut = 'ouvert' and p.id <> v_garde.id
              order by public.probleme_rang_garde(p), p.created_at loop
      update public.problemes k
         set sources = k.sources || r.sources,
             sujets = k.sujets || jsonb_build_array(public.probleme_en_sujet(r)) || r.sujets,
             niveau = case when r.niveau = 'urgent' or k.niveau = 'urgent' then 'urgent'
                           when (r.niveau = 'aujourdhui' or k.niveau = 'aujourdhui') and not k.niveau_force then 'aujourdhui' else k.niveau end,
             kill_samedi_lundi = coalesce(k.kill_samedi_lundi, r.kill_samedi_lundi),
             kill_samedi_at = coalesce(k.kill_samedi_at, r.kill_samedi_at),
             kill_samedi_par = coalesce(k.kill_samedi_par, r.kill_samedi_par),
             rituel_choix = coalesce(k.rituel_choix, r.rituel_choix),
             rituel_lundi = coalesce(k.rituel_lundi, r.rituel_lundi),
             maj_at = now(),
             journal = k.journal || jsonb_build_object('at', now(), 'par', 'os', 'action', 'fusion_posteur', 'depuis', r.id, 'categorie', r.categorie)
       where k.id = v_garde.id;
      update public.problemes_sources s set probleme_id = v_garde.id where s.probleme_id = r.id;
      update public.problemes
         set statut = 'ferme_auto', ferme_at = now(), maj_at = now(),
             ferme_raison = 'fusionné dans la carte du posteur (' || left(v_garde.id::text, 8) || ')',
             journal = journal || jsonb_build_object('at', now(), 'par', 'os', 'action', 'fusionne_dans', 'vers', v_garde.id)
       where id = r.id;
      n := n + 1;
      v_detail := v_detail || jsonb_build_object('garde', v_garde.id, 'garde_categorie', v_garde.categorie, 'ferme', r.id, 'categorie', r.categorie);
    end loop;
  end loop;
  return jsonb_build_object('fusionnes', n, 'detail', v_detail);
end;
$$;
revoke all on function public.problemes_fusionner_par_posteur() from public, anon;
grant execute on function public.problemes_fusionner_par_posteur() to authenticated;

-- Le sujet principal est réglé : le suivant prend sa place ; sans autre sujet (ou p_tout), la carte se ferme.
create or replace function public.probleme_fermer_sujet(p_id uuid, p_raison text, p_tout boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.problemes;
  s jsonb;
begin
  select * into p from public.problemes where id = p_id for update;
  if not found or p.statut <> 'ouvert' then return; end if;
  if p_tout or jsonb_array_length(p.sujets) = 0 then
    update public.problemes set statut = 'ferme_auto', ferme_raison = p_raison, ferme_at = now(), maj_at = now(),
           journal = journal || jsonb_build_object('at', now(), 'par', 'os', 'action', 'fermer_auto', 'raison', p_raison)
     where id = p_id;
    return;
  end if;
  s := p.sujets->0;
  -- Une autre carte ouverte du même groupe avec cette catégorie (ancienne donnée) : on garde la sienne.
  if exists (select 1 from public.problemes x where x.cle_groupe = p.cle_groupe and x.categorie = s->>'categorie'
              and x.statut = 'ouvert' and x.id <> p.id) then
    update public.problemes set sujets = sujets - 0 where id = p_id;
    return;
  end if;
  update public.problemes
     set categorie = s->>'categorie',
         resume = coalesce(s->>'resume', resume),
         niveau = coalesce(s->>'niveau', public.probleme_niveau(s->>'categorie')), niveau_force = false,
         diagnostic = s->>'diagnostic', diagnostic_par = s->>'diagnostic_par',
         proposition_action = s->>'proposition_action', proposition_reponse = s->>'proposition_reponse',
         canal_reponse = s->>'canal_reponse', propose_par = s->>'propose_par',
         question = s->>'question', options = s->'options',
         sujets = sujets - 0, maj_at = now(),
         journal = journal || jsonb_build_object('at', now(), 'par', 'os', 'action', 'sujet_regle', 'categorie', p.categorie,
                                                 'raison', p_raison, 'suivant', s->>'categorie')
   where id = p_id;
end;
$$;
revoke all on function public.probleme_fermer_sujet(uuid, text, boolean) from public, anon, authenticated;

-- Le recalcul ferme un sujet (pas toute la carte), sauf posteur désactivé.
do $p$
declare
  v_def text := pg_get_functiondef('public.problemes_recalculer()'::regprocedure);
  v_a text := $q$      update public.problemes set statut = 'ferme_auto', ferme_raison = v_raison, ferme_at = now(), maj_at = now(),
             journal = journal || jsonb_build_object('at', now(), 'par', 'os', 'action', 'fermer_auto', 'raison', v_raison)
       where id = r.id;$q$;
begin
  if position(v_a in v_def) = 0 then raise exception '0534 : problemes_recalculer ne correspond pas'; end if;
  execute replace(v_def, v_a, $q$      -- 0534 : une carte par posteur : le sujet suivant prend la place ; tout se ferme si le posteur est désactivé.
      perform public.probleme_fermer_sujet(r.id, v_raison, v_raison like 'posteur désactivé%');$q$);
end;
$p$;

-- L'onglet d'une carte.
create or replace function public.probleme_onglet(p public.problemes)
returns text
language sql
stable
as $$
  with cats as (
    select p.categorie as c, p.proposition_action as a, p.question as q
    union all
    select s->>'categorie', s->>'proposition_action', s->>'question' from jsonb_array_elements(p.sujets) s
  )
  select case
    when exists (select 1 from cats where c in ('paie', 'kill_contrat', 'offre_hm_incorrecte', 'upwork_mauvais_compte', 'menace',
                                                'hors_plateforme', 'suspect', 'stop_doute', 'contrat_hm'))
      or coalesce(p.sujet, 'posteur') in ('hm', 'offre')
      or p.question is not null
      or coalesce(p.confiance, 1) < 0.8
      then 'urgent'
    when p.kill_samedi_lundi is not null or p.rituel_choix is not null
      or exists (select 1 from cats where a in ('kill', 'double', 'recreate', 'postpone', 'saturday')
                                       or c in ('stop', 'zero_post', 'low_views', 'demande_2e_compte', 'absence', 'retirer_slack', 'avis_upwork'))
      or (p.niveau = 'samedi' and p.categorie not in ('pas_poste_aujourdhui', 'question_bloquante', 'login', 'slack', 'tiktok_setup',
                                                       'bloque_etape', 'relance_echec', 'bug_dashboard', 'plainte', 'accueil', 'autre'))
      then 'samedi'
    else 'bots'
  end;
$$;

-- La liste : + sujets, confiance, onglet.
do $p$
declare
  v_def text := pg_get_functiondef('public.problemes_liste(text)'::regprocedure);
  v_a text := $q$'rituel_choix', p.rituel_choix, 'rituel_lundi', p.rituel_lundi,$q$;
begin
  if position(v_a in v_def) = 0 then raise exception '0534 : problemes_liste ne correspond pas'; end if;
  execute replace(v_def, v_a, v_a || $q$
             'sujets', p.sujets, 'confiance', p.confiance, 'onglet', public.probleme_onglet(p),$q$);
end;
$p$;

-- « lire » (bots) : + sujets et onglet.
do $p$
declare
  v_def text := pg_get_functiondef('public.probleme_bot_lire(text,uuid)'::regprocedure);
  v_a text := $q$'a_traiter', public.probleme_a_traiter(o.id),$q$;
begin
  if position(v_a in v_def) = 0 then raise exception '0534 : probleme_bot_lire ne correspond pas'; end if;
  execute replace(v_def, v_a, v_a || $q$
               'sujets', (select x.sujets from public.problemes x where x.id = o.id),
               'onglet', (select public.probleme_onglet(x) from public.problemes x where x.id = o.id),$q$);
end;
$p$;

notify pgrst, 'reload schema';
