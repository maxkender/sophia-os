-- 0559 : Doubler = proposer, avec l'accord du posteur (7/11) + mémoire des samedis.
--
-- A. L'offre (posteur_messages type 'double', 0382) :
--    * visible tout de suite, 72 h pour répondre (plus « mercredi 23 h 59 ») ;
--    * le texte de Max, avec le tarif de la semaine et le double ;
--    * un posteur qui a demandé un 2e compte (carte demande_2e_compte) : la
--      fonction ckd accepte pour lui, crée le compte et la fonction upwork lui
--      envoie la confirmation (double_demande) ;
--    * 24 h sans ouvrir son dashboard : un message Upwork (compte de Max), une
--      seule fois (fonction upwork, action doubles_messages, cron horaire) ;
--    * le 2e compte poste le lendemain de son warm-up (plus le lundi J+9).
-- C. La mémoire des samedis :
--    * propositions (ckd_calculer) : Doubler seulement après 2 semaines
--      complètes, si le pays rapporte au moins 50 par compte sur 4 semaines,
--      et pas dans les 4 semaines après un refus ou une offre expirée ;
--      « Gardé » n'empêche plus le Kill quand il n'y a eu aucun post avec lien
--      depuis ; « Pas maintenant » n'empêche plus Doubler ;
--    * samedi_memoire(jour) : la décision du samedi précédent et ce qui s'est
--      passé depuis, par posteur (C1) + l'alerte 2e compte sous 50 % (C2) ;
--    * samedi_bilan(jour) : « Ce qu'a donné samedi dernier » (C3) ;
--    * samedi_cahier(jour) : les résultats dans le cahier du Control Bot (C4),
--      le dimanche.
-- Additif : fonctions remplacées, un réglage, deux crons.

-- A1. Le texte de l'offre (anglais, la page le traduit pour un dashboard en français).
update public.reglages
   set valeur = to_jsonb('Your work these past weeks has been great. Would you like to manage a second TikTok account? Same work (2 posts a day on it too), and your weekly pay goes from ${tarif} to ${tarif2}.'::text)
 where cle = 'double_popup_texte';

-- A2. Le tarif d'une semaine (un compte) du posteur connecté (pop-up).
create or replace function public.mon_tarif_semaine()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.paie_tarif_contrat(auth.uid()), public.paie_tarif_zone(auth.uid()));
$$;
revoke execute on function public.mon_tarif_semaine() from public, anon;
grant execute on function public.mon_tarif_semaine() to authenticated;

-- A3. L'offre : visible maintenant, 72 h, le tarif dans le texte.
create or replace function public.double_offrir(p_id uuid)
returns public.posteur_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.ckd_propositions%rowtype;
  v_prenom text;
  v_tarif numeric;
  v_texte text;
  m public.posteur_messages;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'double_offrir : réservé à la fonction ckd';
  end if;
  select * into p from public.ckd_propositions where id = p_id;
  if not found or p.decision is distinct from 'doubler' then
    raise exception 'double_offrir : proposition introuvable ou pas en Doubler';
  end if;
  select prenom into v_prenom from public.profiles where id = p.poster_id;
  v_tarif := coalesce(public.paie_tarif_contrat(p.poster_id), public.paie_tarif_zone(p.poster_id));
  v_texte := public.posteur_texte('double_popup_texte', v_prenom);
  v_texte := replace(replace(v_texte, '${tarif2}', coalesce('$' || trim_scale(v_tarif * 2)::text, 'twice that')),
                     '${tarif}', coalesce('$' || trim_scale(v_tarif)::text, 'one account''s rate'));

  insert into public.posteur_messages (poster_id, compte_id, proposition_id, semaine, type, texte, visible_de, expire_at)
  values (p.poster_id, p.compte_id, p.id, p.jour, 'double', v_texte, now(), now() + interval '72 hours')
  on conflict (poster_id, type, semaine) do update
    set proposition_id = excluded.proposition_id, compte_id = excluded.compte_id, texte = excluded.texte,
        visible_de = excluded.visible_de, expire_at = excluded.expire_at, erreur = null,
        lu_at = null, upwork_statut = null, upwork_at = null, upwork_erreur = null
    where posteur_messages.reponse is null
  returning * into m;
  return m;
end;
$$;
revoke execute on function public.double_offrir(uuid) from public, anon, authenticated;
grant execute on function public.double_offrir(uuid) to service_role;

-- A7. Le posteur a demandé lui-même un 2e compte (carte des 45 derniers jours).
create or replace function public.double_demande(p_poster uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.problemes p
     where p.poster_id = p_poster and p.created_at > now() - interval '45 days'
       and (p.categorie = 'demande_2e_compte'
            or exists (select 1 from jsonb_array_elements(coalesce(p.sujets, '[]'::jsonb)) s where s->>'categorie' = 'demande_2e_compte')));
$$;
revoke execute on function public.double_demande(uuid) from public, anon, authenticated;
grant execute on function public.double_demande(uuid) to service_role;

-- A4. Le 2e compte d'un Double poste le lendemain de son warm-up (plus de lundi J+9 imposé).
do $p$
declare
  d text := pg_get_functiondef('public.ckd_compte_cree(uuid, uuid)'::regprocedure);
  avant text := 'update public.comptes set premiers_posts_le = p.jour + 9 where id = p_compte;';
begin
  if position(avant in d) = 0 then
    if position('0559' in d) > 0 then return; end if;
    raise exception '0559 : ckd_compte_cree, ligne du lundi J+9 introuvable';
  end if;
  d := replace(d, avant, 'update public.comptes set premiers_posts_le = null where id = p_compte; -- 0559 : le lendemain du warm-up');
  execute d;
end
$p$;

-- C2. Les règles de proposition du samedi (ckd_calculer).
do $p$
declare
  d text := (select pg_get_functiondef(p.oid) from pg_proc p where p.proname = 'ckd_calculer' and p.pronamespace = 'public'::regnamespace);
  avant_double text := $a$and e.j0 <= v_lundi
       and coalesce((e.r->'doublement_autorise'->>'v')::boolean, true)$a$;
  apres_double text := $a$and e.j0 <= v_lundi - 7  -- 0559 : 2 semaines complètes au moins
       -- 0559 : pas dans les 4 semaines après un refus ou une offre expirée.
       and not exists (select 1 from public.posteur_messages pm
                        where pm.poster_id = e.poster_id and pm.type = 'double' and pm.created_at > p_jour - 28
                          and pm.visible_de < now() + interval '1 year'
                          and (pm.reponse = 'non' or (pm.reponse is null and pm.expire_at <= now())))
       -- 0559 : le pays rapporte au moins 50 par compte actif sur 4 semaines.
       and coalesce((select sum(rp.proceeds) from public.rc_proceeds_pays_semaine rp
                      where rp.pays = upper(e.pays) and rp.semaine > v_lundi - 28 and rp.semaine <= v_lundi)
                    / nullif((select count(*) from public.comptes c4 where c4.is_active and upper(c4.pays) = upper(e.pays)), 0), 0) >= 50
       and coalesce((e.r->'doublement_autorise'->>'v')::boolean, true)$a$;
  avant_garder text := $a$            and o.decision in ('garder', 'pas_maintenant')$a$;
  apres_garder text := $a$            -- 0559 : « Gardé » sans aucun post avec lien depuis → le Kill revient ;
            -- « Pas maintenant » n'empêche plus Doubler (proposé tant qu'il reste régulier).
            and ((o.decision = 'garder'
                  and (d.action <> 'ne_pas_renouveler'
                       or exists (select 1 from public.passages px
                                   where px.compte_id = d.id and px.publie_url is not null
                                     and px.date_publication_prevue > (o.decision_at at time zone 'Europe/Paris')::date)))
                 or (o.decision = 'pas_maintenant' and d.action <> 'doubler'))$a$;
begin
  if d is null then raise exception '0559 : ckd_calculer introuvable'; end if;
  if position('0559 : 2 semaines complètes' in d) > 0 then return; end if;
  if position(avant_double in d) = 0 then raise exception '0559 : règle doubler introuvable'; end if;
  if position(avant_garder in d) = 0 then raise exception '0559 : filtre garder introuvable'; end if;
  d := replace(d, avant_double, apres_double);
  d := replace(d, avant_garder, apres_garder);
  execute d;
end
$p$;

-- C1. La mémoire : par posteur, la dernière décision du samedi avant p_jour et ce qui s'est passé depuis.
create or replace function public.samedi_memoire(p_jour date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_jour date := coalesce(p_jour, (now() at time zone 'Europe/Paris')::date);
begin
  if not public.is_admin() then
    raise exception 'samedi_memoire : réservé à l''admin' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_object_agg(x.poster_id, x.v)
      from (
        select distinct on (o.poster_id) o.poster_id,
               jsonb_build_object(
                 'jour', o.jour, 'decision', o.decision, 'action', o.action,
                 'posts', (select count(*) from public.passages ps join public.comptes c on c.id = ps.compte_id
                            where c.poster_id = o.poster_id and ps.publie_url is not null
                              and ps.date_publication_prevue > o.jour and ps.date_publication_prevue < v_jour),
                 'mediane', (select percentile_cont(0.5) within group (order by ps.vues) from public.passages ps join public.comptes c on c.id = ps.compte_id
                              where c.poster_id = o.poster_id and ps.publie_url is not null and ps.vues is not null
                                and ps.date_publication_prevue > o.jour and ps.date_publication_prevue < v_jour),
                 'compte2', case when o.decision = 'doubler' and o.nouveau_compte_id is not null then (
                   select jsonb_build_object(
                     'handle', c2.handle_tiktok,
                     'posts', (select count(*) from public.passages ps where ps.compte_id = c2.id and ps.publie_url is not null),
                     'mediane', (select percentile_cont(0.5) within group (order by ps.vues) from public.passages ps
                                  where ps.compte_id = c2.id and ps.publie_url is not null and ps.vues is not null),
                     'mediane1', (select percentile_cont(0.5) within group (order by ps.vues) from public.passages ps
                                   where ps.compte_id = o.compte_id and ps.publie_url is not null and ps.vues is not null
                                     and ps.date_publication_prevue > o.jour))
                     from public.comptes c2 where c2.id = o.nouveau_compte_id) end,
                 'offre', (select pm.reponse from public.posteur_messages pm where pm.proposition_id = o.id and pm.type = 'double' limit 1)
               ) as v
          from public.ckd_propositions o
         where o.type = 'samedi' and o.jour < v_jour and o.jour >= v_jour - 35 and o.decision is not null
         order by o.poster_id, o.jour desc, (o.decision = 'doubler') desc
      ) x), '{}'::jsonb);
end;
$$;
revoke execute on function public.samedi_memoire(date) from public, anon;
grant execute on function public.samedi_memoire(date) to authenticated;

-- C3. « Ce qu'a donné samedi dernier » : un verdict par décision et le total.
create or replace function public.samedi_bilan_calc(p_jour date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_jour date := coalesce(p_jour, (select max(o.jour) from public.ckd_propositions o
                                     where o.type = 'samedi' and o.decision is not null
                                       and o.jour < (now() at time zone 'Europe/Paris')::date - 1));
begin
  return (
    with d as (
      select o.id, o.poster_id, o.decision, o.nouveau_compte_id,
             coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), '?') as nom, pr.is_active,
             (select count(*) from public.passages ps join public.comptes c on c.id = ps.compte_id
               where c.poster_id = o.poster_id and ps.publie_url is not null and ps.date_publication_prevue > o.jour) as posts,
             (select pm.reponse from public.posteur_messages pm where pm.proposition_id = o.id and pm.type = 'double' limit 1) as reponse,
             (select pm.visible_de > now() + interval '1 year' from public.posteur_messages pm where pm.proposition_id = o.id and pm.type = 'double' limit 1) as retenu,
             (select count(*) from public.passages ps where ps.compte_id = o.nouveau_compte_id and ps.publie_url is not null) as posts2,
             coalesce(public.paie_tarif_contrat(o.poster_id), public.paie_tarif_zone(o.poster_id)) as tarif
        from public.ckd_propositions o
        left join public.profiles pr on pr.id = o.poster_id
       where o.type = 'samedi' and o.jour = v_jour and o.decision is not null
    ),
    v as (
      select d.*,
             case d.decision
               when 'ne_pas_renouveler' then case when not coalesce(d.is_active, false) then 'bonne' else 'a_revoir' end
               when 'doubler' then case when d.reponse = 'oui' and d.posts2 > 0 then 'bonne'
                                        when d.reponse = 'oui' or d.reponse is null then 'a_revoir'
                                        else 'a_revoir' end
               when 'garder' then case when d.posts >= 6 then 'bonne' when d.posts > 0 then 'a_revoir' else 'erreur' end
               when 'pas_maintenant' then case when d.posts >= 6 then 'bonne' else 'a_revoir' end
               else 'a_revoir' end as verdict,
             case d.decision
               when 'ne_pas_renouveler' then case when not coalesce(d.is_active, false) then 'tué' else 'encore actif' end
               when 'doubler' then case when coalesce(d.retenu, false) then 'proposition en attente'
                                        when d.reponse = 'oui' then 'accepté, ' || d.posts2 || ' post(s) sur le 2e compte'
                                        when d.reponse = 'non' then 'refusé'
                                        else 'pas encore de réponse' end
               else d.posts || ' post(s) avec lien depuis' end as detail
        from d
    )
    select jsonb_build_object(
      'jour', v_jour,
      'kills', count(*) filter (where decision = 'ne_pas_renouveler'),
      'doubles', count(*) filter (where decision = 'doubler' and not coalesce(retenu, false)),
      'doubles_acceptes', count(*) filter (where decision = 'doubler' and reponse = 'oui'),
      'gardes', count(*) filter (where decision in ('garder', 'pas_maintenant')),
      'cout_ajoute', coalesce(sum(tarif) filter (where decision = 'doubler' and reponse = 'oui'), 0),
      'verdicts', jsonb_build_object('bonne', count(*) filter (where verdict = 'bonne'),
                                     'a_revoir', count(*) filter (where verdict = 'a_revoir'),
                                     'erreur', count(*) filter (where verdict = 'erreur')),
      'lignes', coalesce(jsonb_agg(jsonb_build_object('poster_id', poster_id, 'nom', nom, 'decision', decision,
                                                      'verdict', verdict, 'detail', detail)
                                   order by case verdict when 'erreur' then 0 when 'a_revoir' then 1 else 2 end, nom), '[]'::jsonb))
      from v);
end;
$$;
revoke execute on function public.samedi_bilan_calc(date) from public, anon, authenticated;

create or replace function public.samedi_bilan(p_jour date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'samedi_bilan : réservé à l''admin' using errcode = '42501';
  end if;
  return public.samedi_bilan_calc(p_jour);
end;
$$;
revoke execute on function public.samedi_bilan(date) from public, anon;
grant execute on function public.samedi_bilan(date) to authenticated;

-- C4. Le cahier du Control Bot : chaque décision du samedi et son résultat, une fois.
create or replace function public.samedi_cahier(p_jour date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  b jsonb;
  l jsonb;
  n integer := 0;
  v_cle text;
begin
  b := public.samedi_bilan_calc(p_jour);
  for l in select * from jsonb_array_elements(coalesce(b->'lignes', '[]'::jsonb)) loop
    v_cle := 'samedi:' || (b->>'jour') || ':' || (l->>'poster_id') || ':' || (l->>'decision');
    if exists (select 1 from public.bot_feedback f where f.bot = 'control_bot' and f.categorie = 'samedi' and f.action_du_bot = v_cle) then
      continue;
    end if;
    insert into public.bot_feedback (bot, categorie, verdict, raison, diagnostic_du_bot, action_du_bot, choix)
    values ('control_bot', 'samedi',
            case l->>'verdict' when 'bonne' then 'juste' else 'mauvaise_action' end,
            case when l->>'verdict' = 'bonne' then null
                 else 'Samedi ' || to_char((b->>'jour')::date, 'DD/MM') || ' : « ' || (l->>'decision') || ' » pour ' || (l->>'nom')
                      || ' → ' || (l->>'detail') || case when l->>'verdict' = 'erreur' then ' (erreur : aurait dû être Kill)' else ' (à revoir)' end end,
            (l->>'nom') || ' : ' || (l->>'detail'),
            v_cle, l->>'decision');
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.samedi_cahier(date) from public, anon, authenticated;

-- Les crons : l'offre (relance Upwork 24 h, confirmation) toutes les heures ; le cahier le dimanche 9 h 07 (Paris ≈ 8 h 07 UTC).
do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'doubles-messages') then
    perform cron.schedule('doubles-messages', '29 * * * *', $q$
      select net.http_post(
        url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/upwork',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := jsonb_build_object('action', 'doubles_messages'),
        timeout_milliseconds := 120000);
    $q$);
  end if;
  if not exists (select 1 from cron.job where jobname = 'samedi-cahier') then
    perform cron.schedule('samedi-cahier', '7 8 * * 0', 'select public.samedi_cahier()');
  end if;
end
$c$;
