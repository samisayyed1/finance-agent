import { getDictionary } from "@ai-cfo/internationalization";
import { createMetadata } from "@ai-cfo/seo/metadata";
import type { Metadata } from "next";
import { Anomalies } from "./components/anomalies";
import { FAQ } from "./components/faq";
import { Hero } from "./components/hero";
import { Mechanism } from "./components/mechanism";
import { WaitlistCTA } from "./components/waitlist-cta";
import { WhereItLives } from "./components/where-it-lives";

interface HomeProps {
  params: Promise<{
    locale: string;
  }>;
}

// AI-CFO marketing page. Single-scroll narrative arc:
//   1. Hero        — the hook + waitlist CTA above the fold
//   2. Mechanism   — Iron Rules #1 + #6, the trust story
//   3. Anomalies   — what the system actually catches (Maeve Co. 6)
//   4. WhereItLives— inbox + Slack + WhatsApp (push, not pull)
//   5. FAQ         — the questions operators ask
//   6. WaitlistCTA — second-chance CTA at the bottom
//
// Multi-locale is descoped for the design-partner stage; English copy
// hardcoded in each section. Dictionary call retained for [locale]
// route segment compatibility.
export const generateMetadata = (): Metadata =>
  createMetadata({
    title: "AI Operating CFO",
    description:
      "An AI CFO that can't ship a number without citing the database row. Refund spikes, attribution drift, missing Stripe charges — caught the morning after.",
  });

const Home = async ({ params }: HomeProps) => {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);
  return (
    <>
      <Hero dictionary={dictionary} />
      <Mechanism />
      <Anomalies />
      <WhereItLives />
      <FAQ />
      <WaitlistCTA />
    </>
  );
};

export default Home;
