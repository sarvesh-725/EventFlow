import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}

export function toHttpError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof ZodError) {
    return new AppError(400, "VALIDATION_ERROR", "The request data is invalid.", error.flatten());
  }

  if (error instanceof Error && error.name === "PrismaClientInitializationError") {
    return new AppError(503, "DEPENDENCY_UNAVAILABLE", "The database is temporarily unavailable.");
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return new AppError(409, "CONFLICT", "A record with this value already exists.");
    }

    if (error.code === "P2025") {
      return new AppError(404, "NOT_FOUND", "The requested record was not found.");
    }
  }

  return new AppError(500, "INTERNAL_ERROR", "An unexpected error occurred.");
}
