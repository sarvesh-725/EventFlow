import { createHash, createHmac, randomBytes } from "node:crypto";
import type { Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../http/errors.js";

export const SESSION_COOKIE = "eventflow_session";
const SESSION_TTL_DAYS = 30;

function sessionSecret(): string {
  if (!env.SESSION_SECRET) {
    throw new AppError(503, "AUTH_NOT_CONFIGURED", "Session authentication is not configured.");
  }

  return env.SESSION_SECRET;
}

function hashToken(token: string): string {
  return createHmac("sha256", sessionSecret()).update(token).digest("hex");
}

export function setSessionCookie(response: Response, token: string): void {
  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  });
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(SESSION_COOKIE, { path: "/" });
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt
    }
  });

  return token;
}

export async function getSessionUser(token: string | undefined) {
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true }
  });

  if (!session) return null;

  if (session.expiresAt <= new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      organizerStatus: session.user.organizerStatus
    }
  };
}

export async function deleteSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export function publicUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  organizerStatus: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizerStatus: user.organizerStatus
  };
}

export function hashPublicToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
