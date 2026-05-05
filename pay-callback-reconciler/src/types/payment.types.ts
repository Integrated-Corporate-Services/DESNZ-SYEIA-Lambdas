/**
 * Payment Domain Types
 * Core type definitions for payment processing
 */

export interface Payment {
  id: number;
  govuk_pay_id: string;
  reference: string | null;
  amount: number | null;
  status: PaymentStatus;
  description: string | null;
  transaction_id: string | null;
  event_history: string[];
  event_count: number;
  
  // Timestamps
  confirmed_at: Date | null;
  captured_at: Date | null;
  settled_at: Date | null;
  refunded_at: Date | null;
  failed_at: Date | null;
  expired_at: Date | null;
  created_at: Date;
  updated_at: Date;
  
  // Additional fields
  capture_amount: number | null;
  settled_amount: number | null;
  refund_amount: number | null;
  failure_reason: string | null;
  failure_code: string | null;
}

export type PaymentStatus = 
  | 'pending'
  | 'confirmed'
  | 'captured'
  | 'settled'
  | 'refunded'
  | 'failed'
  | 'expired';

export interface PaymentEvent {
  event_id: string;
  govuk_pay_id: string;
  event_type: PaymentEventType;
  event_data: Record<string, any>;
  event_timestamp: string;
  processed: boolean;
  received_at: Date;
  created_at: Date;
}

export type PaymentEventType =
  | 'payment.confirmed'
  | 'payment.captured'
  | 'payment.settled'
  | 'payment.refunded'
  | 'payment.failed'
  | 'payment.expired';

export interface OutboxRecord {
  id: number;
  aggregate_id: string;
  aggregate_type: string;
  event_type: string;
  payload_snapshot_json: string;
  created_at: Date;
  processed_at: Date | null;
  failed_at: Date | null;
  retry_count: number;
  error_message: string | null;
}

export interface CreatePaymentData {
  reference?: string | null;
  amount?: number | null;
  status?: PaymentStatus;
  description?: string | null;
}

export interface UpdatePaymentData {
  status?: PaymentStatus;
  event_history?: string[];
  event_count?: number;
  amount?: number;
  reference?: string;
  description?: string;
  transaction_id?: string;
  confirmed_at?: Date;
  captured_at?: Date;
  settled_at?: Date;
  refunded_at?: Date;
  failed_at?: Date;
  expired_at?: Date;
  capture_amount?: number;
  settled_amount?: number;
  refund_amount?: number;
  failure_reason?: string;
  failure_code?: string;
}

export interface IdempotencyCheck {
  isDuplicate: boolean;
  event?: PaymentEvent;
}
