/**
 * GOV.UK Pay REST API response types (GET /v1/payments/{id})
 * @see https://docs.payments.service.gov.uk/api_reference/
 */

export interface GovPayPaymentState {
  status: string;
  finished?: boolean;
  message?: string;
  code?: string;
}

export interface GovPayPaymentResponse {
  payment_id: string;
  amount: number;
  reference?: string;
  description?: string;
  state?: GovPayPaymentState;
  provider_id?: string;
  return_url?: string;
  created_date?: string;
}
