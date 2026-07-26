export function isInvalidFirebaseRegistrationError(errorCode: string | null) {
  return Boolean(
    errorCode
    && (
      errorCode.includes("registration-token-not-registered")
      || errorCode.includes("invalid-registration")
      || errorCode.includes("unregistered")
    )
  );
}

export function summarizeFirebaseResponses(
  responses: Array<{ success: boolean; errorCode: string | null }>,
) {
  const invalidIndices: number[] = [];
  let successes = 0;
  let retryableFailures = 0;
  responses.forEach((response, index) => {
    if (response.success) {
      successes += 1;
    } else if (isInvalidFirebaseRegistrationError(response.errorCode)) {
      invalidIndices.push(index);
    } else {
      retryableFailures += 1;
    }
  });
  return { successes, retryableFailures, invalidIndices };
}
