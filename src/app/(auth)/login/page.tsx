import type { Metadata } from "next";
import { AuthForm } from "../auth-form";
import { DEMO_PASSWORD } from "@/server/db/demo";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthForm
      mode="login"
      demo={[
        { email: "owner@demo.stockpilot.app", password: DEMO_PASSWORD },
        { email: "staff@demo.stockpilot.app", password: DEMO_PASSWORD },
      ]}
    />
  );
}
