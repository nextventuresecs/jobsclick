-- Executed inside an isolated-schema transaction by auth-contacts.local.test.ts.
SELECT plan(6);
SELECT col_is_null('public', 'users', 'phone', 'phone supports email-only invites');
SELECT throws_ok($$INSERT INTO public.users(role,status) VALUES('employer','invited')$$,
  '23514', NULL, 'contactless records are rejected');
SELECT lives_ok($$INSERT INTO public.users(email,role,status) VALUES('tap@example.invalid','employer','invited')$$,
  'canonical email-only record is valid');
SELECT throws_ok($$INSERT INTO public.users(email,role,status) VALUES('tap@example.invalid','employer','invited')$$,
  '23505', NULL, 'confirmed emails remain unique');
SELECT throws_ok($$INSERT INTO public.users(email,role,status) VALUES('Upper@example.invalid','employer','invited')$$,
  '23514', NULL, 'noncanonical email is rejected');
SELECT lives_ok($$INSERT INTO public.users(phone,role,status) VALUES('DEL_abcdef1234','employer','disabled')$$,
  'legacy erasure tombstone remains compatible');
SELECT * FROM finish();
