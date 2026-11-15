-- 13/11 (Max) : Support › « Ce que le bot sait » › « Ce que le bot peut faire tout seul ».
-- Pour chaque action, la dernière fois que l'OS l'a faite seul (null : jamais). Lecture seule, admins.
create or replace function public.support_capacites()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'reponse', (select max(cree_at) from public.support_demandes where bot_reponse is not null or statut = 'bot' or niveau = 'bot'),
    'mot_de_passe', greatest(
      (select max(cree_at) from public.support_demandes where auto_action = 'lien_mot_de_passe' or action_faite ilike '%mot de passe%'),
      (select max(at) from public.bot_actions where action = 'resend_password_link')),
    'slack', (select max(at) from public.bot_actions where action = 'relink_slack'),
    'email_ruul', (select max(cree_at) from public.support_demandes where action_faite ilike 'fait par le bot%' and action_faite not ilike '%réinviter%'),
    'reinvitation_ruul', (select max(cree_at) from public.support_demandes where action_faite ilike '%réinviter dans ruul%'),
    'ajout_ruul', (select max(at) from public.ruul_imports),
    'tiktok', greatest(
      (select max(cree_at) from public.support_demandes where action_faite ilike 'pseudo tiktok :%@%'),
      (select max(at) from public.bot_actions where action = 'reread_tiktok')),
    'parrainage', (select max(cree_at) from public.support_demandes where action_faite ilike 'parrainage :%'),
    'arret', greatest(
      (select max(cree_at) from public.support_demandes where auto_action = 'procedure_arret' or action_faite ilike 'arrêt transmis%'),
      (select max(at) from public.bot_actions where action = 'stop')),
    'paie', (select max(at) from public.bot_actions where bot = 'pay_bot'),
    'ticket', (select max(ticket_at) from public.support_demandes),
    'max', (select max(cree_at) from public.support_demandes where niveau = 'max'))
  where public.is_admin();
$function$;

grant execute on function public.support_capacites() to authenticated;
