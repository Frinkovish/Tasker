import { Compass } from "lucide-react";
import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-3">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Compass className="size-5" aria-hidden />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">
            Sign in to WorkPilot
          </h1>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
