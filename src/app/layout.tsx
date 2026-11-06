import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "Beetcode",
  description: "100 curated coding problems. Pick up right where you left off.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <header className="flex h-14 items-center justify-between border-b border-zinc-800 px-5">
          <Link href="/" className="text-lg font-semibold">
            <span className="text-rose-500">Beet</span>code
          </Link>
          <nav className="flex items-center gap-4 text-sm text-zinc-400">
            {user ? (
              <>
                <span className="hidden sm:inline">{user.email}</span>
                <SignOutButton />
              </>
            ) : (
              <Link href="/login" className="rounded-md bg-rose-600 px-3 py-1.5 text-white hover:bg-rose-500">
                Sign in
              </Link>
            )}
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
