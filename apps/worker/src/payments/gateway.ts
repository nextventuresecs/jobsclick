import { randomUUID } from 'node:crypto';

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
