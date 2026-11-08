-- 0562 : parrainage par email : la déclaration creator_referrals garde, comme
-- avant, la langue du pays (contrainte pays = langue) et les 3 confirmations
-- (l'accord de l'ami donné par le posteur) ; l'invitation note aussi la langue.
-- Additif : une fonction, une fonction remplacée (par remplacement de texte).

create or replace function public.parrainage_langue_pays(p_pays text)
returns text
language sql
immutable
as $$
  select coalesce((select l from (values
    ('FR','fr'),('MC','fr'),('BE','fr'),('LU','fr'),('CH','de'),('DE','de'),('AT','de'),('LI','de'),('IT','it'),('SM','it'),('ES','es'),
    ('MX','es-419'),('CO','es-419'),('AR','es-419'),('CL','es-419'),('PE','es-419'),('EC','es-419'),('CR','es-419'),('UY','es-419'),
    ('VE','es-419'),('BO','es-419'),('PY','es-419'),('GT','es-419'),('DO','es-419'),('HN','es-419'),('NI','es-419'),('PA','es-419'),('SV','es-419'),
    ('PT','pt'),('BR','pt-BR'),('AO','pt'),('MZ','pt'),('NL','nl'),('PL','pl'),('RO','ro'),('MD','ro'),('HU','hu'),('CZ','cs'),('SK','sk'),
    ('BG','bg'),('GR','el'),('CY','el'),('HR','hr'),('SI','sl'),('RS','sr'),('SE','sv'),('NO','no'),('DK','da'),('FI','fi'),('EE','et'),
    ('LV','lv'),('LT','lt'),('TR','tr'),('IL','he'),('AE','ar'),('SA','ar'),('EG','ar'),('MA','ar'),('RU','ru'),('BY','ru'),('KZ','ru'),('JP','ja')
  ) m(p, l) where m.p = upper(p_pays)), 'en');
$$;

do $p$
declare
  d text := pg_get_functiondef('public.parrainage_inviter(text, text, text, boolean)'::regprocedure);
  avant1 text := $a$values (v_moi, v_prenom, v_pays, v_email, true, false, false, 'en_attente', 'parrainage par email (0561)')$a$;
  apres1 text := $a$values (v_moi, v_prenom, public.parrainage_langue_pays(v_pays), v_email, true, true, true, 'en_attente', 'parrainage par email (0561)')$a$;
  avant2 text := $a$insert into public.parrainage_invitations (referral_id, parrain_id, email, prenom, pays, code, statut, prochain_at)
  values (v_ref, v_moi, v_email, v_prenom, v_pays, public.parrainage_code(v_moi),$a$;
  apres2 text := $a$insert into public.parrainage_invitations (referral_id, parrain_id, email, prenom, pays, langue, code, statut, prochain_at)
  values (v_ref, v_moi, v_email, v_prenom, v_pays, public.parrainage_langue_pays(v_pays), public.parrainage_code(v_moi),$a$;
begin
  if position('parrainage_langue_pays' in d) > 0 then return; end if;
  if position(avant1 in d) = 0 or position(avant2 in d) = 0 then raise exception '0562 : parrainage_inviter, texte introuvable'; end if;
  d := replace(replace(d, avant1, apres1), avant2, apres2);
  execute d;
end
$p$;
