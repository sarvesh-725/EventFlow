import { Router } from "express";
import { asyncHandler, AppError } from "../../http/errors.js";
import { requiredParam } from "../../http/params.js";
import { loadAuth, requireAuth } from "../../middleware/auth.js";
import { createOrderSchema } from "./schemas.js";
import { attendeeSchema } from "./schemas.js";
import { createOrderCheckout, getOrderDetails, listOrdersForUser, publicOrder, updateTicketAttendee } from "./service.js";

const router = Router();
router.use(loadAuth);

router.post("/checkout", asyncHandler(async (request, response) => {
  const auth = requireAuth(request);
  const idempotencyKey = request.header("Idempotency-Key");
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    throw new AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "Send a unique Idempotency-Key header for checkout.");
  }

  const input = createOrderSchema.parse(request.body);
  const order = await createOrderCheckout(auth.user.id, input, idempotencyKey);
  response.status(201).json({ order: publicOrder(order) });
}));

router.get("/", asyncHandler(async (request, response) => {
  const auth = requireAuth(request);
  const orders = await listOrdersForUser(auth.user.id);
  response.status(200).json({ orders: orders.map(publicOrder) });
}));

router.patch("/:id/tickets/:ticketId/attendee", asyncHandler(async (request, response) => {
  const auth = requireAuth(request);
  const orderId = requiredParam(request, "id");
  const ticketId = requiredParam(request, "ticketId");
  const ticket = await updateTicketAttendee(orderId, ticketId, auth.user, attendeeSchema.parse(request.body));
  response.status(200).json({ ticket });
}));

router.get("/:id", asyncHandler(async (request, response) => {
  const auth = requireAuth(request);
  const orderId = requiredParam(request, "id");
  const order = await getOrderDetails(orderId);
  if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "The order was not found.");
  if (order.purchaser.id !== auth.user.id && auth.user.role !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "You cannot view this order.");
  }

  response.status(200).json({ order: publicOrder(order) });
}));

export default router;
