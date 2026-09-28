import { notFound } from "next/navigation";
import { PublicPage } from "@/components/public";
import { LiveAuthPage } from "@/components/live";

const allowed = ["methods", "how-it-works", "documentation", "sign-in", "sign-up"];

export default async function Page({
  params
}: {
  params: Promise<{ publicPage: string }>;
}) {
  const { publicPage } = await params;
  if (!allowed.includes(publicPage)) notFound();
  if (publicPage === "sign-in" || publicPage === "sign-up") {
    return <LiveAuthPage signup={publicPage === "sign-up"} />;
  }
  return <PublicPage page={publicPage} />;
}
