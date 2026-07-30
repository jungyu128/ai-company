"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(
    params.get("error") === "config" ? "AI_COMPANY_OWNER_TOKEN is not configured." : null
  );
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/owner-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      router.replace(params.get("next") || "/builder/hq");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        background: "linear-gradient(180deg,#ebe6dc,#f3f0ea)",
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: "min(100%, 26rem)",
          border: "1px solid #d9d2c5",
          borderRadius: "1.25rem",
          background: "#fcfbf8",
          padding: "1.5rem",
        }}
      >
        <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "#0f6b5c" }}>
          AI Company
        </p>
        <h1 style={{ margin: "0.5rem 0 0", fontSize: "1.75rem" }}>Owner access</h1>
        <p style={{ margin: "0.75rem 0 0", color: "#5c6578", fontSize: 14 }}>
          Private headquarters. Enter the owner token from your environment.
        </p>
        <label style={{ display: "block", marginTop: "1.25rem", fontSize: 12, color: "#5c6578" }}>
          Owner token
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            autoComplete="current-password"
            style={{
              display: "block",
              width: "100%",
              marginTop: 6,
              padding: "0.65rem 0.75rem",
              borderRadius: 10,
              border: "1px solid #d9d2c5",
            }}
          />
        </label>
        {error ? (
          <p style={{ marginTop: 12, color: "#9a3412", fontSize: 13 }}>{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          style={{
            marginTop: 16,
            width: "100%",
            border: 0,
            borderRadius: 10,
            padding: "0.7rem 1rem",
            background: "#0f6b5c",
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
            opacity: pending ? 0.6 : 1,
          }}
        >
          {pending ? "Checking…" : "Enter HQ"}
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main style={{ padding: 40 }}>Loading…</main>}>
      <LoginForm />
    </Suspense>
  );
}
