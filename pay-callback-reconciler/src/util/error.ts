export class TransientError extends Error {
  public retryable: boolean = true;
  
  constructor(message: string) { 
    super(message); 
    this.name = 'TransientError';
  }
}

export class PermanentError extends Error {
  public retryable: boolean = false;
  
  constructor(message: string) { 
    super(message); 
    this.name = 'PermanentError';
  }
}
