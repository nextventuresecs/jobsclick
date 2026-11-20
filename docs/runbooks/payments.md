# Payments Operations & Incident Runbook

**Module:** Module 4 — Wallet, Razorpay & Sponsorships (WAL, INT)  
**Target Services:** `apps/api`, `apps/worker`, Supabase PostgreSQL, Razorpay API  
**Last Updated:** November 2026  
**Security Classification:** Highly Confidential / Operations Critical  

---

## 1. Architecture & Security Invariants Summary

1. **Authoritative State:** Razorpay API is the payment authorization truth. The client is never trusted for amounts, payment statuses, or currency.
2. **Ledger-Derived Balance:** Balance is derived dynamically via `public.rpc_get_balance(user_id)`. There is **no mutable stored balance column**.
3. **Double Settlement Prevention:** `private_payments.payment_grants` enforces unique `payment_id` and unique `(gateway_order_id, gateway_payment_id)`.
4. **Webhook Deduplication:** `private_payments.webhook_events` enforces unique `event_id`.
5. **Kill-Switch Semantics:**
   - Turning `WALLET_ENABLED=false` or `SPONSORSHIP_ENABLED=false` blocks new order creations (`503 Service Unavailable`).
   - Webhook processing (`POST /webhooks/razorpay`), client verification (`POST /wallet/recharge/verify`), background worker reconciliation, and refunds **REMAIN LIVE** so in-flight and already-captured payments settle properly.

---

## 2. Emergency Kill-Switch Activation

When to activate:
- Critical vulnerability discovered in checkout or pricing logic.
- Gateway outage or widespread unauthorized transaction activity.
- Database deadlock or migration failure affecting financial tables.

### Activation Steps (Zero-Downtime Config Update)

1. **Via Railway CLI / Dashboard:**
   ```bash
   railway variables --set WALLET_ENABLED=false
   railway variables --set SPONSORSHIP_ENABLED=false
   ```
2. **Behavior Verification:**
   - Attempting `POST /wallet/recharge/create-order` returns HTTP `503`:
     ```json
     {
       "statusCode": 503,
       "error": "Service Unavailable",
       "message": "Recharge temporarily paused for scheduled maintenance. In-flight orders will settle normally."
     }
     ```
   - Attempting `POST /wallet/sponsorships/create-order` returns HTTP `503`:
     ```json
     {
       "statusCode": 503,
       "error": "Service Unavailable",
       "message": "Institution sponsorship purchase temporarily paused for scheduled maintenance."
     }
     ```
   - Existing webhooks and verification endpoints continue functioning (`200 OK`).

3. **Restoration Steps:**
   ```bash
   railway variables --set WALLET_ENABLED=true
   railway variables --set SPONSORSHIP_ENABLED=true
   ```

---

## 3. Incident Procedures & Playbooks

### 3.1 Stuck Order (Captured at Gateway, "Created" Locally)

**Symptom:** User reports that funds were debited from bank/UPI, but wallet credits or sponsorship seats have not updated.

**Diagnosis:**
1. Check order status in `public.payments`:
   ```sql
   SELECT id, user_id, gateway_order_id, gateway_payment_id, amount_paise, status, created_at
   FROM public.payments
   WHERE gateway_order_id = 'order_xxxx';
   ```
2. If `status = 'created'`, the webhook may have failed delivery or Turnstile/network interrupted the client `/verify` call.
3. Check Razorpay Dashboard or query API to verify payment state:
   - Verify status is `captured`.

**Resolution (Manual Settlement via Admin CLI / Service):**
Run the operational settlement command using the NestJS service or database RPC:
```sql
SELECT public.rpc_settle_payment(
  'order_xxxx',           -- p_gateway_order_id
  'pay_yyyy',             -- p_gateway_payment_id
  59000,                  -- p_amount_paise (exact paise)
  'INR',                  -- p_currency
  'upi',                  -- p_method (e.g., upi, card, netbanking)
  'manual_ops_' || now(), -- p_event_id
  'ops_runbook'           -- p_source
);
```
Expected output:
```json
{"status": "settled", "payment_id": "...", "purpose": "wallet"}
```
Confirm ledger entry:
```sql
SELECT * FROM public.credit_ledgers WHERE payment_id = (SELECT id FROM public.payments WHERE gateway_order_id = 'order_xxxx');
```

---

### 3.2 Duplicate Capture / Dual Debits

**Symptom:** Razorpay dashboard or user shows two payments captured against the same order ID.

**Diagnosis:**
1. Check `private_payments.payment_anomalies`:
   ```sql
   SELECT * FROM private_payments.payment_anomalies 
   WHERE kind = 'DUPLICATE_CAPTURE' AND gateway_order_id = 'order_xxxx';
   ```
2. Observe `details`: Shows which payment was settled first (`settled_with`).

**Resolution (Automated & Manual Refund):**
1. Identify the second (unsettled) `payment_id`.
2. Issue full refund for the duplicate transaction directly via Razorpay API / Dashboard:
   - Notes: `"Duplicate capture on order order_xxxx"`.
3. Record the refund event:
   ```sql
   SELECT public.rpc_process_refund(
     'pay_second_yyyy',
     'rfnd_zzzz',
     59000,
     'duplicate_capture'
   );
   ```

---

### 3.3 Gateway Amount Mismatch

**Symptom:** Webhook or capture reports amount different from the agreed pack price.

**Diagnosis:**
1. Check `private_payments.payment_anomalies`:
   ```sql
   SELECT * FROM private_payments.payment_anomalies
   WHERE kind = 'AMOUNT_MISMATCH' AND gateway_order_id = 'order_xxxx';
   ```
2. The settlement RPC automatically rejects the settlement and writes an anomaly record. Zero credits are granted.

**Resolution:**
1. Investigate if the client altered frontend payment request or if currency conversion occurred.
2. In all mismatch cases:
   - Do **NOT** manually credit tokens.
   - Issue full refund via Razorpay Dashboard citing `"Amount mismatch / price discrepancy"`.
   - Update order status to `failed` or `refunded`.

---

### 3.4 Webhook Secret & API Key Zero-Downtime Rotation

**Target:** Rotate Razorpay API keys or webhook secret without losing in-flight settlements.

#### Webhook Secret Rotation
1. Open Razorpay Dashboard -> Settings -> Webhooks.
2. Add the new secret as a secondary secret (or create a secondary webhook endpoint).
3. Set the new secret in Railway API configuration:
   ```bash
   railway variables --set RAZORPAY_WEBHOOK_SECRET="new_webhook_secret"
   ```
4. Note on In-Flight Resilience: Even if a webhook arrives during the 30-second restart window and fails signature validation:
   - Razorpay will automatically retry the webhook (exponential backoff over 24 hours).
   - The hourly background reconciliation worker (`PaymentReconciliationWorker`) scans all `created` orders older than 15 minutes, queries Razorpay API directly, and settles any captured payments automatically.

#### API Key / Secret Rotation
1. In Razorpay Dashboard, generate new Key ID & Key Secret. Do **NOT** revoke old keys yet.
2. Update environment variables in Railway:
   ```bash
   railway variables --set RAZORPAY_KEY_ID="rzp_live_new..."
   railway variables --set RAZORPAY_KEY_SECRET="new_secret..."
   ```
3. Deploy / restart services. Verify health check `GET /health` and create a ₹1 test order.
4. After 24 hours, revoke old keys in Razorpay dashboard.

---

### 3.5 Chargeback & Dispute Handling

**Symptom:** User files a dispute with their issuing bank. Razorpay emits `payment.dispute.created`.

**Automated Action:**
- Webhook route automatically calls `public.rpc_record_dispute(...)` which records an audit trail in `private_payments.payment_anomalies`.

**Operational Protocol:**
1. Retrieve payment and user details:
   ```sql
   SELECT p.id, p.user_id, p.amount_paise, u.phone, u.role
   FROM public.payments p
   JOIN public.users u ON u.id = p.user_id
   WHERE p.gateway_payment_id = 'pay_xxxx';
   ```
2. Review ledger to check if credits were already spent:
   ```sql
   SELECT * FROM public.credit_ledgers WHERE user_id = 'user_uuid' ORDER BY created_at DESC;
   ```
3. If dispute is lost by merchant:
   - Call `public.rpc_process_refund(...)` with dispute ID to reverse credits and issue credit note.
   - If credits were consumed (balance is 0), system records `unrecovered_credits` and sets user balance to 0 (non-negative invariant preserved).

---

## 4. On-Call Escalation Matrix

| Level | Role | Responsibilities | Target SLA |
|-------|------|------------------|------------|
| L1    | Platform Ops On-Call | Check alerts, verify kill-switch status, run stuck order queries | 15 mins |
| L2    | Backend Payments Engineer | Investigate RPC errors, reconcile anomalies, rotate secrets | 30 mins |
| L3    | Security Lead & Financial Controller | Authorize refunds > ₹10,000, legal/dispute escalation, bank liaison | 1 hour |

---

## 5. Daily Health & Reconciliation Check Query

Run daily at 09:00 IST to ensure zero unsettled captured orders:

```sql
-- Check for any captured payment at gateway that hasn't settled locally > 1 hour
SELECT p.id, p.gateway_order_id, p.amount_paise, p.status, p.created_at
FROM public.payments p
WHERE p.status = 'created'
  AND p.created_at < now() - INTERVAL '1 hour';

-- Check for any anomalies recorded in the last 24 hours
SELECT id, kind, gateway_order_id, gateway_payment_id, details, created_at
FROM private_payments.payment_anomalies
WHERE created_at > now() - INTERVAL '24 hours';
```
If count > 0, follow Section 3.1.
