import type { Request } from "express";
import { AppError } from "./errors.js";

export function requiredParam(request: Request, name: string): string {
  const value = request.params[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new AppError(400, "INVALID_PATH", `The ${name} path parameter is invalid.`);
  }
  return value;
}
