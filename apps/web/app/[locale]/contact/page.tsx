import { getDictionary } from "@ai-cfo/internationalization";
import { createMetadata } from "@ai-cfo/seo/metadata";
import type { Metadata } from "next";
import { ContactForm } from "./components/contact-form";

interface ContactProps {
  params: Promise<{
    locale: string;
  }>;
}

export const generateMetadata = async ({
  params,
}: ContactProps): Promise<Metadata> => {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return createMetadata(dictionary.web.contact.meta);
};

const Contact = async ({ params }: ContactProps) => {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return <ContactForm dictionary={dictionary} />;
};

export default Contact;
