import { NextRequest } from "next/server";

import { getSession } from "@/lib/auth/session";
import { buildCleanedImportCsv, getBudgetImportBatchCleanedRows } from "@/lib/budget";

type RouteContext = {
  params: Promise<{ batchId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { batchId } = await context.params;
  const rows = await getBudgetImportBatchCleanedRows(batchId);
  if (!rows) {
    return new Response("Cleaned data unavailable", { status: 404 });
  }

  const format = request.nextUrl.searchParams.get("format");
  if (format === "json") {
    return Response.json({ rows });
  }

  const csv = buildCleanedImportCsv(rows);
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cleaned-import-${batchId}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
