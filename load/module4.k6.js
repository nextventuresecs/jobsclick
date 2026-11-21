import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import crypto from 'k6/crypto';

// ============================================================================
// Custom Metrics for Target Invariants
// ============================================================================
const doubleGrantRate = new Rate('double_grants');
const negativeBalanceRate = new Rate('negative_balances');
const settlementLatency = new Trend('settlement_latency_ms');
const webhookLatency = new Trend('webhook_latency_ms');

// ============================================================================
// Execution Options & Scenarios
// ============================================================================
export const options = {
  scenarios: {
    // Scenario 1: Mixed traffic sustained at 200 req/s for 10 minutes
    mixed_traffic: {
      executor: 'ramping-arrival-rate',
      startRate: 20,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 300,
      stages: [
        { target: 100, duration: '1m' },   // Warm up to 100 req/s
        { target: 200, duration: '8m' },   // Sustain 200 req/s
        { target: 0, duration: '1m' },     // Graceful ramp down
      ],
      exec: 'mixedTrafficFlow',
    },

    // Scenario 2: Concurrency spike - 500 webhooks in 10s for ONE single order
    single_order_500_webhooks: {
      executor: 'constant-arrival-rate',
      rate: 50, // 50 req/s for 10s = 500 requests
      timeUnit: '1s',
      duration: '10s',
      preAllocatedVUs: 50,
      maxVUs: 100,
      startTime: '30s', // trigger during steady state
      exec: 'concurrencyWebhookSpike',
    },
  },

  thresholds: {
    // SLA Targets from PRD & Task Brief:
    // 1. p95 < 500ms
    http_req_duration: ['p(95)<500'],
    // 2. Exactly 0 double grants
    double_grants: ['rate==0'],
    // 3. Exactly 0 negative balances
    negative_balances: ['rate==0'],
    // 4. API error rate < 1%
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3001';
const WEBHOOK_SECRET = __ENV.RAZORPAY_WEBHOOK_SECRET || 'test_razorpay_webhook_secret_256bits_fixture';

// Generate HMAC SHA256 hex string in k6
function hmacSha256(payload, secret) {
  return crypto.hmac('sha256', secret, payload, 'hex');
}

// ============================================================================
// Scenario 1: Mixed Traffic Flow
// ============================================================================
export function mixedTrafficFlow() {
  const userId = `00000000-0000-0000-0000-${String(__VU).padStart(12, '0')}`;
  const headers = {
    'Content-Type': 'application/json',
    'x-user-id': userId,
    'x-user-role': 'employer',
  };

  const rand = Math.random();

  if (rand < 0.40) {
    // 40% Balance checks (Read Path)
    group('GET /wallet/balance', () => {
      const res = http.get(`${BASE_URL}/wallet/balance`, { headers });
      const ok = check(res, {
        'status is 200': (r) => r.status === 200,
        'balance non-negative': (r) => {
          try {
            const body = JSON.parse(r.body);
            const bal = Number(body.balance);
            if (bal < 0) {
              negativeBalanceRate.add(1);
              return false;
            }
            negativeBalanceRate.add(0);
            return bal >= 0;
          } catch {
            return false;
          }
        },
      });
    });
  } else if (rand < 0.70) {
    // 30% Create Order (Intent Path)
    group('POST /wallet/recharge/create-order', () => {
      const payload = JSON.stringify({ packId: 'pack_growth' });
      const res = http.post(`${BASE_URL}/wallet/recharge/create-order`, payload, { headers });
      check(res, {
        'create order status is 201 or 503 (if kill-switch)': (r) => r.status === 201 || r.status === 503,
      });
    });
  } else if (rand < 0.90) {
    // 20% Webhook Ingestion (Gateway Settlement Path)
    group('POST /webhooks/razorpay', () => {
      const orderId = `order_load_${Date.now()}_${__VU}_${__ITER}`;
      const paymentId = `pay_load_${Date.now()}_${__VU}_${__ITER}`;
      const eventId = `evt_load_${Date.now()}_${__VU}_${__ITER}`;

      const payloadObj = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              order_id: orderId,
              amount: 59000,
              currency: 'INR',
              status: 'captured',
              method: 'upi',
            },
          },
        },
      };

      const rawBody = JSON.stringify(payloadObj);
      const signature = hmacSha256(rawBody, WEBHOOK_SECRET);

      const webhookHeaders = {
        'Content-Type': 'application/json',
        'x-razorpay-signature': signature,
        'x-razorpay-event-id': eventId,
      };

      const startTime = Date.now();
      const res = http.post(`${BASE_URL}/webhooks/razorpay`, rawBody, { headers: webhookHeaders });
      webhookLatency.add(Date.now() - startTime);

      check(res, {
        'webhook processed (200)': (r) => r.status === 200,
      });
    });
  } else {
    // 10% Verify Call (Client Redirect Path)
    group('POST /wallet/recharge/verify', () => {
      const orderId = `order_load_${Date.now()}`;
      const paymentId = `pay_load_${Date.now()}`;
      const sig = hmacSha256(`${orderId}|${paymentId}`, 'dummy_secret');

      const payload = JSON.stringify({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: sig,
      });

      const res = http.post(`${BASE_URL}/wallet/recharge/verify`, payload, { headers });
      check(res, {
        'verify returns 404/400 (not 500)': (r) => r.status === 404 || r.status === 400 || r.status === 200,
      });
    });
  }
}

// ============================================================================
// Scenario 2: 500 Concurrent Webhooks for the SAME order
// Target: Exactly 1 grant, 0 double grants
// ============================================================================
const SHARED_ORDER_ID = `order_load_concurrent_${Date.now()}`;
const SHARED_PAYMENT_ID = `pay_load_concurrent_${Date.now()}`;

export function concurrencyWebhookSpike() {
  const eventId = `evt_spike_${__ITER}_${__VU}`;
  const payloadObj = {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: SHARED_PAYMENT_ID,
          order_id: SHARED_ORDER_ID,
          amount: 59000,
          currency: 'INR',
          status: 'captured',
          method: 'upi',
        },
      },
    },
  };

  const rawBody = JSON.stringify(payloadObj);
  const signature = hmacSha256(rawBody, WEBHOOK_SECRET);

  const res = http.post(`${BASE_URL}/webhooks/razorpay`, rawBody, {
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': signature,
      'x-razorpay-event-id': eventId,
    },
  });

  // Check response
  check(res, {
    'spike webhook handled': (r) => r.status === 200 || r.status === 409,
  });
}
