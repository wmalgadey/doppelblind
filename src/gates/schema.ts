import { Ajv } from "ajv";
import { DoppelblindError } from "../errors.ts";

const ajv = new Ajv({ allErrors: true });

/** Validates structured output against its schema. Invalid output is a failure, never an empty result. */
export function validateOutput<T>(schema: object, output: unknown): T {
  const validate = ajv.compile(schema);
  if (validate(output)) return output as T;
  const details = (validate.errors ?? []).map((e) => `${e.instancePath || "(root)"} ${e.message}`);
  throw new DoppelblindError("Agent output does not match its schema.", details);
}
