import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Ip,
  Post,
  Req,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  deleteAccountSchema,
  emailChangeRequestSchema,
  emailSchema,
  loginSchema,
  passwordChangeSchema,
  signupSchema,
  verificationSchema,
} from "../contracts";
import { AuditService } from "../platform/audit.service";
import { ApiException } from "../platform/api.exception";
import { Public, type AuthenticatedRequest } from "./auth.guard";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import { AuthService, normalizeEmail } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly limits: AuthRateLimitService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Post("signup")
  @HttpCode(202)
  async signup(@Body() body: unknown, @Ip() ip: string) {
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) throw validationError();
    await this.limits.consume(
      "signup",
      `${ip}:${normalizeEmail(parsed.data.email)}`,
      5,
      15 * 60,
    );
    return this.auth.signup(parsed.data);
  }

  @Public()
  @Post("resend-verification")
  @HttpCode(202)
  async resend(@Body() body: unknown, @Ip() ip: string) {
    const parsed = emailSchema.safeParse(body);
    if (!parsed.success) throw validationError();
    await this.limits.consume(
      "resend",
      `${ip}:${normalizeEmail(parsed.data.email)}`,
      3,
      60 * 60,
    );
    return this.auth.resendVerification(parsed.data.email);
  }

  @Public()
  @Post("verify-email")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store, max-age=0")
  async verify(@Body() body: unknown, @Ip() ip: string) {
    const parsed = verificationSchema.safeParse(body);
    if (!parsed.success) throw validationError();
    await this.limits.consume("verify", ip, 20, 15 * 60);
    return this.auth.verifyEmail(parsed.data.token);
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store, max-age=0")
  async login(@Body() body: unknown, @Ip() ip: string) {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) throw validationError();
    await this.limits.consume(
      "login",
      `${ip}:${normalizeEmail(parsed.data.email)}`,
      8,
      15 * 60,
    );
    return this.auth.login(parsed.data);
  }

  @Public()
  @Post("restore-account")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store, max-age=0")
  async restore(
    @Body() body: unknown,
    @Ip() ip: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) throw validationError();
    await this.limits.consume(
      "restore",
      `${ip}:${normalizeEmail(parsed.data.email)}`,
      5,
      15 * 60,
    );
    const session = await this.auth.restoreAccount(parsed.data);
    await this.audit.record({
      actorId: session.user.id,
      action: "account.restored",
      targetType: "account",
      targetId: session.user.id,
      correlationId: correlationId ?? randomUUID(),
    });
    return session;
  }

  @Post("change-password")
  @HttpCode(200)
  async changePassword(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Ip() ip: string,
  ) {
    const parsed = passwordChangeSchema.safeParse(body);
    if (!parsed.success) throw validationError();
    await this.limits.consume(
      "change-password",
      `${ip}:${request.user.id}`,
      5,
      15 * 60,
    );
    const result = await this.auth.changePassword(
      request.user.id,
      request.sessionId,
      parsed.data,
    );
    await this.audit.record({
      actorId: request.user.id,
      action: "account.password_changed",
      targetType: "account",
      targetId: request.user.id,
      correlationId: request.correlationId,
    });
    return result;
  }

  @Post("request-email-change")
  @HttpCode(202)
  async requestEmailChange(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Ip() ip: string,
  ) {
    const parsed = emailChangeRequestSchema.safeParse(body);
    if (!parsed.success) throw validationError();
    await this.limits.consume(
      "request-email-change",
      `${ip}:${request.user.id}`,
      3,
      60 * 60,
    );
    const result = await this.auth.requestEmailChange(request.user.id, parsed.data);
    await this.audit.record({
      actorId: request.user.id,
      action: "account.email_change_requested",
      targetType: "account",
      targetId: request.user.id,
      correlationId: request.correlationId,
    });
    return result;
  }

  @Public()
  @Post("verify-email-change")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store, max-age=0")
  async verifyEmailChange(
    @Body() body: unknown,
    @Ip() ip: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const parsed = verificationSchema.safeParse(body);
    if (!parsed.success) throw validationError();
    await this.limits.consume("verify-email-change", ip, 20, 15 * 60);
    const session = await this.auth.verifyEmailChange(parsed.data.token);
    await this.audit.record({
      actorId: session.user.id,
      action: "account.email_changed",
      targetType: "account",
      targetId: session.user.id,
      correlationId: correlationId ?? randomUUID(),
    });
    return session;
  }

  @Post("sign-out-others")
  @HttpCode(200)
  async signOutOthers(@Req() request: AuthenticatedRequest) {
    const result = await this.auth.signOutOtherSessions(
      request.user.id,
      request.sessionId,
    );
    await this.audit.record({
      actorId: request.user.id,
      action: "account.other_sessions_revoked",
      targetType: "account",
      targetId: request.user.id,
      correlationId: request.correlationId,
      metadata: { count: result.signedOut },
    });
    return result;
  }

  @Post("delete-account")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store, max-age=0")
  async deleteAccount(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Ip() ip: string,
  ) {
    const parsed = deleteAccountSchema.safeParse(body);
    if (!parsed.success) throw validationError();
    await this.limits.consume(
      "delete-account",
      `${ip}:${request.user.id}`,
      3,
      60 * 60,
    );
    const result = await this.auth.deleteAccount(request.user.id, parsed.data);
    await this.audit.record({
      actorId: request.user.id,
      action: "account.deletion_requested",
      targetType: "account",
      targetId: request.user.id,
      correlationId: request.correlationId,
      metadata: { purgeAt: result.purgeAt },
    });
    return result;
  }

  @Get("me")
  @Header("Cache-Control", "private, no-store, max-age=0")
  me(@Req() request: AuthenticatedRequest) {
    return { user: request.user };
  }

  @Post("logout")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store, max-age=0")
  async logout(@Req() request: AuthenticatedRequest) {
    return this.auth.logout(request.sessionId);
  }
}

function validationError() {
  return new ApiException(
    400,
    "VALIDATION_ERROR",
    "Please check the submitted values.",
  );
}
