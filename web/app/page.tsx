import { redirect } from "next/navigation";

import {
  addBillAction,
  addUpgradeAction,
  logoutAction,
  markPaidAction,
} from "@/app/actions";
import { getSession } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/dashboard";
import { formatCurrency } from "@/lib/money";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: Props) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const params = await searchParams;
  const dashboard = await getDashboardData();

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-[#1f2a37]">
      <header className="border-b border-[#dbe2ea] bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-sm text-[#506173]">HomeDashboard</p>
            <h1 className="text-xl font-semibold">House Ops Command Center</h1>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-[#dbe2ea] bg-white px-3 py-2 text-sm hover:bg-[#f2f5f9]"
            >
              Logout {session.username}
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
        {params.error ? (
          <div className="rounded-md border border-[#fbcaca] bg-[#fff4f4] px-4 py-3 text-sm text-[#b91c1c]">
            Something went wrong with that action. Please review the input and try again.
          </div>
        ) : null}

        <section className="rounded-xl border border-[#dbe2ea] bg-white p-4 sm:p-6">
          <h2 className="text-lg font-semibold">Urgent Actions</h2>
          <p className="mt-1 text-sm text-[#5f7387]">
            Overdue: {dashboard.overdueCount} · Due soon: {dashboard.dueSoonCount} · Unpaid this month:{" "}
            {dashboard.unpaidCount}
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-[#dbe2ea] bg-white p-4">
            <p className="text-sm text-[#5f7387]">Total monthly home cost</p>
            <p className="mt-1 text-2xl font-semibold">{formatCurrency(dashboard.totalMonthlyCostCents)}</p>
          </article>
          <article className="rounded-xl border border-[#dbe2ea] bg-white p-4">
            <p className="text-sm text-[#5f7387]">Utilities total</p>
            <p className="mt-1 text-2xl font-semibold">{formatCurrency(dashboard.utilitiesTotalCents)}</p>
          </article>
          <article className="rounded-xl border border-[#dbe2ea] bg-white p-4">
            <p className="text-sm text-[#5f7387]">Upgrade spend</p>
            <p className="mt-1 text-2xl font-semibold">{formatCurrency(dashboard.upgradesTotalCents)}</p>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-xl border border-[#dbe2ea] bg-white p-4 sm:p-6">
            <h3 className="text-lg font-semibold">Recurring Bills</h3>
            {dashboard.bills.length === 0 ? (
              <p className="rounded-md border border-dashed border-[#dbe2ea] bg-[#f9fbfd] px-4 py-3 text-sm text-[#5f7387]">
                You&apos;re starting strong. Add your first recurring bill.
              </p>
            ) : (
              <ul className="space-y-3">
                {dashboard.bills.map((bill) => (
                  <li key={bill.id} className="rounded-md border border-[#dbe2ea] px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{bill.name}</p>
                        <p className="text-sm text-[#5f7387]">
                          Due {bill.dueDate} · {bill.category}
                        </p>
                      </div>
                      <p className="font-semibold">{formatCurrency(bill.amountCents)}</p>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-sm capitalize text-[#5f7387]">{bill.status.replaceAll("_", " ")}</p>
                      <form action={markPaidAction}>
                        <input type="hidden" name="billId" value={bill.id} />
                        <button
                          type="submit"
                          disabled={bill.isPaid}
                          className="rounded-md bg-[#2d7ff9] px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {bill.isPaid ? "Paid" : "Mark paid"}
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <form action={addBillAction} className="grid gap-2 rounded-md border border-[#dbe2ea] bg-[#f9fbfd] p-3">
              <p className="text-sm font-medium">Quick add bill</p>
              <input name="name" placeholder="Bill name" className="rounded border border-[#dbe2ea] px-3 py-2" />
              <input
                name="category"
                placeholder="Category (utility, mortgage, insurance...)"
                className="rounded border border-[#dbe2ea] px-3 py-2"
              />
              <input
                name="amount"
                placeholder="Amount (e.g. 145.50)"
                className="rounded border border-[#dbe2ea] px-3 py-2"
              />
              <input
                name="recurrenceRule"
                placeholder="monthly_day_15 or monthly_last_day"
                className="rounded border border-[#dbe2ea] px-3 py-2"
              />
              <button type="submit" className="rounded bg-[#1f2a37] px-3 py-2 text-sm font-medium text-white">
                Save bill
              </button>
            </form>
          </div>

          <div className="space-y-4 rounded-xl border border-[#dbe2ea] bg-white p-4 sm:p-6">
            <h3 className="text-lg font-semibold">Upgrades and Recent Activity</h3>
            {dashboard.upgrades.length === 0 ? (
              <p className="rounded-md border border-dashed border-[#dbe2ea] bg-[#f9fbfd] px-4 py-3 text-sm text-[#5f7387]">
                No upgrades logged yet. Add your first home upgrade.
              </p>
            ) : (
              <ul className="space-y-2">
                {dashboard.upgrades.map((upgrade) => (
                  <li key={upgrade.id} className="flex items-center justify-between rounded-md border border-[#dbe2ea] px-4 py-2">
                    <div>
                      <p className="font-medium">{upgrade.title}</p>
                      <p className="text-sm text-[#5f7387]">{upgrade.category}</p>
                    </div>
                    <p className="font-semibold">{formatCurrency(upgrade.costCents)}</p>
                  </li>
                ))}
              </ul>
            )}
            <form action={addUpgradeAction} className="grid gap-2 rounded-md border border-[#dbe2ea] bg-[#f9fbfd] p-3">
              <p className="text-sm font-medium">Quick add upgrade</p>
              <input
                name="title"
                placeholder="Upgrade title"
                className="rounded border border-[#dbe2ea] px-3 py-2"
              />
              <input
                name="category"
                placeholder="Category (safety, comfort, value-add...)"
                className="rounded border border-[#dbe2ea] px-3 py-2"
              />
              <input
                name="cost"
                placeholder="Cost (e.g. 399.99)"
                className="rounded border border-[#dbe2ea] px-3 py-2"
              />
              <button type="submit" className="rounded bg-[#16a34a] px-3 py-2 text-sm font-medium text-white">
                Save upgrade
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
