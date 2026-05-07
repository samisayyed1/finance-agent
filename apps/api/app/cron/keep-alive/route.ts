import { database, eq, pages } from "@ai-cfo/database";

export const GET = async () => {
  const [newPage] = await database
    .insert(pages)
    .values({ name: "cron-temp" })
    .returning({ id: pages.id });

  if (newPage) {
    await database.delete(pages).where(eq(pages.id, newPage.id));
  }

  return new Response("OK", { status: 200 });
};
