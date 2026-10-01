import Stripe from "stripe";
import { env } from "../config/env.js";
import { AppError } from "../http/errors.js";

let stripeClient: Stripe | undefined;

export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new AppError(503, "PAYMENTS_NOT_CONFIGURED", "Stripe payments are not configured.");
  }

  stripeClient ??= new Stripe(env.STRIPE_SECRET_KEY);
  return stripeClient;
}
