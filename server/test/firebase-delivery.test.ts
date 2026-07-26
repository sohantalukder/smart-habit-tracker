import { describe, expect, it } from "vitest";
import {
  isInvalidFirebaseRegistrationError,
  summarizeFirebaseResponses,
} from "../src/reminders/firebase-delivery";

describe("Firebase delivery classification", () => {
  it("keeps partial success while identifying invalid installations", () => {
    expect(summarizeFirebaseResponses([
      { success: true, errorCode: null },
      {
        success: false,
        errorCode: "messaging/registration-token-not-registered",
      },
      { success: false, errorCode: "messaging/internal-error" },
    ])).toEqual({
      successes: 1,
      retryableFailures: 1,
      invalidIndices: [1],
    });
  });

  it("does not deactivate installations for retryable provider failures", () => {
    expect(isInvalidFirebaseRegistrationError("messaging/unregistered")).toBe(true);
    expect(isInvalidFirebaseRegistrationError("messaging/internal-error")).toBe(false);
    expect(isInvalidFirebaseRegistrationError(null)).toBe(false);
  });
});
