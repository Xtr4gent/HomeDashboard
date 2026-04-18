import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";

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
    return null;
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return null;
  }

  return { id: user.id, username: user.username };
}
