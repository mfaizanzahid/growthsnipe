/** Domain error with an HTTP status for billing operations. */
export class BillingError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 402 | 403 | 404 | 409 | 422 | 429 = 400,
  ) {
    super(message);
    this.name = "BillingError";
  }
}
