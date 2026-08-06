
export interface WorkerSummary {
  processed: number;
  failed: number;
  errors: WorkerError[];
}

export interface WorkerError {
  message: string;
  recordId: string;
  code?: string;
}

export interface PaymentPayload {
  transactionId: string;
  amount: number;
  status: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface ProcessResult {
  recordId: string;
  success: boolean;
  message?: string;
  error?: WorkerError;
}
