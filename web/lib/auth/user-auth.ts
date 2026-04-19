import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const bootstrapHouseholdSchema = z.object({
  HOUSEHOLD_ACCOUNT_1_USERNAME: z.string().min(1),
  HOUSEHOLD_ACCOUNT_1_PASSWORD: z.string().min(1),
  HOUSEHOLD_ACCOUNT_2_USERNAME: z.string().min(1),
  HOUSEHOLD_ACCOUNT_2_PASSWORD: z.string().min(1),
});

async function tryBootstrapUser(
  username: string,
  password: string,
): Promise<{ id: string; username: string } | null> {
  const parsed = bootstrapHouseholdSchema.safeParse(process.env);
  if (!parsed.success) {
    return null;
  }

  const bootstrapUsers = [
    {
      username: parsed.data.HOUSEHOLD_ACCOUNT_1_USERNAME.trim(),
      password: parsed.data.HOUSEHOLD_ACCOUNT_1_PASSWORD,
    },
    {
      username: parsed.data.HOUSEHOLD_ACCOUNT_2_USERNAME.trim(),
      password: parsed.data.HOUSEHOLD_ACCOUNT_2_PASSWORD,
    },
  ];

  const matched = bootstrapUsers.find((entry) => entry.username.toLowerCase() === username.toLowerCase());
  if (!matched || matched.password !== password) {
    return null;
  }

  const passwordHash = await bcrypt.hash(matched.password, 12);
  const upserted = await prisma.user.upsert({
    where: { username: matched.username },
    update: { passwordHash },
    create: { username: matched.username, passwordHash },
    select: { id: true, username: true },
  });

  return upserted;
}

export async function authenticateUser(
  username: string,
  password: string,
): Promise<{ id: string; username: string } | null> {
  const normalized = username.trim();
  if (!normalized || !password) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { username: normalized },
    select: { id: true, username: true, passwordHash: true },
  });

  if (!user) {
    return tryBootstrapUser(normalized, password);
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (isValid) {
    return { id: user.id, username: user.username };
  }

  // If bootstrap credentials are configured, allow them to repair stale hashes.
  return tryBootstrapUser(normalized, password);
}
