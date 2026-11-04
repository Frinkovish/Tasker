"use client";

import { useActionState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, type SignInState } from "@/lib/auth/actions";

const INITIAL_STATE: SignInState = { error: null, email: "", signedIn: false };

export function LoginForm() {
  const [state, action, isPending] = useActionState(signIn, INITIAL_STATE);

  useEffect(() => {
    if (state.signedIn) {
      // A full page load, so the typed password doesn't stay in a hidden page.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/dashboard");
    }
  }, [state.signedIn]);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          defaultValue={state.email}
          aria-invalid={state.error !== null}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error !== null}
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button
        type="submit"
        disabled={isPending || state.signedIn}
        className="w-full"
      >
        {isPending || state.signedIn ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
