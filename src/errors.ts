/** An expected failure: reported to the user without a stack trace. */
export class DoppelblindError extends Error {
  readonly details: string[];

  constructor(message: string, details: string[] = []) {
    super(message);
    this.name = "DoppelblindError";
    this.details = details;
  }
}
