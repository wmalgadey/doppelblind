/** An expected failure: reported to the user without a stack trace. */
export class DoppelblindError extends Error {
  readonly details: string[];

  constructor(message: string, details: string[] = []) {
    super(message);
    this.name = "DoppelblindError";
    this.details = details;
  }
}

export class AgentLimitError extends DoppelblindError {
  readonly limit: "time" | "budget";

  constructor(limit: "time" | "budget", message: string, details: string[] = []) {
    super(message, details);
    this.name = "AgentLimitError";
    this.limit = limit;
  }
}
