"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authenticateUser } from "@/lib/auth/user-auth";
import { clearSession, createSession, getSession } from "@/lib/auth/session";
import { toCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { monthKeyFromDate } from "@/lib/time";

const addBillSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  amount: z.string().min(1),
  recurrenceRule: z.enum(["monthly_last_day"]).or(z.string().regex(/^monthly_day_([1-9]|[12]\d|3[01])$/)),
});

const addUpgradeSchema = z.object({
  title: z.string().min(1),
  category: z.string().min(1),
  cost: z.string().min(1),
});

const paymentSchema = z.object({
  billId: z.string().min(1),
});

export async function loginAction(formData: FormData): Promise<void> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  const user = await authenticateUser(username, password);
  if (!user) {
    redirect("/login?error=invalid_credentials");
  }

  await createSession(user);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}

async function requireSession() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function addBillAction(formData: FormData): Promise<void> {
  await requireSession();
  const parsed = addBillSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    category: String(formData.get("category") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    recurrenceRule: String(formData.get("recurrenceRule") ?? ""),
  });

  if (!parsed.success) {
    redirect("/?error=invalid_bill_input");
  }

  await prisma.bill.create({
    data: {
      name: parsed.data.name.trim(),
      category: parsed.data.category.trim(),
      amountCents: toCents(parsed.data.amount),
      recurrenceRule: parsed.data.recurrenceRule,
    },
  });

  revalidatePath("/");
}

export async function markPaidAction(formData: FormData): Promise<void> {
  await requireSession();

  const parsed = paymentSchema.safeParse({
    billId: String(formData.get("billId") ?? ""),
  });

  if (!parsed.success) {
    redirect("/?error=invalid_payment_input");
  }

  const bill = await prisma.bill.findUnique({
    where: { id: parsed.data.billId },
    select: { id: true, amountCents: true },
  });

  if (!bill) {
    redirect("/?error=bill_not_found");
  }

  const now = new Date();
  const monthKey = monthKeyFromDate(now);
  const paymentEventKey = `${monthKey}:${bill.id}`;

  try {
    await prisma.payment.create({
      data: {
        billId: bill.id,
        amountCents: bill.amountCents,
        paidAt: now,
        paymentEventKey,
      },
    });
  } catch {
    // Duplicate click or replay for same month should be a no-op.
  }

  revalidatePath("/");
}

export async function addUpgradeAction(formData: FormData): Promise<void> {
  await requireSession();
  const parsed = addUpgradeSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    category: String(formData.get("category") ?? ""),
    cost: String(formData.get("cost") ?? ""),
  });

  if (!parsed.success) {
    redirect("/?error=invalid_upgrade_input");
  }

  await prisma.upgrade.create({
    data: {
      title: parsed.data.title.trim(),
      category: parsed.data.category.trim(),
      costCents: toCents(parsed.data.cost),
      loggedAt: new Date(),
    },
  });

  revalidatePath("/");
}
