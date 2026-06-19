/**
 * Payment Domain Types
 */

export interface Payment {
  id: number;
  payment_id: string | null;
  application_id?: string;
  amount: number;
  reference: string | null;
  status: string;
  description: string | null;
  created_at: Date;
  finished?: boolean | null;
  provider?: string | null;
}

export type PaymentStatus =
  | 'created'
  | 'pending'
  | 'confirmed'
  | 'captured'
  | 'settled'
  | 'refunded'
  | 'failed'
  | 'expired'
  | 'cancelled';

export interface PaymentEvent {
  event_id: string;
  payment_id: string;
  event_type: string;
  event_data: Record<string, unknown>;
  event_timestamp: string;
  processed: boolean;
  received_at: Date;
  created_at: Date;
}

export interface UpdatePaymentData {
  status?: string;
  amount?: number;
  reference?: string;
  description?: string;
  finished?: boolean;
}

export interface IdempotencyCheck {
  isDuplicate: boolean;
  event?: PaymentEvent;
}
