import type { Request, Response } from "express";
import Stripe from "stripe";
import { env } from "../../config/env.js";
import { AppError, asyncHandler } from "../../http/errors.js";
import { getStripe } from "../../lib/stripe.js";
import { createTicketsForPaidOrder } from "../tickets/service.js";
import { expirePendingOrder } from "../orders/service.js";

function orderIdFromSession(session: Stripe.Checkout.Session): string {
  const orderId = session.metadata?.orderId;
  if (!orderId) throw new AppError(400, "INVALID_WEBHOOK", "The checkout session has no order metadata.");
  return orderId;
}

async function handleStripeWebhook(request: Request, response: Response): Promise<void> {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new AppError(503, "PAYMENTS_NOT_CONFIGURED", "Stripe webhook verification is not configured.");
  }

  const signature = request.header("stripe-signature");
  if (!signature || !Buffer.isBuffer(request.body)) {
    throw new AppError(400, "INVALID_WEBHOOK", "A signed raw Stripe webhook body is required.");
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(request.body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw new AppError(400, "INVALID_WEBHOOK_SIGNATURE", "The Stripe webhook signature is invalid.");
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status === "paid" || session.payment_status === "no_payment_required") {
      await createTicketsForPaidOrder(
        orderIdFromSession(session),
        event.id,
        typeof session.payment_intent === "string" ? session.payment_intent : null,
        session.id
      );
    }
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = orderIdFromSession(session);
    await expirePendingOrder(orderId);
    await createTicketsForPaidOrder(orderId, event.id, null, session.id);
  }

  response.status(200).json({ received: true });
}

export const stripeWebhookHandler = asyncHandler(handleStripeWebhook);
