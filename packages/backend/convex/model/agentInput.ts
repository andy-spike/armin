import { z } from "zod";
import { fail } from "./errors";

const maxErrorLength = 300;

export function agentInputJsonSchema(schema: z.ZodType) {
  const jsonSchema = z.toJSONSchema(schema);
  delete jsonSchema.$schema;
  return jsonSchema;
}

export function parseAgentInput<T extends z.ZodType>(schema: T, input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const message = result.error.issues
    .slice(0, 3)
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "input";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
  fail(
    "INVALID",
    message.length > maxErrorLength ? `${message.slice(0, maxErrorLength - 3)}...` : message,
  );
}
