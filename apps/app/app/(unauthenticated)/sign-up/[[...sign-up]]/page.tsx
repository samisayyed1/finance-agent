import { createMetadata } from "@ai-cfo/seo/metadata";
import type { Metadata } from "next";
import dynamic from "next/dynamic";

const title = "Create an account";
const description = "Enter your details to get started.";
const SignUp = dynamic(() =>
  import("@ai-cfo/auth/components/sign-up").then((mod) => mod.SignUp)
);

export const metadata: Metadata = createMetadata({ title, description });

const SignUpPage = () => <SignUp />;

export default SignUpPage;
