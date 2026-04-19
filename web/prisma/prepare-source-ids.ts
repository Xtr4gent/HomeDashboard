import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prepEnv = z
  .object({
    DATABASE_URL: z.string().min(1),
  })
  .parse(process.env);

const adapter = new PrismaPg({ connectionString: prepEnv.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function hasSourceScenarioColumn(tableName: "Bill" | "Upgrade"): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND column_name = 'sourceScenarioItemId'
    ) AS "exists";
  `;

  return rows[0]?.exists === true;
}

async function clearDuplicateSourceIds(tableName: "Bill" | "Upgrade"): Promise<number> {
  const hasColumn = await hasSourceScenarioColumn(tableName);
  if (!hasColumn) {
    console.log(`Skipped ${tableName} duplicate cleanup, sourceScenarioItemId is not present yet.`);
    return 0;
  }

  const result = await prisma.$executeRawUnsafe(`
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY "sourceScenarioItemId"
          ORDER BY "createdAt" ASC, id ASC
        ) AS rank_order
      FROM "${tableName}"
      WHERE "sourceScenarioItemId" IS NOT NULL
    )
    UPDATE "${tableName}" target
    SET "sourceScenarioItemId" = NULL
    FROM ranked
    WHERE target.id = ranked.id
      AND ranked.rank_order > 1;
  `);

  return Number(result);
}

async function main(): Promise<void> {
  const clearedBillDuplicates = await clearDuplicateSourceIds("Bill");
  const clearedUpgradeDuplicates = await clearDuplicateSourceIds("Upgrade");

  console.log(
    `Prepared sourceScenarioItemId uniqueness. Bill duplicates cleared: ${clearedBillDuplicates}. Upgrade duplicates cleared: ${clearedUpgradeDuplicates}.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
