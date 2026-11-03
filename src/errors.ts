/** An expected failure: reported to the user without a stack trace. */
export class DoppelblindError extends Error {
  readonly details: string[];
  /** Set once the TUI has shown the message after the failed step, so that it is not shown twice. */
  shown = false;

  constructor(message: string, details: string[] = []) {
    super(message);
    this.name = "DoppelblindError";
    this.details = details;
  }
}

/** A run reached one of its limits; only the time and cost limits may be raised. */
export class AgentLimitError extends DoppelblindError {
  readonly limit: "time" | "budget" | "turns";

  constructor(limit: "time" | "budget" | "turns", message: string, details: string[] = []) {
    super(message, details);
    this.name = "AgentLimitError";
    this.limit = limit;
  }
}
