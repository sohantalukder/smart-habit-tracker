import { HttpException } from "@nestjs/common";

export class ApiException extends HttpException {
  constructor(
    status: number,
    code: string,
    message: string,
    retryable = false,
    fieldErrors?: Record<string, string[]>,
    details?: Record<string, unknown>,
  ) {
    super({ code, message, retryable, fieldErrors, details }, status);
  }
}
