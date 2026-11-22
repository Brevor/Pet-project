export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function errorBody(code: string, message: string, details?: unknown): ApiErrorBody {
  const body: ApiErrorBody = { error: { code, message } };
  if (details !== undefined) {
    body.error.details = details;
  }
  return body;
}

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}
