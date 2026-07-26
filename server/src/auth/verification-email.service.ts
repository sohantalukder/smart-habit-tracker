import { Injectable } from "@nestjs/common";
import { Resend } from "resend";
import { ApiException } from "../platform/api.exception";

@Injectable()
export class VerificationEmailService {
  private readonly resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

  async send(email: string, token: string) {
    const siteUrl = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
    const url = `${siteUrl}/auth/verify?token=${encodeURIComponent(token)}`;
    if (process.env.NODE_ENV !== "production") {
      this.logDevelopmentLink("auth.verification_link", email, token, url);
      return;
    }
    await this.deliverRequired(
      email,
      "Verify your Bloom account",
      `Verify your Bloom account by opening this link within 24 hours:\n\n${url}`,
    );
  }

  async sendEmailChangeVerification(email: string, token: string) {
    const siteUrl = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
    const url = `${siteUrl}/auth/verify-email-change?token=${encodeURIComponent(token)}`;
    if (process.env.NODE_ENV !== "production") {
      this.logDevelopmentLink("auth.email_change_verification_link", email, token, url);
      return;
    }
    await this.deliverRequired(
      email,
      "Verify your new Bloom email",
      `Confirm this email address for your Bloom account within 24 hours:\n\n${url}\n\nIf you did not request this change, you can ignore this message.`,
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

  private logDevelopmentLink(
    event: string,
    email: string,
    token: string,
    url: string,
  ) {
    console.info(JSON.stringify({ event, email, token, url }));
  }
}
