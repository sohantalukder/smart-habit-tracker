import { Injectable } from "@nestjs/common";
import { Resend } from "resend";
import { ApiException } from "../platform/api.exception";

@Injectable()
export class VerificationEmailService {
  private readonly resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

  async send(email: string, code: string, expiresAt: Date) {
    if (process.env.NODE_ENV !== "production") {
      this.logDevelopmentCode("auth.verification_otp", email, code, expiresAt);
      return;
    }
    await this.deliverRequired(
      email,
      "Verify your Bloom account",
      `Your Bloom verification code is ${code}.\n\nIt expires in 10 minutes. If you did not create this account, you can ignore this message.`,
    );
  }

  async sendEmailChangeVerification(email: string, code: string, expiresAt: Date) {
    if (process.env.NODE_ENV !== "production") {
      this.logDevelopmentCode(
        "auth.email_change_verification_otp",
        email,
        code,
        expiresAt,
      );
      return;
    }
    await this.deliverRequired(
      email,
      "Verify your new Bloom email",
      `Your Bloom email-change code is ${code}.\n\nIt expires in 10 minutes. If you did not request this change, you can ignore this message.`,
    );
  }

  async sendSecurityNotice(email: string, subject: string, message: string) {
    if (process.env.NODE_ENV !== "production") {
      console.info(JSON.stringify({
        event: "auth.security_notice",
        email,
        subject,
        message,
      }));
      return;
    }
    if (!this.resend) {
      console.error(JSON.stringify({
        event: "auth.security_notice_failed",
        email,
        reason: "RESEND_API_KEY is not configured.",
      }));
      return;
    }
    const { error } = await this.resend.emails.send({
      from: process.env.EMAIL_FROM ?? "Bloom <reminders@example.com>",
      to: email,
      subject,
      text: message,
    });
    if (error) {
      console.error(JSON.stringify({
        event: "auth.security_notice_failed",
        email,
        reason: error.message,
      }));
    }
  }

  private async deliverRequired(email: string, subject: string, text: string) {
    if (!this.resend) {
      throw new ApiException(
        503,
        "EMAIL_UNAVAILABLE",
        "Verification email is temporarily unavailable. Please try again.",
        true,
      );
    }
    const { error } = await this.resend.emails.send({
      from: process.env.EMAIL_FROM ?? "Bloom <reminders@example.com>",
      to: email,
      subject,
      text,
    });
    if (error) {
      throw new ApiException(
        503,
        "EMAIL_UNAVAILABLE",
        "Verification email is temporarily unavailable. Please try again.",
        true,
      );
    }
  }

  private logDevelopmentCode(
    event: string,
    email: string,
    code: string,
    expiresAt: Date,
  ) {
    console.info(JSON.stringify({
      event,
      email,
      code,
      expiresAt: expiresAt.toISOString(),
    }));
  }
}
