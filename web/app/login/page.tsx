import { redirect } from "next/navigation";

import { loginAction } from "@/app/actions";
import { getSession } from "@/lib/auth/session";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: Props) {
  const session = await getSession();
  if (session) {
    redirect("/");
  }

  const params = await searchParams;
  const showError = params.error === "invalid_credentials";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f9fc] px-4">
      <div className="w-full max-w-md rounded-xl border border-[#dbe2ea] bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-[#1f2a37]">HomeDashboard Login</h1>
        <p className="mt-1 text-sm text-[#5f7387]">Use your household account to continue.</p>
        {showError ? (
          <p className="mt-4 rounded-md border border-[#fbcaca] bg-[#fff4f4] px-3 py-2 text-sm text-[#b91c1c]">
            Invalid username or password.
          </p>
        ) : null}
        <form action={loginAction} className="mt-4 grid gap-3">
          <input
            name="username"
            placeholder="Username"
            autoComplete="username"
            className="rounded border border-[#dbe2ea] px-3 py-2"
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            className="rounded border border-[#dbe2ea] px-3 py-2"
          />
          <button type="submit" className="rounded bg-[#2d7ff9] px-3 py-2 font-medium text-white">
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
