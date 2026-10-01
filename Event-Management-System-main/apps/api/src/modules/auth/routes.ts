import { Router } from "express";
import { randomBytes } from "node:crypto";
import rateLimit from "express-rate-limit";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { AppError, asyncHandler } from "../../http/errors.js";
import { loadAuth, requireAuth } from "../../middleware/auth.js";
import { hashPassword, verifyPassword } from "./password.js";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  publicUser,
  SESSION_COOKIE,
  setSessionCookie
} from "./session.js";
import { encryptResetToken, hashResetToken } from "./reset.js";

const router = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many authentication requests. Try again later." } }
});

const registerSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(128),
  name: z.string().trim().min(2).max(100)
});

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(128)
});

const forgotPasswordSchema = z.object({ email: z.string().trim().email().max(320) });
const resetPasswordSchema = z.object({ token: z.string().min(20).max(500), password: z.string().min(12).max(128) });

router.use(authLimiter, loadAuth);

router.post("/register", asyncHandler(async (request, response) => {
  const input = registerSchema.parse(request.body);
  const email = input.email.toLowerCase();
  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: { email, passwordHash, name: input.name }
  });

  const token = await createSession(user.id);
  setSessionCookie(response, token);

  response.status(201).json({ user: publicUser(user) });
}));

router.post("/login", asyncHandler(async (request, response) => {
  const input = loginSchema.parse(request.body);
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });

  if (!user || !(await verifyPassword(user.passwordHash, input.password))) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }

  const token = await createSession(user.id);
  setSessionCookie(response, token);
  response.status(200).json({ user: publicUser(user) });
}));

router.post("/logout", asyncHandler(async (request, response) => {
  await deleteSession(request.cookies?.[SESSION_COOKIE]);
  clearSessionCookie(response);
  response.status(204).send();
}));

router.get("/me", asyncHandler(async (request, response) => {
  const auth = requireAuth(request);
  response.status(200).json({ user: publicUser(auth.user) });
}));

router.post("/organizer-request", asyncHandler(async (request, response) => {
  const auth = requireAuth(request);
  if (auth.user.role !== UserRole.USER) {
    throw new AppError(409, "ROLE_ALREADY_ASSIGNED", "This account cannot request organizer approval.");
  }

  const user = await prisma.user.update({
    where: { id: auth.user.id },
    data: { organizerStatus: "PENDING" }
  });

  response.status(200).json({ user: publicUser(user) });
}));

router.post("/forgot-password", asyncHandler(async (request, response) => {
  const input = forgotPasswordSchema.parse(request.body);
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });

  if (user) {
    const rawToken = randomBytes(32).toString("base64url");
    await prisma.$transaction(async (transaction) => {
      await transaction.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
      const token = await transaction.passwordResetToken.create({
        data: { tokenHash: hashResetToken(rawToken), userId: user.id, expiresAt: new Date(Date.now() + 30 * 60 * 1000) }
      });
      await transaction.outboxJob.create({
        data: {
          kind: "SEND_PASSWORD_RESET_EMAIL",
          dedupeKey: `password-reset:${token.id}`,
          payload: { userId: user.id, encryptedToken: encryptResetToken(rawToken) }
        }
      });
    });
  }

  response.status(202).json({ message: "If an account exists for that email, a reset link will be sent." });
}));

router.post("/reset-password", asyncHandler(async (request, response) => {
  const input = resetPasswordSchema.parse(request.body);
  const tokenHash = hashResetToken(input.token);
  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (transaction) => {
    const resetToken = await transaction.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
      throw new AppError(400, "RESET_TOKEN_INVALID", "This password reset link is invalid or expired.");
    }

    const claimed = await transaction.passwordResetToken.updateMany({
      where: { id: resetToken.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() }
    });
    if (claimed.count !== 1) throw new AppError(400, "RESET_TOKEN_INVALID", "This password reset link is invalid or expired.");
    await transaction.user.update({ where: { id: resetToken.userId }, data: { passwordHash } });
    await transaction.session.deleteMany({ where: { userId: resetToken.userId } });
    return transaction.user.findUniqueOrThrow({ where: { id: resetToken.userId } });
  });

  const sessionToken = await createSession(user.id);
  setSessionCookie(response, sessionToken);
  response.status(200).json({ user: publicUser(user) });
}));

export default router;
