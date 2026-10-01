import { Resend } from "resend";
import { env } from "../config/env.js";
import { AppError } from "../http/errors.js";
import { prisma } from "./prisma.js";
import { decryptPublicCode } from "../modules/tickets/service.js";

let resendClient: Resend | undefined;

export function getResend(): Resend {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new AppError(503, "EMAIL_NOT_CONFIGURED", "Email delivery is not configured.");
  }
  resendClient ??= new Resend(env.RESEND_API_KEY);
  return resendClient;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character] ?? character);
}

export async function sendPasswordResetEmail(userId: string, encryptedToken: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "The password reset user was not found.");
  const { decryptResetToken } = await import("../modules/auth/reset.js");
  const token = decryptResetToken(encryptedToken);
  const resetUrl = `${env.WEB_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
  const resend = getResend();
  const from = env.EMAIL_FROM;
  if (!from) throw new AppError(503, "EMAIL_NOT_CONFIGURED", "Email delivery is not configured.");

  const result = await resend.emails.send({
    from,
    to: [user.email],
    ...(env.EMAIL_REPLY_TO ? { replyTo: env.EMAIL_REPLY_TO } : {}),
    subject: "Reset your EventFlow password",
    html: `<h1>Password reset</h1><p>Hi ${escapeHtml(user.name)}, use the link below to set a new EventFlow password. It expires soon and can only be used once.</p><p><a href="${resetUrl}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`
  });
  if (result.error) throw new Error(`Resend delivery failed: ${result.error.message}`);
}

export async function sendWaitlistOfferEmail(entryId: string): Promise<void> {
  const entry = await prisma.waitlistEntry.findUnique({
    where: { id: entryId },
    include: { user: true, event: true, ticketType: true }
  });
  if (!entry || entry.status !== "OFFERED") return;
  const resend = getResend();
  const from = env.EMAIL_FROM;
  if (!from) throw new AppError(503, "EMAIL_NOT_CONFIGURED", "Email delivery is not configured.");
  const result = await resend.emails.send({
    from,
    to: [entry.user.email],
    ...(env.EMAIL_REPLY_TO ? { replyTo: env.EMAIL_REPLY_TO } : {}),
    subject: `A ticket is available for ${entry.event.title}`,
    html: `<h1>Your waitlist turn is ready</h1><p>Hi ${escapeHtml(entry.user.name)}, one ${escapeHtml(entry.ticketType?.name ?? "ticket")} ticket is available for <strong>${escapeHtml(entry.event.title)}</strong>.</p><p>This offer expires in 10 minutes. <a href="${env.WEB_ORIGIN}/events/${encodeURIComponent(entry.event.slug)}">Open the event and claim it</a>.</p>`
  });
  if (result.error) throw new Error(`Resend delivery failed: ${result.error.message}`);
}

export async function sendOrderConfirmation(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      purchaser: true,
      event: true,
      items: { include: { ticketType: true, tickets: true } }
    }
  });
  if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "The order was not found.");

  const tickets = order.items.flatMap((item) => item.tickets.map((ticket) => ({
    type: item.ticketType.name,
    code: decryptPublicCode(ticket.publicCodeEncrypted)
  })));
  const ticketRows = tickets.map((ticket) => `<li><strong>${escapeHtml(ticket.type)}</strong>: <code>${escapeHtml(ticket.code)}</code></li>`).join("");
  const resend = getResend();
  const from = env.EMAIL_FROM;
  if (!from) throw new AppError(503, "EMAIL_NOT_CONFIGURED", "Email delivery is not configured.");

  const result = await resend.emails.send({
    from,
    to: [order.purchaser.email],
    ...(env.EMAIL_REPLY_TO ? { replyTo: env.EMAIL_REPLY_TO } : {}),
    subject: `Your EventFlow tickets for ${order.event.title}`,
    html: `
      <h1>Registration confirmed</h1>
      <p>Hi ${escapeHtml(order.purchaser.name)}, your registration for <strong>${escapeHtml(order.event.title)}</strong> is confirmed.</p>
      <p>Venue: ${escapeHtml(order.event.venue)}<br />Starts: ${order.event.startsAt.toISOString()}</p>
      <h2>Ticket codes</h2>
      <p>Keep these codes private and show them at check-in.</p>
      <ul>${ticketRows}</ul>
    `
  });

  if (result.error) {
    throw new Error(`Resend delivery failed: ${result.error.message}`);
  }
}
