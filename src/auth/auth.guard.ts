import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import { ApiException } from "../platform/api.exception";
import { AuthService, type AuthenticatedUser } from "./auth.service";

export const Public = () => SetMetadata("public", true);

export type AuthenticatedRequest = {
  headers: Record<string, string | string[] | undefined>;
  user: AuthenticatedUser;
  accessToken: string;
  sessionId: string;
  correlationId: string;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>("public", [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const rawHeader = request.headers.authorization;
    const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) {
      throw new ApiException(
        401,
        "AUTH_REQUIRED",
        "Please sign in to continue.",
      );
    }
    const session = await this.auth.authenticate(token);
    request.user = session.user;
    request.accessToken = token;
    request.sessionId = session.sessionId;
    const rawCorrelationId = request.headers["x-correlation-id"];
    request.correlationId =
      (Array.isArray(rawCorrelationId) ? rawCorrelationId[0] : rawCorrelationId) ??
      randomUUID();
    return true;
  }
}
