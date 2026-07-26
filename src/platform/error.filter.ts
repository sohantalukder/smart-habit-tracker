import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";

@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const request = host.switchToHttp().getRequest();
    const correlationId =
      request.headers["x-correlation-id"]?.toString() ?? randomUUID();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const body = error instanceof HttpException ? error.getResponse() : null;
    const objectBody =
      typeof body === "object" && body ? body as Record<string, unknown> : null;
    if (status >= 500) {
      console.error(JSON.stringify({
        event: "http.request_failed",
        correlationId,
        method: request.method,
        path: request.originalUrl ?? request.url,
        status,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { value: String(error) },
      }));
    }
    const message =
      objectBody && "message" in objectBody
        ? Array.isArray(objectBody.message)
          ? "Please check the submitted values."
          : String(objectBody.message)
        : status === 500
          ? "Something went wrong. Please try again."
          : "The request could not be completed.";
    response.header("x-correlation-id", correlationId);
    response.status(status).json({
      code:
        typeof objectBody?.code === "string"
          ? objectBody.code
          : status === 500
            ? "INTERNAL_ERROR"
            : `HTTP_${status}`,
      message,
      correlationId,
      retryable:
        typeof objectBody?.retryable === "boolean"
          ? objectBody.retryable
          : status >= 500 || status === 429,
      ...(objectBody?.fieldErrors ? { fieldErrors: objectBody.fieldErrors } : {}),
    });
  }
}
