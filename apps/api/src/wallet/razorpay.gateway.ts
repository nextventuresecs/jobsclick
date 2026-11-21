import { Injectable } from '@nestjs/common';
import Razorpay from 'razorpay';
import { randomUUID } from 'node:crypto';

export const RAZORPAY_GATEWAY = Symbol('RAZORPAY_GATEWAY');

export interface RazorpayGateway {
  readonly keyId: string;
  createOrder(i: {
    amountPaise: number;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<{ id: string }>;
  fetchPayment(
    id: string,
  ): Promise<{
    id: string;
    orderId: string;
    status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
    amountPaise: number;
    currency: string;
    method: string;
    amountRefundedPaise: number;
  }>;
  listOrderPayments(orderId: string): Promise<Array<{ id: string; status: string }>>;
  fetchRefund(
    id: string,
  ): Promise<{ id: string; paymentId: string; amountPaise: number; status: string }>;
}

function withTimeout<T>(promise: Promise<T>, ms = 10000, operation = 'Gateway operation'): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${ms}ms`));
    }, ms);

    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

@Injectable()
export class RazorpayNodeGateway implements RazorpayGateway {
  readonly keyId: string;
  private readonly keySecret: string;
  private readonly client: Razorpay;

  constructor() {
    this.keyId = process.env['RAZORPAY_KEY_ID'] || '';
    this.keySecret = process.env['RAZORPAY_KEY_SECRET'] || '';
    this.client = new Razorpay({
      key_id: this.keyId,
      key_secret: this.keySecret,
    });
  }

  async createOrder(i: {
    amountPaise: number;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<{ id: string }> {
    const call = this.client.orders.create({
      amount: i.amountPaise,
      currency: 'INR',
      receipt: i.receipt,
      notes: i.notes,
    });
    const order = await withTimeout(call, 10000, 'Razorpay createOrder');
    return { id: order.id };
  }

  async fetchPayment(id: string): Promise<{
    id: string;
    orderId: string;
    status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
    amountPaise: number;
    currency: string;
    method: string;
    amountRefundedPaise: number;
  }> {
    const call = this.client.payments.fetch(id);
    const p = (await withTimeout(call, 10000, `Razorpay fetchPayment(${id})`)) as unknown as Record<string, unknown>;
    return {
      id: String(p['id']),
      orderId: String(p['order_id'] ?? ''),
      status: p['status'] as 'created' | 'authorized' | 'captured' | 'refunded' | 'failed',
      amountPaise: Number(p['amount']),
      currency: String(p['currency'] ?? 'INR'),
      method: String(p['method'] ?? 'unknown'),
      amountRefundedPaise: Number(p['amount_refunded'] ?? 0),
    };
  }

  async listOrderPayments(orderId: string): Promise<Array<{ id: string; status: string }>> {
    const call = (this.client.orders as unknown as { fetchPayments: (id: string) => Promise<{ items: Array<{ id: string; status: string }> }> }).fetchPayments(orderId);
    const result = await withTimeout(call, 10000, `Razorpay listOrderPayments(${orderId})`);
    return (result.items || []).map((item) => ({
      id: item.id,
      status: item.status,
    }));
  }

  async fetchRefund(id: string): Promise<{ id: string; paymentId: string; amountPaise: number; status: string }> {
    const call = this.client.refunds.fetch(id);
    const r = (await withTimeout(call, 10000, `Razorpay fetchRefund(${id})`)) as unknown as Record<string, unknown>;
    return {
      id: String(r['id']),
      paymentId: String(r['payment_id']),
      amountPaise: Number(r['amount']),
      status: String(r['status']),
    };
  }
}

export class FakeRazorpayGateway implements RazorpayGateway {
  readonly keyId = 'rzp_test_fixture';
  private orders = new Map<string, { id: string; amountPaise: number; receipt: string; notes: Record<string, string> }>();
  private payments = new Map<
    string,
    {
      id: string;
      orderId: string;
      status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
      amountPaise: number;
      currency: string;
      method: string;
      amountRefundedPaise: number;
    }
  >();
  private refunds = new Map<string, { id: string; paymentId: string; amountPaise: number; status: string }>();

  async createOrder(i: {
    amountPaise: number;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<{ id: string }> {
    const id = `order_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    this.orders.set(id, { id, amountPaise: i.amountPaise, receipt: i.receipt, notes: i.notes });
    return { id };
  }

  async fetchPayment(id: string): Promise<{
    id: string;
    orderId: string;
    status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
    amountPaise: number;
    currency: string;
    method: string;
    amountRefundedPaise: number;
  }> {
    const p = this.payments.get(id);
    if (!p) {
      throw new Error(`FakeRazorpayGateway: payment ${id} not found`);
    }
    return { ...p };
  }

  async listOrderPayments(orderId: string): Promise<Array<{ id: string; status: string }>> {
    const matches: Array<{ id: string; status: string }> = [];
    for (const p of this.payments.values()) {
      if (p.orderId === orderId) {
        matches.push({ id: p.id, status: p.status });
      }
    }
    return matches;
  }

  async fetchRefund(id: string): Promise<{ id: string; paymentId: string; amountPaise: number; status: string }> {
    const r = this.refunds.get(id);
    if (!r) {
      throw new Error(`FakeRazorpayGateway: refund ${id} not found`);
    }
    return { ...r };
  }

  seedOrder(order: { id: string; amountPaise: number; receipt: string; notes: Record<string, string> }): void {
    this.orders.set(order.id, order);
  }

  seedPayment(payment: {
    id: string;
    orderId: string;
    status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
    amountPaise: number;
    currency?: string;
    method?: string;
    amountRefundedPaise?: number;
  }): void {
    this.payments.set(payment.id, {
      currency: 'INR',
      method: 'upi',
      amountRefundedPaise: 0,
      ...payment,
    });
  }

  seedRefund(refund: { id: string; paymentId: string; amountPaise: number; status: string }): void {
    this.refunds.set(refund.id, refund);
  }

  clear(): void {
    this.orders.clear();
    this.payments.clear();
    this.refunds.clear();
  }
}
