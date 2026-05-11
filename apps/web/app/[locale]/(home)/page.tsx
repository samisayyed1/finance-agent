import { getDictionary } from "@ai-cfo/internationalization";
import { createMetadata } from "@ai-cfo/seo/metadata";
import type { Metadata } from "next";
import { Hero } from "./components/hero";

interface HomeProps {
  params: Promise<{
    locale: string;
  }>;
}

// AI-CFO landing page. Day 9 Tier 1 polish trimmed the next-forge default
// Cases / Features / Stats / Testimonials / FAQ / CTA sections — every
// one was placeholder copy that telegraphed "fresh next-forge install."
// Hero is the entire page until a designer comes onboard and we have real
// social proof to show.
//
// Multi-locale is also descoped for the design-partner stage; English copy
// is hardcoded in the Hero component. The dictionary call below is kept
// only so the locale segment continues to resolve.
export const generateMetadata = (): Metadata =>
  createMetadata({
    title: "AI Operating CFO",
    description:
      "An AI CFO that can't ship a number without citing the database row. Refund spikes, attribution drift, missing Stripe charges — caught the morning after.",
  });

const Home = async ({ params }: HomeProps) => {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);
  return <Hero dictionary={dictionary} />;
};

export default Home;
