SELECT plan(6);
SELECT ok(NOT has_function_privilege('anon','public.rpc_claim_invited_account(uuid,uuid)','EXECUTE'), 'anon wrapper denied');
SELECT ok(NOT has_function_privilege('authenticated','public.rpc_claim_invited_account(uuid,uuid)','EXECUTE'), 'authenticated wrapper denied');
SELECT ok(has_function_privilege('service_role','public.rpc_claim_invited_account(uuid,uuid)','EXECUTE'), 'backend wrapper allowed');
SELECT ok(NOT has_function_privilege('service_role','private_auth.finish_invite_claim_v21(uuid,uuid,text,text)','EXECUTE'), 'backend cannot fabricate audits');
SELECT throws_ok($$SELECT public.rpc_claim_invited_account(NULL,gen_random_uuid())$$, '22023', 'AUTH_CLAIM_INPUT_INVALID', 'null subject rejected before work');
SELECT throws_ok($$SELECT public.rpc_claim_invited_account(gen_random_uuid(),NULL)$$, '22023', 'AUTH_CLAIM_INPUT_INVALID', 'null request rejected before work');
SELECT * FROM finish();
