import { redirect } from "next/navigation";
import { todaysTitle } from "@/lib/article";
import { articleHref } from "@/lib/paras";

export const dynamic = "force-dynamic";

/** The homepage always forwards to today's article at its own shareable URL. */
export default async function Home() {
  const title = await todaysTitle().catch(() => null);
  if (title) redirect(articleHref(title));

  return (
    <main>
      <p className="kicker">Ancient Daily</p>
      <h1>No article yet</h1>
      <p>The first one arrives after the daily job runs.</p>
    </main>
  );
}
