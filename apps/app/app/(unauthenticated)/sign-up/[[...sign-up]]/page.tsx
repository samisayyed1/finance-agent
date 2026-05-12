import { createMetadata } from "@ai-cfo/seo/metadata";
import type { Metadata } from "next";
import dynamic from "next/dynamic";

const title = "Create an account";
const description = "Twenty seconds. Then we'll wire up your data.";

const SignUp = dynamic(() =>
  import("@ai-cfo/auth/components/sign-up").then((mod) => mod.SignUp)
);

export const metadata: Metadata = createMetadata({ title, description });

const SignUpPage = () => (
  <div className="space-y-8">
    <div className="space-y-3">
      <p className="font-medium font-mono text-[10px] text-zinc-500 uppercase tracking-[0.16em]">
        SIGN UP
      </p>
      <h1 className="font-light text-[32px] text-zinc-50 tracking-[-0.02em]">
        Twenty seconds, then we wire up your data.
      </h1>
      <p className="text-[14px] text-zinc-400">
        First briefing lands in your inbox tomorrow morning.
      </p>
    </div>
    <SignUp />
  </div>
);

export default SignUpPage;
