import argon2 from "argon2";
import "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim() || "EventFlow Admin";

  if (!email || !password) {
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required for seeding.");
  }

  const passwordHash = await argon2.hash(password);

  await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, role: "ADMIN", organizerStatus: "APPROVED" },
    create: { email, name, passwordHash, role: "ADMIN", organizerStatus: "APPROVED" }
  });

  console.log(`Seeded admin account: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
