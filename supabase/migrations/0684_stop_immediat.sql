-- 0684 : STOP = arrêt immédiat de toutes les relances (Max, 12/11).
-- Dès que l'OS voit un STOP, profiles.relances_stop_at est posé tout de suite, sans attendre
-- que la carte soit traitée ni que le classement des messages passe :
--   - un message reçu (Slack, Help, Upwork, bouton du dashboard) qui dit STOP ou « I want to stop /
--     end the contract » dans les langues courantes (posteur_reponses) ;
--   - une demande d'arrêt notée (demandes_arret, manuelle ou par le classement) ;
--   - une demande Help de catégorie « arrêt » (support_demandes) ;
--   - le lien « Unsubscribe » des emails (ruul_stop_jeton, déjà).
-- Les envois vérifient ensuite relances_stop_at (fonctions Edge, _shared/stop.ts).
-- Additif : une fonction de détection, une fonction, trois triggers ; les 4 STOP ouverts dont le
-- posteur est actif reçoivent relances_stop_at maintenant (demande de Max).

/* STOP seul, ou une phrase claire d'arrêt, dans les langues des posteurs. Prudent : une question n'est pas un STOP. */
create or replace function public.texte_est_stop(p_texte text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_texte, '') ~* '^\s*(stop|stopp|stopp?en|arr[eê]t|arr[eê]ter|basta|quit|unsubscribe)\s*[.!]*\s*$'
      or coalesce(p_texte, '') ~* concat_ws('|',
           'i\s+(really\s+)?(want|would\s+like|wish|need|have)\s+to\s+(stop|quit|end|cancel|leave|withdraw)\M',
           '(end|cancel|terminate|close|stop)\s+(the|my|this|our)\s+(contract|collaboration|job)',
           '\mi\s+(quit|resign|withdraw)\M',
           'no\s+longer\s+(want|wish|able)\s+to\s+(work|continue|post|do)',
           'do\s*n.?t\s+want\s+to\s+continue',
           'je\s+(veux|voudrais|souhaite)\s+(arr[eê]ter|mettre\s+fin|quitter|me\s+d[ée]sinscrire)',
           'quiero\s+(dejar(lo)?|terminar|parar|renunciar|cancelar)',
           'voglio\s+(smettere|terminare|interrompere|lasciare)',
           'ich\s+(m[öo]chte|will)\s+(aufh[öo]ren|k[üu]ndigen|beenden)',
           'quero\s+(parar|sair|terminar|desistir|cancelar)',
           'chc[eę]\s+(zrezygnowa[cć]|zako[nń]czy[cć]|przesta[cć])',
           '(b[ıi]rakmak|ayr[ıi]lmak|durdurmak)\s+istiyorum',
           'ik\s+wil\s+(stoppen|stop)',
           'θέλω\s+να\s+σταματ',
           'хочу\s+(прекратить|уйти|закончить|остановить)',
           'vreau\s+s[aă]\s+(m[aă]\s+opresc|renun[tț])',
           'chci\s+(skon[cč]it|p[rř]estat)',
           'szeretn[ée]m\s+abbahagyni');
$$;

/* Pose le STOP sur un posteur (une seule fois : la première date reste). */
create or replace function public.stop_poser(p_poster uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set relances_stop_at = now() where id = p_poster and relances_stop_at is null;
$$;
revoke execute on function public.stop_poser(uuid) from public, anon, authenticated;

create or replace function public.stop_depuis_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.poster_id is not null and (public.texte_est_stop(new.texte) or (new.canal = 'bouton' and new.texte ~* 'stop')) then
    perform public.stop_poser(new.poster_id);
  end if;
  return new;
end;
$$;
revoke execute on function public.stop_depuis_message() from public, anon, authenticated;
create or replace trigger posteur_reponses_stop
  after insert on public.posteur_reponses
  for each row execute function public.stop_depuis_message();

create or replace function public.stop_depuis_demande()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.poster_id is not null then perform public.stop_poser(new.poster_id); end if;
  return new;
end;
$$;
revoke execute on function public.stop_depuis_demande() from public, anon, authenticated;
create or replace trigger demandes_arret_stop
  after insert on public.demandes_arret
  for each row execute function public.stop_depuis_demande();

create or replace function public.stop_depuis_help()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.poster_id is not null and (new.categorie = 'arret' or public.texte_est_stop(new.texte)) then
    perform public.stop_poser(new.poster_id);
  end if;
  return new;
end;
$$;
revoke execute on function public.stop_depuis_help() from public, anon, authenticated;
create or replace trigger support_demandes_stop
  after insert on public.support_demandes
  for each row execute function public.stop_depuis_help();

-- Les STOP déjà ouverts (pas encore tranchés) dont le posteur est actif : maintenant.
update public.profiles p
   set relances_stop_at = now()
 where p.relances_stop_at is null and p.is_active
   and exists (select 1 from public.demandes_arret d where d.poster_id = p.id and d.decision is null);
