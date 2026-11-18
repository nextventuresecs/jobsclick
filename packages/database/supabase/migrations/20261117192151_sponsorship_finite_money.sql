-- WAL-05: numeric NaN must not satisfy a captured-money check.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='60s';
CREATE OR REPLACE FUNCTION private_payments.activate_sponsorship(
 p_institution uuid,p_actor uuid,p_reference text,p_key text,p_count integer,p_force boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 actor public.users%ROWTYPE; institution public.institution_profiles%ROWTYPE;
 payment public.payments%ROWTYPE; receipt private_payments.payment_grants%ROWTYPE;
 grant_row public.institution_sponsorships%ROWTYPE;
 matches integer; enrolled integer; quoted integer; rate integer; tier text;
 base_fee numeric; gst numeric; total numeric; key_value text; fingerprint_value jsonb; response jsonb;
BEGIN
 IF p_reference IS NULL OR length(p_reference) NOT BETWEEN 1 AND 255
   OR (p_key IS NOT NULL AND length(p_key) NOT BETWEEN 1 AND 255)
   OR (p_count IS NOT NULL AND p_count NOT BETWEEN 1 AND 1000000) OR p_force IS NULL THEN
   RAISE EXCEPTION 'SPONSORSHIP_INPUT_INVALID';
 END IF;
 SELECT * INTO actor FROM public.users WHERE id=p_actor FOR SHARE;
 IF NOT FOUND OR actor.status::text <> 'active' OR actor.role::text NOT IN ('intermediary','admin') THEN
   RAISE EXCEPTION 'SPONSORSHIP_ACTOR_DENIED';
 END IF;
 SELECT count(*) INTO matches FROM public.payments
 WHERE id=CASE WHEN p_reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN p_reference::uuid END
    OR gateway_payment_id=p_reference OR gateway_order_id=p_reference;
 IF matches <> 1 THEN RAISE EXCEPTION 'SPONSORSHIP_PAYMENT_INVALID'; END IF;
 SELECT * INTO STRICT payment FROM public.payments
 WHERE id=CASE WHEN p_reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN p_reference::uuid END
    OR gateway_payment_id=p_reference OR gateway_order_id=p_reference FOR UPDATE;
 SELECT * INTO institution FROM public.institution_profiles WHERE id=p_institution FOR UPDATE;
 IF NOT FOUND OR (actor.role::text <> 'admin' AND institution.user_id<>p_actor AND institution.created_by IS DISTINCT FROM p_actor) THEN
   RAISE EXCEPTION 'SPONSORSHIP_ACTOR_DENIED';
 END IF;
 IF payment.user_id<>institution.user_id AND payment.user_id<>p_actor THEN RAISE EXCEPTION 'SPONSORSHIP_PAYMENT_OWNER_DENIED'; END IF;
 IF payment.status::text <> 'captured' OR payment.gateway_payment_id IS NULL OR payment.currency<>'INR' THEN
   RAISE EXCEPTION 'SPONSORSHIP_PAYMENT_INVALID';
 END IF;
 IF payment.metadata->>'purpose' IS DISTINCT FROM 'sponsorship'
 OR payment.metadata->>'institutionId' IS DISTINCT FROM p_institution::text
 OR coalesce(payment.credits_added,0)<>0 OR payment.pack_id IS NOT NULL THEN
   RAISE EXCEPTION 'SPONSORSHIP_PAYMENT_PURPOSE_INVALID';
 END IF;
 key_value := coalesce(p_key,'payment:'||payment.id::text);
 fingerprint_value := jsonb_build_object('studentCountOverride',p_count,'force',p_force);
 SELECT * INTO receipt FROM private_payments.payment_grants WHERE payment_id=payment.id;
 IF FOUND THEN
   IF receipt.purpose<>'sponsorship' OR receipt.target_id<>p_institution OR receipt.request_key<>key_value OR receipt.fingerprint<>fingerprint_value THEN
     RAISE EXCEPTION 'SPONSORSHIP_PAYMENT_ALREADY_USED';
   END IF;
   SELECT * INTO grant_row FROM public.institution_sponsorships WHERE id=(receipt.result->>'sponsorshipId')::uuid;
   RETURN jsonb_set(receipt.result||jsonb_build_object('alreadyActive',true),'{quote,isSponsorshipActive}',
     to_jsonb(grant_row.status='active' AND grant_row.expires_at>now()));
 END IF;
 IF EXISTS(SELECT 1 FROM public.institution_sponsorships WHERE payment_reference IN (payment.id::text,payment.gateway_payment_id,payment.gateway_order_id)) THEN
   RAISE EXCEPTION 'SPONSORSHIP_LEGACY_PAYMENT_REQUIRES_RECONCILIATION';
 END IF;
 IF EXISTS(SELECT 1 FROM private_payments.payment_grants WHERE purpose='sponsorship' AND target_id=p_institution AND request_key=key_value) THEN
   RAISE EXCEPTION 'SPONSORSHIP_IDEMPOTENCY_CONFLICT';
 END IF;
 IF NOT p_force AND EXISTS(SELECT 1 FROM public.institution_sponsorships WHERE institution_id=p_institution AND status='active' AND expires_at>now()) THEN
   RAISE EXCEPTION 'SPONSORSHIP_ALREADY_ACTIVE';
 END IF;
 -- Lock the current UUID-linked students; free-text institution labels never enter this transaction.
 PERFORM 1 FROM public.job_seeker_profiles WHERE institution_id=p_institution FOR UPDATE;
 SELECT count(*) INTO enrolled FROM public.job_seeker_profiles WHERE institution_id=p_institution;
 quoted := greatest(enrolled,coalesce(p_count,0),1);
 rate := CASE WHEN quoted<=2000 THEN 150 WHEN quoted<=10000 THEN 100 ELSE 70 END;
 tier := CASE WHEN quoted<=2000 THEN 'Small' WHEN quoted<=10000 THEN 'Medium' ELSE 'Large' END;
 base_fee := quoted*rate; gst := round(base_fee*0.18); total := base_fee+gst;
 IF payment.amount_inr IS NULL OR payment.amount_inr::text IN ('NaN','Infinity','-Infinity') OR payment.amount_inr<total THEN RAISE EXCEPTION 'SPONSORSHIP_PAYMENT_INSUFFICIENT'; END IF;
 UPDATE public.job_seeker_profiles SET is_sponsored=true,updated_at=now() WHERE institution_id=p_institution;
 INSERT INTO public.institution_sponsorships(institution_id,tier,rate_per_student,annual_fee,student_count,status,payment_reference,idempotency_key,started_at,expires_at,created_by)
 VALUES(p_institution,tier,rate,total,enrolled,'active',payment.id::text,p_key,now(),now()+interval '365 days',p_actor) RETURNING * INTO grant_row;
 UPDATE public.institution_profiles SET is_sponsorship_active=true,sponsorship_tier=tier,sponsorship_rate_per_student=rate,
 sponsorship_expires_at=grant_row.expires_at,total_sponsored_students=enrolled,annual_sponsorship_fee=total,updated_at=now() WHERE id=p_institution;
 response := jsonb_build_object('success',true,'sponsoredStudentsCount',enrolled,'expiresAt',grant_row.expires_at,'alreadyActive',false,'sponsorshipId',grant_row.id,
 'quote',jsonb_build_object('institutionId',p_institution,'institutionName',institution.institution_name,'studentCount',quoted,'tier',tier,'ratePerStudentInr',rate,
 'baseAnnualFeeInr',base_fee,'gstRate',0.18,'gstAmountInr',gst,'totalAnnualFeeInr',total,'isSponsorshipActive',true,'sponsorshipExpiresAt',grant_row.expires_at,'activeSponsoredCount',enrolled));
 INSERT INTO private_payments.payment_grants(payment_id,purpose,target_id,request_key,fingerprint,result)
 VALUES(payment.id,'sponsorship',p_institution,key_value,fingerprint_value,response);
 INSERT INTO public.audit_logs(actor_id,action,meta) VALUES(p_actor,'INSTITUTION_SPONSORSHIP_ACTIVATED',
 jsonb_build_object('paymentId',payment.id,'institutionId',p_institution,'sponsorshipId',grant_row.id,'studentCount',enrolled,'totalAnnualFeeInr',total));
 RETURN response;
END; $$;
