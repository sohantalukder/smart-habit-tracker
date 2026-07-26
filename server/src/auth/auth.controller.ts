import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Ip,
  Post,
  Req,
} from "@nestjs/common";
import {
  emailSchema,
  loginSchema,
  signupSchema,
  verificationSchema,
} from "../contracts";
import { ApiException } from "../platform/api.exception";
import { Public, type AuthenticatedRequest } from "./auth.guard";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import { AuthService, normalizeEmail } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly limits: AuthRateLimitService,
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
