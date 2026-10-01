import type { NextFunction, Request, Response } from "express";
import { UserRole } from "@prisma/client";
import { AppError } from "../http/errors.js";
import { getSessionUser, SESSION_COOKIE } from "../modules/auth/session.js";

export async function loadAuth(request: Request, _response: Response, next: NextFunction): Promise<void> {
  try {
    request.auth = (await getSessionUser(request.cookies?.[SESSION_COOKIE])) ?? undefined;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) {
    throw new AppError(401, "UNAUTHENTICATED", "You must be signed in to perform this action.");
  }

  return request.auth;
}

export function requireRoles(...roles: UserRole[]) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    try {
      const auth = requireAuth(request);
      if (!roles.includes(auth.user.role)) {
        throw new AppError(403, "FORBIDDEN", "You do not have permission to perform this action.");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireApprovedOrganizer(request: Request): NonNullable<Request["auth"]> {
  const auth = requireAuth(request);
  const canManage = auth.user.role === UserRole.ADMIN ||
    (auth.user.role === UserRole.ORGANIZER && auth.user.organizerStatus === "APPROVED");

  if (!canManage) {
    throw new AppError(403, "ORGANIZER_APPROVAL_REQUIRED", "An approved organizer account is required.");
  }

  return auth;
}
