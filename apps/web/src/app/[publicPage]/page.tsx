import { notFound } from "next/navigation";
import { PublicPage } from "@/components/public";
const allowed = ["methods", "how-it-works", "documentation", "sign-in", "sign-up"];
export default async function Page({ params }: { params: Promise<{ publicPage: string }> }) { const { publicPage } = await params; if (!allowed.includes(publicPage)) notFound(); return <PublicPage page={publicPage} />; }
