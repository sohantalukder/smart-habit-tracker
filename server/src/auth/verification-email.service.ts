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
      console.info(JSON.stringify({
        event: "auth.verification_link",
        email,
        token,
        url,
      }));
      return;
    }
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
      subject: "Verify your Bloom account",
      text: `Verify your Bloom account by opening this link within 24 hours:\n\n${url}`,
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
}
