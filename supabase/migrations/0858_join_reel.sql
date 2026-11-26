-- 0858 : Join « en réel » (25/11, Max : « ne passe pas encore sur ce système, mais bientôt »). Additif seulement.
--
-- 1. Réglage `join_reel` : un drapeau par étape d'après la signature, TOUS à false. Une étape n'est réelle que si son
--    drapeau est true ; sinon elle est simulée et journalisée (join_relances « simule », join_evenements « simule »).
--      compte_os  création du posteur dans l'OS (hub-posteurs creer_posteur), copie ruul_candidatures / posteur_contacts
--      acces      la bienvenue (email « Set my password » + WhatsApp welcome_start / account_ready si accord)
--      ruul       l'invitation Ruul (lien personnel de l'API Ruul POST /connect, sinon app.ruul.io/register), par email
--      rappels    les rappels de la checklist (J+1, J+3, vendredi avant le lundi, premier post…) ; Join devient alors
--                 la seule voix pour ces étapes (voir join_voix_posteurs)
--      whatsapp   les WhatsApp après la signature (bienvenue et rappels), seulement avec l'accord WhatsApp
--    Slack n'a pas de drapeau : rien n'est envoyé (le lien d'invitation est sur la page Join et dans la bienvenue,
--    l'OS relie le posteur à Slack par son email).
--    join_mode (test : emails aux testeurs seulement) et whatsapp_mode (test : numéros autorisés seulement) restent
--    des garde-fous en plus des drapeaux.
-- 2. join_etapes : la checklist gagne « contrat » et « premier_post » (CHECK élargi, jamais restreint).
-- 3. join_evenements : type « ruul_invitation » (CHECK élargi).
-- 4. join_relances.detail (jsonb) : ce qui serait parti (modèle, objet, raison de la simulation, horloge simulée).
-- 5. join_etat_os(uuid[]) : ce que l'OS sait de chaque posteur Join (checklist synchronisée), service seulement.
-- 6. join_doublons(uuid) : les doublons d'une candidature (email, téléphone, nom), lisibles, service seulement.
-- 7. join_voix_posteurs() : les posteurs créés par Join pour qui Join parle (join_reel.rappels = true) : le parcours
--    Ruul, les relances KYC (sauf identité refusée) et l'email d'invitation Slack de l'OS les sautent. Vide tant que
--    le drapeau est à false : rien ne change pour personne aujourd'hui.
--
-- Retour arrière : supprimer le réglage, les 3 fonctions et la colonne ; remettre les deux CHECK de 0840/0847.

-- 1.
insert into public.reglages (cle, valeur)
values ('join_reel', '{"compte_os": false, "acces": false, "ruul": false, "rappels": false, "whatsapp": false}'::jsonb)
on conflict (cle) do nothing;

-- 2. et 3.
do $c$
begin
  if exists (select 1 from pg_constraint where conname = 'join_etapes_etape_check') then
    alter table public.join_etapes drop constraint join_etapes_etape_check;
  end if;
  alter table public.join_etapes add constraint join_etapes_etape_check
    check (etape in ('tiktok', 'profil', 'warmup', 'slack', 'ruul', 'contrat', 'premier_post'));

  if exists (select 1 from pg_constraint where conname = 'join_evenements_type_check') then
    alter table public.join_evenements drop constraint join_evenements_type_check;
  end if;
  alter table public.join_evenements add constraint join_evenements_type_check check (type in (
    'visite', 'candidature', 'verifiee', 'acceptee', 'a_traiter', 'signee', 'connectee', 'tiktok_ok', 'warmup', 'slack',
    'premier_post', 'ruul_ready', 'simule', 'expiree', 'refusee', 'compte_os', 'reglage', 'ruul_invitation'));
end
$c$;

-- 4.
alter table public.join_relances add column if not exists detail jsonb;

-- 5. Ce que l'OS sait d'un posteur (lecture seule). tiktok : compte vu sur TikTok, déclaré, ou warm-up lancé (comme
--    ruul_mon_onboarding) ; slack : relié ou déclaré ; premier_post_at : le premier post publié (posts, sinon passages) ;
--    posts_prevus : des posts prévus depuis le lundi de départ ; email_jour : un email du parcours Ruul est parti
--    aujourd'hui (Paris) — la règle « jamais 2 emails le même jour » est partagée avec Join.
create or replace function public.join_etat_os(p_profiles uuid[])
returns table (
  profile_id uuid, is_active boolean, relances_stop_at timestamptz, cohorte_lundi date, premiere_connexion_at timestamptz,
  ruul_email text, ruul_onboarding text, ruul_ready_at timestamptz, ruul_retire_at timestamptz, ruul_jeton text,
  handle text, tiktok boolean, warmup_started_at timestamptz, slack boolean, premier_post_at timestamptz, posts_prevus boolean,
  arrete boolean, desinscrit boolean, paie_reportee boolean, email_jour boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select pr.id, pr.is_active, pr.relances_stop_at, pr.cohorte_lundi, coalesce(pr.premiere_connexion_at, u.last_sign_in_at),
         nullif(btrim(coalesce(pr.ruul_email, '')), ''), pr.ruul_onboarding, pr.ruul_ready_at, pr.ruul_retire_at, pr.ruul_jeton::text,
         c.handle_tiktok,
         coalesce(w.existe, false)
           or exists (select 1 from public.etape_declarations d where d.poster_id = pr.id and d.etape = 'tiktok' and d.statut <> 'refuse')
           or exists (select 1 from public.comptes x where x.poster_id = pr.id and x.warmup_started_at is not null),
         (select min(x.warmup_started_at) from public.comptes x where x.poster_id = pr.id),
         nullif(btrim(coalesce(pr.slack_user_id, '')), '') is not null
           or exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id and nullif(btrim(coalesce(h.slack_user_id, '')), '') is not null)
           or exists (select 1 from public.etape_declarations d where d.poster_id = pr.id and d.etape = 'slack' and d.statut <> 'refuse'),
         least(
           (select min(po.publie_at) from public.posts po join public.comptes x on x.id = po.compte_id
             where x.poster_id = pr.id and po.publie_at is not null and not coalesce(po.est_test, false)),
           (select min(pa.publie_at) from public.passages pa join public.comptes x on x.id = pa.compte_id
             where x.poster_id = pr.id and pa.publie_at is not null)),
         exists (select 1 from public.passages pa join public.comptes x on x.id = pa.compte_id
                  where x.poster_id = pr.id and x.is_active and not coalesce(pa.est_rappel, false) and pa.statut::text <> 'brouillon'
                    and pa.date_publication_prevue >= coalesce(pr.cohorte_lundi, current_date)
                    and pa.date_publication_prevue <= (now() at time zone 'Europe/Paris')::date),
         exists (select 1 from public.arrets a where a.poster_id = pr.id and a.annule_at is null)
           or exists (select 1 from public.ne_plus_contacter n where n.poster_id = pr.id and n.leve_at is null),
         exists (select 1 from public.ruul_candidatures rc where rc.os_profile_id = pr.id and rc.desinscrit_at is not null),
         exists (select 1 from public.ruul_paiements rp where rp.poster_id = pr.id and rp.statut = 'reporte'),
         exists (select 1 from public.ruul_parcours_envois e where e.poster_id = pr.id and e.ok and e.type <> 'carte_ruul'
                  and (e.envoye_at at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date)
    from public.profiles pr
    left join auth.users u on u.id = pr.id
    left join lateral (select x.id, x.handle_tiktok from public.comptes x where x.poster_id = pr.id and x.is_active
                        order by (coalesce(x.type_compte, 'perso') = 'perso') desc, x.created_at limit 1) c on true
    left join lateral (select r.existe from public.ckd_warmup_releves r where r.compte_id = c.id and r.existe is not null
                        order by r.releve_at desc limit 1) w on true
   where pr.id = any(p_profiles);
$$;
revoke all on function public.join_etat_os(uuid[]) from public, anon, authenticated;
grant execute on function public.join_etat_os(uuid[]) to service_role;

-- 6. Les doublons d'une candidature : même email, même téléphone ou même nom (minuscules, espaces réduits) dans une
--    autre candidature Join non expirée ni refusée (du même monde : test avec test, réel avec réel), une fiche de
--    l'OS (email, email perso, email Ruul ; nom d'un posteur), les contacts WhatsApp, le Hub et les candidatures du
--    site. La fiche déjà reliée à la candidature n'est pas un doublon.
create or replace function public.join_doublons(p_candidature uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select j.id, j.test, lower(btrim(j.email)) as email, j.whatsapp_e164 as tel, j.profile_id,
           regexp_replace(lower(btrim(coalesce(j.prenom, '') || ' ' || coalesce(j.nom, ''))), '\s+', ' ', 'g') as nom
      from public.join_candidatures j where j.id = p_candidature
  ),
  autres as (
    select j.* from public.join_candidatures j, c
     where j.id <> c.id and j.test = c.test and j.expire_at is null and coalesce(j.decision, '') <> 'refusee'
  )
  select coalesce(array_remove(array[
    case when exists (select 1 from autres a, c where lower(btrim(a.email)) = c.email)
         then 'doublon : email déjà dans une autre candidature Join' end,
    case when exists (select 1 from autres a, c where a.whatsapp_e164 = c.tel)
         then 'doublon : téléphone déjà dans une autre candidature Join' end,
    case when exists (select 1 from autres a, c where regexp_replace(lower(btrim(coalesce(a.prenom, '') || ' ' || coalesce(a.nom, ''))), '\s+', ' ', 'g') = c.nom)
         then 'doublon : même nom qu''une autre candidature Join' end,
    case when exists (select 1 from public.profiles p, c
                       where p.id is distinct from c.profile_id
                         and c.email in (lower(btrim(p.email)), lower(btrim(p.email_perso)), lower(btrim(p.ruul_email))))
         then 'doublon : email déjà sur une fiche de l''OS' end,
    case when exists (select 1 from public.profiles p, c
                       where p.id is distinct from c.profile_id
                         and regexp_replace(lower(btrim(coalesce(p.prenom, '') || ' ' || coalesce(p.nom, ''))), '\s+', ' ', 'g') = c.nom
                         and exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'poster'))
         then 'doublon : même nom qu''un posteur de l''OS' end,
    case when exists (select 1 from public.posteur_contacts pc, c where pc.whatsapp_e164 = c.tel and pc.poster_id is distinct from c.profile_id)
         then 'doublon : téléphone déjà connu (contacts WhatsApp de l''OS)' end,
    case when exists (select 1 from public.hub_posteurs h, c where lower(btrim(h.email_perso)) = c.email and h.hub_id <> c.id::text)
         then 'doublon : email déjà dans le Hub' end,
    case when exists (select 1 from public.ruul_candidatures rc, c where lower(btrim(rc.email)) = c.email and rc.site_id <> c.id)
         then 'doublon : email déjà candidat sur le site' end,
    case when exists (select 1 from public.ruul_candidatures rc, c
                       where rc.site_id <> c.id and regexp_replace(lower(btrim(coalesce(rc.nom, ''))), '\s+', ' ', 'g') = c.nom)
         then 'doublon : même nom qu''une candidature du site' end
  ], null), '{}'::text[])
    from c;
$$;
revoke all on function public.join_doublons(uuid) from public, anon, authenticated;
grant execute on function public.join_doublons(uuid) to service_role;

-- 7. Les posteurs pour qui Join est la seule voix sur les étapes de sa checklist : créés par Join (ruul_candidatures
--    « join_signed »), et seulement quand les rappels de Join sont réels (join_reel.rappels = true).
create or replace function public.join_voix_posteurs()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct rc.os_profile_id
    from public.ruul_candidatures rc
   where rc.statut_site = 'join_signed' and rc.os_profile_id is not null
     and coalesce((select (r.valeur ->> 'rappels') = 'true' from public.reglages r where r.cle = 'join_reel'), false);
$$;
revoke all on function public.join_voix_posteurs() from public, anon, authenticated;
grant execute on function public.join_voix_posteurs() to service_role;

notify pgrst, 'reload schema';
