-- 0680 : tout le contenu de l'ancien bot FAQ, visible et modifiable dans Support (Max, 12/11).
-- Rien n'est supprimé ni fusionné : chaque contenu reste dans sa table, Support le montre et
-- l'écrit là où il est. Le bot Help lit exactement ce que Support montre.
--   Consignes  ← support_consignes + les 15 regles_bots (on/off, historique, retour arrière).
--   Catalogue  ← reponses_officielles + chatbot_contexte (27) + faq_entrees/faq_reponses/faq_situations
--                (on/off, catégorie, Upwork/Ruul/tous) + une liste « À trier » (doublons et
--                contradictions, Max choisit ; rien n'est éteint sans son clic).
--   Documents  ← support_documents (nouveau : « Comment fonctionne Vik Studios » et ceux que Max
--                ajoute) + guides_notion (Poster/HM Guide recopiés de Notion) + documents (8).
--   Exemples   ← exemples_bots + bots_apprentissage (lecture seule).
-- Additif : colonnes neuves (valeurs par défaut), tables neuves, fonctions.

-- 1. Colonnes on/off, plateforme, catégorie ---------------------------------------
alter table public.chatbot_contexte add column if not exists actif boolean not null default true;
alter table public.chatbot_contexte add column if not exists portee text not null default 'tous';
alter table public.chatbot_contexte add column if not exists categorie text;
alter table public.faq_entrees add column if not exists categorie text;
alter table public.faq_reponses add column if not exists portee text not null default 'tous';
alter table public.guides_notion add column if not exists bot_actif boolean not null default true;
alter table public.documents add column if not exists bot_actif boolean not null default true;
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'chatbot_contexte_portee_check') then
    alter table public.chatbot_contexte add constraint chatbot_contexte_portee_check check (portee in ('tous', 'upwork', 'ruul'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'faq_reponses_portee_check') then
    alter table public.faq_reponses add constraint faq_reponses_portee_check check (portee in ('tous', 'upwork', 'ruul'));
  end if;
end
$c$;

-- Valeurs de départ des colonnes neuves : une réponse qui parle d'Upwork ou de milestone est pour Upwork.
update public.faq_reponses set portee = 'upwork' where portee = 'tous' and texte ~* '(upwork|milestone)';
update public.faq_entrees set categorie = case cle
    when 'paie' then 'paiement' when 'milestone' then 'paiement' when 'contrat_fini' then 'arret'
    when 'warmup' then 'tiktok' when 'tiktok_follow_bloque' then 'tiktok' else 'posting' end
 where categorie is null;

-- 2. Historique commun (catalogue hors réponses officielles, documents) ------------
create table if not exists public.support_contenu_historique (
  id     uuid primary key default gen_random_uuid(),
  source text not null,
  ref    text not null,
  avant  jsonb,
  apres  jsonb,
  par    uuid,
  at     timestamptz not null default now()
);
alter table public.support_contenu_historique enable row level security;
revoke all on public.support_contenu_historique from anon;
grant select on public.support_contenu_historique to authenticated;

-- 3. Documents du bot --------------------------------------------------------------
create table if not exists public.support_documents (
  id       uuid primary key default gen_random_uuid(),
  titre    text not null,
  contenu  text not null default '',
  audience text not null default 'poster' check (audience in ('poster', 'hm', 'tous')),
  actif    boolean not null default true,
  ordre    integer not null default 100,
  cree_at  timestamptz not null default now(),
  cree_par uuid,
  maj_at   timestamptz not null default now(),
  maj_par  uuid
);
alter table public.support_documents enable row level security;
revoke all on public.support_documents from anon;
grant select on public.support_documents to authenticated;

-- 4. À trier -------------------------------------------------------------------------
create table if not exists public.support_a_trier (
  id          uuid primary key default gen_random_uuid(),
  sujet       text not null,
  type        text not null check (type in ('doublon', 'contradiction')),
  raison      text not null,
  elements    jsonb not null default '[]'::jsonb,
  statut      text not null default 'a_trier' check (statut in ('a_trier', 'tranche')),
  garder      jsonb,
  tranche_at  timestamptz,
  tranche_par uuid,
  cree_at     timestamptz not null default now()
);
alter table public.support_a_trier enable row level security;
revoke all on public.support_a_trier from anon;
grant select on public.support_a_trier to authenticated;

do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'support_contenu_historique' and policyname = 'support_contenu_historique_admin') then
    create policy support_contenu_historique_admin on public.support_contenu_historique for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'support_documents' and policyname = 'support_documents_admin') then
    create policy support_documents_admin on public.support_documents for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'support_a_trier' and policyname = 'support_a_trier_admin') then
    create policy support_a_trier_admin on public.support_a_trier for select to authenticated using (public.is_admin());
  end if;
end
$p$;

-- 5. Consignes : support_consignes + regles_bots ------------------------------------
/* Le journal des regles_bots va dans l'historique des consignes, au même format (texte, actif). */
create or replace function public.regles_bots_journal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.support_consignes_historique (consigne_id, avant, apres, par)
  values (new.id,
          case when tg_op = 'UPDATE' then jsonb_build_object('texte', old.regle, 'actif', old.active) end,
          jsonb_build_object('texte', new.regle, 'actif', new.active), auth.uid());
  return new;
end;
$$;
revoke execute on function public.regles_bots_journal() from public, anon, authenticated;
create or replace trigger regles_bots_journal
  after insert or update of regle, active on public.regles_bots
  for each row execute function public.regles_bots_journal();

create or replace function public.support_consignes_liste()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(x order by x->>'source', x->>'cree_at'), '[]'::jsonb) from (
    select jsonb_build_object('id', c.id, 'texte', c.texte, 'actif', c.actif, 'maj_at', c.maj_at, 'cree_at', c.cree_at,
                              'source', 'max', 'exemple', null) x
      from public.support_consignes c
    union all
    select jsonb_build_object('id', r.id, 'texte', r.regle, 'actif', r.active, 'maj_at', coalesce(r.maj_at, r.created_at),
                              'cree_at', r.created_at, 'source', 'regles_bots', 'exemple', r.exemple)
      from public.regles_bots r
  ) t(x)
  where public.is_admin();
$$;
revoke execute on function public.support_consignes_liste() from public, anon;
grant execute on function public.support_consignes_liste() to authenticated;

/* Ajoute (p_id null) ou modifie une consigne ; une ligne de regles_bots est modifiée dans regles_bots. */
create or replace function public.support_consigne_enregistrer(p_id uuid, p_texte text, p_actif boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin_strict() then raise exception 'réservé aux admins' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_texte, ''))) < 3 then raise exception 'consigne vide'; end if;
  if p_id is not null and exists (select 1 from public.regles_bots where id = p_id) then
    update public.regles_bots set regle = btrim(p_texte), active = coalesce(p_actif, active), maj_at = now() where id = p_id;
    return p_id;
  end if;
  if p_id is null then
    insert into public.support_consignes (texte, actif, cree_par, maj_par)
    values (btrim(p_texte), coalesce(p_actif, true), auth.uid(), auth.uid())
    returning id into v_id;
  else
    update public.support_consignes
       set texte = btrim(p_texte), actif = coalesce(p_actif, actif), maj_at = now(), maj_par = auth.uid()
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'consigne introuvable'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.support_consigne_restaurer(p_historique uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h public.support_consignes_historique%rowtype;
begin
  if not public.is_admin_strict() then raise exception 'réservé aux admins' using errcode = '42501'; end if;
  select * into h from public.support_consignes_historique where id = p_historique;
  if not found or h.avant is null then raise exception 'rien à restaurer'; end if;
  if exists (select 1 from public.regles_bots where id = h.consigne_id) then
    update public.regles_bots
       set regle = coalesce(h.avant->>'texte', h.avant->>'regle', regle),
           active = coalesce((h.avant->>'actif')::boolean, (h.avant->>'active')::boolean, active), maj_at = now()
     where id = h.consigne_id;
    return;
  end if;
  update public.support_consignes
     set texte = h.avant->>'texte', actif = coalesce((h.avant->>'actif')::boolean, true), maj_at = now(), maj_par = auth.uid()
   where id = h.consigne_id;
end;
$$;
revoke execute on function public.support_consigne_enregistrer(uuid, text, boolean) from public, anon;
revoke execute on function public.support_consigne_restaurer(uuid) from public, anon;
grant execute on function public.support_consigne_enregistrer(uuid, text, boolean) to authenticated;
grant execute on function public.support_consigne_restaurer(uuid) to authenticated;

-- 6. Catalogue : les réponses du bot FAQ hors réponses officielles -------------------
/* chatbot_contexte (source ctx) et faq (source faq : question type × situation). */
create or replace function public.support_catalogue_autres()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select jsonb_build_object('source', 'ctx', 'id', c.id, 'question', c.titre, 'reponse', c.contenu,
                              'categorie', c.categorie, 'portee', c.portee, 'actif', c.actif, 'audience', c.audience,
                              'situation', null, 'maj_at', c.updated_at) x
      from public.chatbot_contexte c
    union all
    select jsonb_build_object('source', 'faq', 'id', r.id, 'question', e.question, 'reponse', r.texte,
                              'categorie', e.categorie, 'portee', r.portee, 'actif', r.actif and e.actif, 'audience', 'poster',
                              'situation', coalesce(s.libelle, 'Toutes les situations'), 'situation_cle', r.situation,
                              'entree_id', e.id, 'maj_at', r.updated_at)
      from public.faq_reponses r
      join public.faq_entrees e on e.id = r.entree_id
      left join public.faq_situations s on s.cle = r.situation
  ) t(x)
  where public.is_admin();
$$;
revoke execute on function public.support_catalogue_autres() from public, anon;
grant execute on function public.support_catalogue_autres() to authenticated;

create or replace function public.support_catalogue_enregistrer(
  p_source text, p_id uuid, p_question text, p_reponse text, p_categorie text, p_portee text, p_actif boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avant jsonb;
  v_apres jsonb;
begin
  if not public.is_admin_strict() then raise exception 'réservé aux admins' using errcode = '42501'; end if;
  if coalesce(p_portee, 'tous') not in ('tous', 'upwork', 'ruul') then raise exception 'plateforme inconnue'; end if;
  if length(btrim(coalesce(p_reponse, ''))) < 2 then raise exception 'réponse vide'; end if;
  if p_source = 'ctx' then
    select to_jsonb(c) into v_avant from public.chatbot_contexte c where id = p_id;
    if v_avant is null then raise exception 'réponse introuvable'; end if;
    update public.chatbot_contexte
       set titre = coalesce(nullif(btrim(p_question), ''), titre), contenu = p_reponse,
           categorie = nullif(btrim(coalesce(p_categorie, '')), ''), portee = coalesce(p_portee, portee),
           actif = coalesce(p_actif, actif), updated_at = now()
     where id = p_id
    returning to_jsonb(chatbot_contexte.*) into v_apres;
  elsif p_source = 'faq' then
    select to_jsonb(r) || jsonb_build_object('question', e.question, 'categorie', e.categorie) into v_avant
      from public.faq_reponses r join public.faq_entrees e on e.id = r.entree_id where r.id = p_id;
    if v_avant is null then raise exception 'réponse introuvable'; end if;
    update public.faq_reponses
       set texte = p_reponse, portee = coalesce(p_portee, portee), actif = coalesce(p_actif, actif),
           maj_par = auth.uid(), updated_at = now()
     where id = p_id;
    -- La question type et sa catégorie sont communes à toutes les situations de l'entrée.
    update public.faq_entrees e
       set question = coalesce(nullif(btrim(p_question), ''), e.question),
           categorie = nullif(btrim(coalesce(p_categorie, '')), ''), maj_par = auth.uid(), updated_at = now()
      from public.faq_reponses r
     where r.id = p_id and e.id = r.entree_id;
    select to_jsonb(r) || jsonb_build_object('question', e.question, 'categorie', e.categorie) into v_apres
      from public.faq_reponses r join public.faq_entrees e on e.id = r.entree_id where r.id = p_id;
  else
    raise exception 'source inconnue : %', p_source;
  end if;
  insert into public.support_contenu_historique (source, ref, avant, apres, par)
  values (p_source, p_id::text, v_avant, v_apres, auth.uid());
end;
$$;
revoke execute on function public.support_catalogue_enregistrer(text, uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.support_catalogue_enregistrer(text, uuid, text, text, text, text, boolean) to authenticated;

/* À trier : Max garde ce qu'il coche, le reste est éteint (actif = false), jamais effacé. */
create or replace function public.support_a_trier_trancher(p_id uuid, p_garder jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.support_a_trier%rowtype;
  el jsonb;
  v_garder jsonb := coalesce(p_garder, '[]'::jsonb);
begin
  if not public.is_admin_strict() then raise exception 'réservé aux admins' using errcode = '42501'; end if;
  select * into t from public.support_a_trier where id = p_id for update;
  if not found then raise exception 'introuvable'; end if;
  for el in select * from jsonb_array_elements(t.elements) loop
    if v_garder @> jsonb_build_array(el->>'id') then continue; end if;
    if el->>'source' = 'ro' then
      update public.reponses_officielles set actif = false, maj_at = now() where id = (el->>'id')::uuid and actif;
    elsif el->>'source' = 'ctx' then
      update public.chatbot_contexte set actif = false, updated_at = now() where id = (el->>'id')::uuid and actif;
    elsif el->>'source' = 'faq' then
      update public.faq_reponses set actif = false, updated_at = now() where id = (el->>'id')::uuid and actif;
    end if;
    insert into public.support_contenu_historique (source, ref, avant, apres, par)
    values (el->>'source', el->>'id', jsonb_build_object('actif', true), jsonb_build_object('actif', false, 'a_trier', p_id), auth.uid());
  end loop;
  update public.support_a_trier set statut = 'tranche', garder = v_garder, tranche_at = now(), tranche_par = auth.uid() where id = p_id;
end;
$$;
revoke execute on function public.support_a_trier_trancher(uuid, jsonb) from public, anon;
grant execute on function public.support_a_trier_trancher(uuid, jsonb) to authenticated;

-- 7. Documents -----------------------------------------------------------------------
create or replace function public.support_documents_liste()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(x order by (x->>'rang')::int, x->>'ordre_txt'), '[]'::jsonb) from (
    select jsonb_build_object('source', 'support', 'id', d.id::text, 'titre', d.titre, 'contenu', d.contenu,
                              'audience', d.audience, 'actif', d.actif, 'maj_at', d.maj_at, 'rang', 0,
                              'ordre_txt', lpad(d.ordre::text, 6, '0')) x
      from public.support_documents d
    union all
    select jsonb_build_object('source', 'notion', 'id', g.page_id, 'titre', coalesce(g.chemin, g.titre), 'contenu', coalesce(g.texte, ''),
                              'audience', case when g.guide = 'poster' then 'poster' else 'hm' end, 'actif', g.bot_actif,
                              'maj_at', g.copie_at, 'url', g.url, 'rang', case when g.guide = 'poster' then 1 else 3 end,
                              'ordre_txt', lpad(coalesce(g.ordre, 0)::text, 6, '0'))
      from public.guides_notion g
    union all
    select jsonb_build_object('source', 'documents', 'id', d.id::text, 'titre', d.titre, 'contenu', coalesce(d.contenu, ''),
                              'audience', case when d.audience = 'poster' then 'poster' else 'hm' end, 'actif', d.bot_actif,
                              'maj_at', d.updated_at, 'cle', d.cle, 'rang', 2, 'ordre_txt', lpad(coalesce(d.ordre, 0)::text, 6, '0'))
      from public.documents d
  ) t(x)
  where public.is_admin();
$$;
revoke execute on function public.support_documents_liste() from public, anon;
grant execute on function public.support_documents_liste() to authenticated;

/* Ajoute (source support, p_id null) ou modifie un document là où il vit. Renvoie son id. */
create or replace function public.support_document_enregistrer(
  p_source text, p_id text, p_titre text, p_contenu text, p_audience text, p_actif boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avant jsonb;
  v_apres jsonb;
  v_id text := p_id;
begin
  if not public.is_admin_strict() then raise exception 'réservé aux admins' using errcode = '42501'; end if;
  if p_source = 'support' then
    if coalesce(p_audience, 'poster') not in ('poster', 'hm', 'tous') then raise exception 'audience inconnue'; end if;
    if length(btrim(coalesce(p_titre, ''))) < 2 then raise exception 'titre vide'; end if;
    if p_id is null then
      insert into public.support_documents (titre, contenu, audience, actif, cree_par, maj_par)
      values (btrim(p_titre), coalesce(p_contenu, ''), coalesce(p_audience, 'poster'), coalesce(p_actif, true), auth.uid(), auth.uid())
      returning id::text, to_jsonb(support_documents.*) into v_id, v_apres;
    else
      select to_jsonb(d) into v_avant from public.support_documents d where id = p_id::uuid;
      if v_avant is null then raise exception 'document introuvable'; end if;
      update public.support_documents
         set titre = btrim(p_titre), contenu = coalesce(p_contenu, contenu), audience = coalesce(p_audience, audience),
             actif = coalesce(p_actif, actif), maj_at = now(), maj_par = auth.uid()
       where id = p_id::uuid
      returning to_jsonb(support_documents.*) into v_apres;
    end if;
  elsif p_source = 'notion' then
    select jsonb_build_object('texte', texte, 'bot_actif', bot_actif) into v_avant from public.guides_notion where page_id = p_id;
    if v_avant is null then raise exception 'page introuvable'; end if;
    update public.guides_notion set texte = coalesce(p_contenu, texte), bot_actif = coalesce(p_actif, bot_actif) where page_id = p_id
    returning jsonb_build_object('texte', texte, 'bot_actif', bot_actif) into v_apres;
  elsif p_source = 'documents' then
    select jsonb_build_object('titre', titre, 'contenu', contenu, 'bot_actif', bot_actif) into v_avant from public.documents where id = p_id::uuid;
    if v_avant is null then raise exception 'document introuvable'; end if;
    update public.documents
       set titre = coalesce(nullif(btrim(p_titre), ''), titre), contenu = coalesce(p_contenu, contenu),
           bot_actif = coalesce(p_actif, bot_actif), updated_at = now()
     where id = p_id::uuid
    returning jsonb_build_object('titre', titre, 'contenu', contenu, 'bot_actif', bot_actif) into v_apres;
  else
    raise exception 'source inconnue : %', p_source;
  end if;
  insert into public.support_contenu_historique (source, ref, avant, apres, par)
  values ('doc_' || p_source, v_id, v_avant, v_apres, auth.uid());
  return v_id;
end;
$$;
revoke execute on function public.support_document_enregistrer(text, text, text, text, text, boolean) from public, anon;
grant execute on function public.support_document_enregistrer(text, text, text, text, text, boolean) to authenticated;

-- 8. Exemples (lecture seule) ----------------------------------------------------------
create or replace function public.support_exemples()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'exemples', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'bot', e.bot, 'categorie', e.categorie, 'situation', e.situation,
                                                              'message', e.message_posteur, 'decision', e.bonne_decision, 'reponse', e.bonne_reponse,
                                                              'pourquoi', e.pourquoi, 'source', e.source, 'actif', e.actif, 'at', e.cree_at)
                                           order by e.cree_at desc) from public.exemples_bots e), '[]'::jsonb),
    'apprentissage', coalesce((select jsonb_agg(jsonb_build_object('bot', a.bot, 'type', a.type, 'at', a.at, 'regle', a.regle, 'exemple', a.exemple,
                                                                   'verdict', a.verdict, 'raison', a.raison, 'diagnostic', a.diagnostic_du_bot,
                                                                   'action', a.action_du_bot, 'categorie', a.categorie)
                                                order by a.at desc) from public.bots_apprentissage a), '[]'::jsonb))
  where public.is_admin();
$$;
revoke execute on function public.support_exemples() from public, anon;
grant execute on function public.support_exemples() to authenticated;

-- 9. Le document « Comment fonctionne Vik Studios » (texte de Max, 12/11) --------------
insert into public.support_documents (titre, contenu, audience, ordre)
select 'Comment fonctionne Vik Studios', $doc$Deux plateformes, jamais mélangées
- Upwork : paie par milestone chaque semaine.
- Ruul : paie chaque lundi pour la semaine postée (lundi → dimanche). 1re paie Ruul le 23/11.
- On ne propose jamais Ruul à un posteur Upwork, ni Upwork à un posteur Ruul.

Tarifs
- Tarif fixe par semaine selon la zone : A 14 $ / B 10 $ / C 7 $.
- On ne dit jamais aux posteurs que les tarifs varient selon les pays.

Parcours Ruul
Candidature → accepté → contrat signé (avant samedi 20h) → compte OS → connexion, TikTok, warm-up, Slack → Max l'ajoute dans Ruul → il crée son compte Ruul (identité + moyen de paiement) → « It's done » → il poste 2 slideshows par jour → payé le lundi.

Parcours Upwork
Contrat → welcome → mêmes étapes (connexion, TikTok, warm-up, Slack) → milestone hebdo financé par Max.

Slack
- #welcome : annonces.
- #posting-help : questions sur les posts.
- #ruul-posters et #upwork-posters : le salon de sa plateforme.
- Jamais de montant ni de question perso en public : on renvoie vers Help.

Support
- Help sur le dashboard = le support.
- Escalade : technique → #a-os-tickets (circuit actuel, sans rien changer) ; non résolu → Adrien ; paiement vérifié non reçu, double paie, fraude, litige → Max.

Arrêt
- STOP par message ou par le bouton.
- Les kills se font seulement le samedi.

Pays fermés
- Portugal, Indonésie.

Ton
- Ne jamais parler de bot, d'IA ou d'automatisation.
- Signer « the Vik Studios team ».$doc$, 'poster', 10
where not exists (select 1 from public.support_documents where titre = 'Comment fonctionne Vik Studios');

-- 10. À trier : doublons et contradictions repérés le 12/11 ---------------------------
-- Les éléments : {source: ro (réponse officielle) | ctx (réponse du bot FAQ) | faq (question × situation), id}.
create or replace function pg_temp.el(p_source text, p_prefixe text)
returns jsonb language sql as $$
  select case p_source
    when 'ro' then (select jsonb_build_object('source', 'ro', 'id', id) from public.reponses_officielles where id::text like p_prefixe || '%' limit 1)
    when 'ctx' then (select jsonb_build_object('source', 'ctx', 'id', id) from public.chatbot_contexte where id::text like p_prefixe || '%' limit 1)
  end;
$$;
create or replace function pg_temp.faq(p_cle text)
returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('source', 'faq', 'id', r.id) order by r.situation nulls first), '[]'::jsonb)
    from public.faq_reponses r join public.faq_entrees e on e.id = r.entree_id where e.cle = p_cle;
$$;

insert into public.support_a_trier (sujet, type, raison, elements)
select v.sujet, v.type, v.raison, (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(v.elements) x where x <> 'null'::jsonb)
  from (values
  ('Lisibilité du texte sur les slides', 'doublon',
   'Quatre réponses disent la même chose (texte lisible d''abord, couleur et police adaptables).',
   jsonb_build_array(pg_temp.el('ro', '8946b1bc'), pg_temp.el('ctx', '4336d8c9'), pg_temp.el('ctx', '0793163d'), pg_temp.el('ctx', 'aacf026f'))),
  ('Messages privés et commentaires', 'contradiction',
   'La réponse officielle dit de répondre avec le lien de l''appli (taap.it) ; d''autres disent « le lien donné par ton manager », deux disent seulement « Do not answer ».',
   jsonb_build_array(pg_temp.el('ro', '851900db'), pg_temp.el('ctx', '04cd1846'), pg_temp.el('ctx', 'd3ab6f7f'), pg_temp.el('ctx', '753f148b'),
                     pg_temp.el('ctx', '68b8c715'), pg_temp.el('ctx', '9783c3ce'))),
  ('Lien de l''appli', 'doublon',
   'La réponse officielle donne les 3 liens (Micabo, Sophia, UnSwipe) ; l''autre seulement celui de Sophia.',
   jsonb_build_array(pg_temp.el('ro', 'cebd5278'), pg_temp.el('ctx', '5274014a'))),
  ('Son des posts', 'contradiction',
   'Si le son n''est pas sur TikTok : « un son tendance similaire » (officielle) contre « n''importe quel son qui va bien » (bot FAQ).',
   jsonb_build_array(pg_temp.el('ro', 'bd96f480'), pg_temp.el('ctx', '3cf8d64f'))),
  ('Mention publicité', 'doublon',
   'Même règle des deux côtés : pas de mention pub.',
   jsonb_build_array(pg_temp.el('ro', '7420227e'), pg_temp.el('ctx', 'a46adb4f'))),
  ('Parrainage : bonus et paie de l''ami', 'contradiction',
   'Une réponse du bot FAQ dit que le bonus « peut monter à 100 $ » (officielle : 10 $) ; une autre explique que l''ami est payé par Ruul, alors que la consigne dit de ne jamais parler de la paie de l''ami.',
   jsonb_build_array(pg_temp.el('ro', 'd728d6cb'), pg_temp.el('ctx', 'fe826b99'), pg_temp.el('ctx', '2d548b9f'), pg_temp.el('ctx', '716da970'),
                     pg_temp.el('ctx', '944fdfff'))),
  ('Changer son @ TikTok', 'contradiction',
   'Officielle : changer le @ dans TikTok pour qu''il colle au dashboard. Bot FAQ : « tu peux le changer dans l''OS ».',
   jsonb_build_array(pg_temp.el('ro', 'bc8b4d0b'), pg_temp.el('ctx', 'e0bdb47b'), pg_temp.el('ctx', 'a16b6473'))),
  ('« Pas de post aujourd''hui »', 'contradiction',
   'Le bot FAQ répond toujours « on répare, reviens plus tard » ; la FAQ par situation dit « c''est normal, tu commences lundi » selon où en est la personne.',
   jsonb_build_array(pg_temp.el('ctx', '1a91df62')) || pg_temp.faq('rien_a_poster')),
  ('Feedback des posts', 'contradiction',
   'Une réponse du bot FAQ dit « The bot may make mistakes » : les consignes interdisent de parler de bot aux posteurs.',
   jsonb_build_array(pg_temp.el('ctx', '52b02303'), pg_temp.el('ro', '49c4be05'))),
  ('Fin de collaboration', 'doublon',
   'Les réponses officielles (Upwork, Ruul) et la FAQ « Why was my contract ended? » disent la même chose.',
   jsonb_build_array(pg_temp.el('ro', '9504e4b3'), pg_temp.el('ro', '31548487')) || pg_temp.faq('contrat_fini')),
  ('Follows bloqués sur TikTok', 'doublon',
   'Réponse officielle et FAQ disent la même chose (comptes neufs limités, aller doucement).',
   jsonb_build_array(pg_temp.el('ro', 'dbcdd0b5')) || pg_temp.faq('tiktok_follow_bloque'))
) as v(sujet, type, raison, elements)
where not exists (select 1 from public.support_a_trier);
