import { createMetadata } from "@ai-cfo/seo/metadata";
import type { Metadata } from "next";
import dynamic from "next/dynamic";

const title = "Sign in";
const description = "Welcome back. Your money's been waiting.";

const SignIn = dynamic(() =>
  import("@ai-cfo/auth/components/sign-in").then((mod) => mod.SignIn)
);

export const metadata: Metadata = createMetadata({ title, description });

const SignInPage = () => (
  <div className="space-y-8">
    <div className="space-y-3">
      <p className="font-medium font-mono text-[10px] text-zinc-500 uppercase tracking-[0.16em]">
        SIGN IN
      </p>
      <h1 className="font-light text-[32px] text-zinc-50 tracking-[-0.02em]">
        Welcome back.
      </h1>
      <p className="text-[14px] text-zinc-400">
        Your money&apos;s been waiting.
      </p>
    </div>
    <SignIn />
  </div>
);

export default SignInPage;
