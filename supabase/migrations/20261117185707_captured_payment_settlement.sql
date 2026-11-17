-- WAL-03/05: verified gateway capture and its grant settle atomically in the local database.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';
CREATE FUNCTION private_payments.settle_payment(
 p_order text,p_gateway text,p_amount_paise bigint,p_currency text,p_invoice text,p_signature text,p_processed_by text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 payment public.payments%ROWTYPE; receipt private_payments.payment_grants%ROWTYPE;
 actor public.users%ROWTYPE; ledger_id uuid; sponsorship jsonb; target uuid;
BEGIN
 IF length(p_order) NOT BETWEEN 1 AND 255 OR length(p_gateway) NOT BETWEEN 1 AND 255
 OR p_amount_paise IS NULL OR p_amount_paise<=0 OR p_currency IS DISTINCT FROM 'INR'
 OR p_invoice IS NULL OR length(p_invoice) NOT BETWEEN 1 AND 255
 OR p_processed_by NOT IN ('razorpay_webhook','client_checkout','admin') THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
 -- Match sponsorship's actor -> payment -> institution lock order.
 SELECT * INTO actor FROM public.users WHERE id=(SELECT user_id FROM public.payments WHERE gateway_order_id=p_order) FOR SHARE;
 IF NOT FOUND OR actor.status::text<>'active' THEN RAISE EXCEPTION 'PAYMENT_ACTOR_DENIED'; END IF;
 SELECT * INTO payment FROM public.payments WHERE gateway_order_id=p_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
 IF payment.currency IS DISTINCT FROM p_currency OR round(payment.amount_inr*100)<>p_amount_paise THEN
   RAISE EXCEPTION 'PAYMENT_VERIFIED_FACTS_MISMATCH';
 END IF;
 IF EXISTS(SELECT 1 FROM public.payments WHERE gateway_payment_id=p_gateway AND id<>payment.id) THEN
   RAISE EXCEPTION 'DUPLICATE_PAYMENT_CLAIM';
 END IF;
 SELECT * INTO receipt FROM private_payments.payment_grants WHERE payment_id=payment.id;
 IF payment.status::text='captured' THEN
   IF payment.gateway_payment_id IS DISTINCT FROM p_gateway THEN RAISE EXCEPTION 'DUPLICATE_PAYMENT_CLAIM'; END IF;
   IF receipt.payment_id IS NULL THEN RAISE EXCEPTION 'PAYMENT_LEGACY_RECONCILIATION_REQUIRED'; END IF;
   RETURN jsonb_build_object('payment',to_jsonb(payment),'alreadyProcessed',true,
     'sponsorship',CASE WHEN receipt.purpose='sponsorship' THEN receipt.result||jsonb_build_object('alreadyActive',true) ELSE NULL END);
 END IF;
 IF payment.status::text NOT IN ('created','authorized') OR receipt.payment_id IS NOT NULL THEN RAISE EXCEPTION 'PAYMENT_STATE_INVALID'; END IF;
 UPDATE public.payments SET status='captured',gateway_payment_id=p_gateway,gateway_signature=p_signature,invoice_number=p_invoice,
   processed_at=now(),processed_by=p_processed_by,updated_at=now(),
   metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('capturedAt',now(),'verifiedBy',p_processed_by)
 WHERE id=payment.id RETURNING * INTO payment;
 IF payment.metadata->>'purpose'='sponsorship' THEN
   IF coalesce(payment.metadata->>'institutionId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'SPONSORSHIP_PAYMENT_PURPOSE_INVALID'; END IF;
   target := (payment.metadata->>'institutionId')::uuid;
   sponsorship := private_payments.activate_sponsorship(target,payment.user_id,payment.id::text,
     coalesce(payment.metadata->>'activationKey','capture:'||p_gateway),NULL,false);
 ELSIF payment.metadata->>'purpose'='wallet' AND payment.pack_id IS NOT NULL AND coalesce(payment.credits_added,0)>0 THEN
   PERFORM pg_advisory_xact_lock(hashtext('wallet_'||payment.user_id::text));
   ledger_id := gen_random_uuid();
   INSERT INTO public.credit_ledgers(id,user_id,amount,reason,actor_id)
   VALUES(ledger_id,payment.user_id,payment.credits_added,'Wallet recharge: Credit pack '||payment.pack_id||' (Ref: '||p_gateway||')',payment.user_id::text);
   INSERT INTO private_payments.payment_grants(payment_id,purpose,target_id,request_key,fingerprint,result)
   VALUES(payment.id,'wallet',payment.user_id,'capture:'||p_gateway,
     jsonb_build_object('gatewayPaymentId',p_gateway,'amountPaise',p_amount_paise,'currency',p_currency),jsonb_build_object('ledgerId',ledger_id));
   INSERT INTO public.audit_logs(actor_id,action,meta) VALUES(payment.user_id,'CREDIT_WALLET_GRANTED',
     jsonb_build_object('paymentId',payment.id,'ledgerEntryId',ledger_id,'amount',payment.credits_added));
 ELSE RAISE EXCEPTION 'PAYMENT_PURPOSE_INVALID';
 END IF;
 INSERT INTO public.audit_logs(actor_id,action,meta) VALUES(payment.user_id,'PAYMENT_CAPTURED',
   jsonb_build_object('paymentId',payment.id,'creditsAdded',coalesce(payment.credits_added,0),'amountInr',payment.amount_inr));
 RETURN jsonb_build_object('payment',to_jsonb(payment),'alreadyProcessed',false,'sponsorship',sponsorship);
END; $$;
REVOKE ALL ON FUNCTION private_payments.settle_payment(text,text,bigint,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private_payments.settle_payment(text,text,bigint,text,text,text,text) TO service_role;
CREATE FUNCTION public.rpc_settle_payment(p_order text,p_gateway text,p_amount_paise bigint,p_currency text,p_invoice text,p_signature text DEFAULT NULL,p_processed_by text DEFAULT 'razorpay_webhook')
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private_payments.settle_payment(p_order,p_gateway,p_amount_paise,p_currency,p_invoice,p_signature,p_processed_by) $$;
REVOKE ALL ON FUNCTION public.rpc_settle_payment(text,text,bigint,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_settle_payment(text,text,bigint,text,text,text,text) TO service_role;
