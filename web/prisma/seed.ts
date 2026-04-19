import "dotenv/config";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";

const seedEnv = z
  .object({
    DATABASE_URL: z.string().min(1),
    HOUSEHOLD_ACCOUNT_1_USERNAME: z.string().min(1),
    HOUSEHOLD_ACCOUNT_1_PASSWORD: z.string().min(1),
    HOUSEHOLD_ACCOUNT_2_USERNAME: z.string().min(1),
    HOUSEHOLD_ACCOUNT_2_PASSWORD: z.string().min(1),
  })
  .parse(process.env);

const adapter = new PrismaPg({ connectionString: seedEnv.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function upsertUser(username: string, password: string): Promise<void> {
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { username },
    update: { passwordHash },
    create: { username, passwordHash },
  });
}

async function main(): Promise<void> {
  await upsertUser(seedEnv.HOUSEHOLD_ACCOUNT_1_USERNAME, seedEnv.HOUSEHOLD_ACCOUNT_1_PASSWORD);
  await upsertUser(seedEnv.HOUSEHOLD_ACCOUNT_2_USERNAME, seedEnv.HOUSEHOLD_ACCOUNT_2_PASSWORD);
  console.log("Household accounts have been upserted.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
