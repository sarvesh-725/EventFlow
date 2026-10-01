import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError, asyncHandler } from "../../http/errors.js";
import { loadAuth, requireAuth } from "../../middleware/auth.js";
import { getCloudinary } from "../../lib/cloudinary.js";
import { UserRole } from "@prisma/client";

const router = Router();
router.use(loadAuth);

router.post("/signature", asyncHandler(async (request, response) => {
  const auth = requireAuth(request);
  if (auth.user.role !== UserRole.ORGANIZER && auth.user.role !== UserRole.ADMIN) {
    throw new AppError(403, "FORBIDDEN", "Only organizers can upload event images.");
  }
  const input = z.object({ resourceType: z.enum(["image"]).default("image") }).parse(request.body ?? {});
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "eventflow/events";
  const signature = getCloudinary().utils.api_sign_request({ folder, timestamp }, env.CLOUDINARY_API_SECRET!);
  response.status(200).json({
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    timestamp,
    folder,
    resourceType: input.resourceType,
    signature
  });
}));

export default router;
