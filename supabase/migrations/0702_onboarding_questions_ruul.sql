-- 13/11 (Max) : corrections de l'onboarding des posteurs (Ruul et Upwork).
-- 1. ruul_mon_onboarding renvoie aussi l'état du compte Ruul (invited / active) : l'étape
--    « Prepare your Ruul account » du dashboard montre Invitation sent / Account active / Done.
-- 2. La FAQ des posteurs : la règle unique des questions (Help → Slack → DM Maximilien seulement
--    si vrai problème) et les règles du moment (dimanche minuit, paie le lundi, Ruul). Ajout seulement.
-- 3. L'accueil Upwork : la règle de l'argent après la phrase Help (même règle partout).

create or replace function public.ruul_mon_onboarding()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'ruul', coalesce(pr.canal_paie = 'ruul', false),
    'cohorte_lundi', pr.cohorte_lundi,
    'prenom_legal', h.prenom_legal,
    'nom_legal', h.nom_legal,
    'ruul_email', nullif(btrim(coalesce(pr.ruul_email, '')), ''),
    'email_candidature', coalesce(nullif(btrim(h.email_perso), ''), nullif(btrim(pr.email_perso), '')),
    'handle', c.handle_tiktok,
    'tiktok', coalesce(w.existe, false)
              or exists (select 1 from public.etape_declarations d where d.poster_id = pr.id and d.etape = 'tiktok' and d.statut <> 'refuse')
              or c.warmup_started_at is not null,
    'warmup_lance', c.warmup_started_at is not null,
    'abonnements', coalesce(w.abonnements, 0),
    'pret_warmup', coalesce(public.compte_pret(c.id), false),
    'slack', nullif(btrim(coalesce(pr.slack_user_id, '')), '') is not null
             or nullif(btrim(coalesce(h.slack_user_id, '')), '') is not null
             or exists (select 1 from public.etape_declarations d where d.poster_id = pr.id and d.etape = 'slack' and d.statut <> 'refuse'),
    'ruul_statut', pr.ruul_statut,
    'ruul_invite', pr.ruul_ajoute_at is not null,
    'ruul_pret', pr.ruul_statut in ('pret', 'paye_1x'),
    -- 0702 : l'état du compte Ruul lu par l'import (invited / active), pour l'étape du dashboard.
    'ruul_compte', pr.ruul_compte)
    from public.profiles pr
    left join public.hub_posteurs h on h.profile_id = pr.id
    left join lateral (select x.* from public.comptes x where x.poster_id = pr.id and x.is_active and coalesce(x.type_compte, 'perso') = 'perso'
                        order by x.created_at limit 1) c on true
    left join lateral (select r.existe, r.abonnements from public.ckd_warmup_releves r
                        where r.compte_id = c.id and r.existe is not null order by r.releve_at desc limit 1) w on true
   where pr.id = auth.uid();
$function$;

insert into public.reponses_officielles (question, reponse, ordre, actif, valide_at, portee, categorie, formulations)
select v.question, v.reponse, v.ordre, true, now(), v.portee, v.categorie, '{}'::text[]
  from (values
    ('I have a question or a problem. What do I do?',
     E'1. Click Help on your dashboard: you get an answer right away, and if needed it goes to our team.\n2. Slack, in the right channel: #posting-help for problems with your posts, #ruul-posters or #upwork-posters for your platform. Please make sure you join Slack.\n3. Money: ask Help first. If there is really a problem, DM Maximilien Kender on Slack, only if truly needed.',
     1, 'tous', 'autre'),
    ('A question or a problem about money / a payment?',
     'Ask Help on your dashboard first: you get an answer right away, and if needed it goes to our team. If there is really a problem, DM Maximilien Kender on Slack, only if truly needed.',
     2, 'tous', 'paiement'),
    ('When must my setup be finished?',
     'Before Sunday midnight (Paris time), the day before your start Monday: logged in, TikTok account created with the exact name, “Start warmup” clicked and at least 5 accounts followed. If you are not ready by then, you simply start one week later.',
     3, 'tous', 'posting'),
    ('When am I paid?',
     'Every Monday, for the week of posts that just ended (Monday → Sunday), through Ruul. Nothing to submit. Your first payment is the Monday after your first week of posts.',
     4, 'ruul', 'paiement'),
    ('When am I paid?',
     'Every Monday, for the week of posts that just ended (Monday → Sunday), through your Upwork milestone. Nothing to submit. Your first payment is the Monday after your first week of posts.',
     4, 'upwork', 'paiement'),
    ('How do I set up my Ruul account?',
     E'Within 24 hours you receive an invitation email from Ruul. Create your account FROM that email, with the email address shown on your dashboard. Then verify your ID, add your bank account and click It''s done on your dashboard. If you create your Ruul account with another email address, we cannot pay you.',
     5, 'ruul', 'paiement')
  ) as v(question, reponse, ordre, portee, categorie)
 where not exists (select 1 from public.reponses_officielles r where r.question = v.question and r.portee = v.portee);

update public.reglages
   set valeur = to_jsonb((valeur #>> '{}') || E'\nQuestions about money: ask Help first (it goes to our team if needed). If there is really a problem, DM Maximilien Kender on Slack, only if truly needed.'),
       updated_at = now()
 where cle = 'accueil_message_texte' and jsonb_typeof(valeur) = 'string'
   and (valeur #>> '{}') not like '%Questions about money%';
