-- 0708 : Max (13/11) : ruul_textes et ruul_textes_ab suivent le guide Ruul pas à pas (à la place de
-- « attends l'email de Ruul et clique sur le lien »). On garde « You don't need Ruul to start posting —
-- it's only to get paid. » et « You're paid every Monday for the week you posted. ».
-- Seuls invite_texte, relance_texte (ruul_textes) et a_texte (ruul_textes_ab) changent ; le reste est gardé.

do $m$
declare
  v_etapes text := E'1. Go to app.ruul.io/register\n'
    || E'2. Choose « Contractor » (not Business).\n'
    || E'3. First name + last name exactly as on your ID.\n'
    || E'   Email: use exactly {email} (the one in your dashboard).\n'
    || E'   Tip: if it''s a Gmail address, you can also click « Continue with Google ».\n'
    || E'4. Role: choose « Digital Creator ».\n'
    || E'5. Tick « I agree to the Terms of Use » → « Create account ».\n'
    || E'6. Enter the code Ruul sent to your email. Didn''t get it after 1 minute? Click « Resend » and check your spam.\n'
    || E'7. Once inside Ruul: go to « Payment accounts » → « Add my ID » → follow the steps (ID + bank details).\n'
    || E'8. Come back to this email and click the button below.';
  v_important text := E'Important:\n'
    || E'- You don''t need Ruul to start posting — it''s only to get paid.\n'
    || E'- You''re paid every Monday for the week you posted. Your first payment: the Monday after your first week.\n'
    || E'- Do it before your first post: before Sunday midnight (Paris time).';
  v_invite text;
  v_relance text;
begin
  v_invite := E'Hi {prenom},\n\nRuul is the platform we use to pay you every Monday. It''s free for you and takes about 5 minutes. You don''t need to wait for an email from Ruul: set it up now.\n\n'
    || v_etapes || E'\n\n' || v_important
    || E'\n\nHave a question? Ask Help on your dashboard first: you''ll get an answer right away, and you can escalate to our team if needed.';
  v_relance := E'Hi {prenom},\n\nYour Ruul account is not ready yet, so we can''t pay you on Monday. It takes about 5 minutes:\n\n'
    || v_etapes || E'\n\n' || v_important
    || E'\n\nA problem with Ruul? Click Help on your dashboard and tell us.';

  update public.reglages
     set valeur = coalesce(valeur, '{}'::jsonb) || jsonb_build_object('invite_texte', v_invite, 'relance_texte', v_relance), updated_at = now()
   where cle = 'ruul_textes';
  update public.reglages
     set valeur = coalesce(valeur, '{}'::jsonb) || jsonb_build_object('a_texte', v_invite), updated_at = now()
   where cle = 'ruul_textes_ab';
end
$m$;
