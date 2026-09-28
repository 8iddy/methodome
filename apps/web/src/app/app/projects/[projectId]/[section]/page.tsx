import { notFound } from "next/navigation";
import { ProjectPage } from "@/components/workspace";
const sections = ["overview", "protocol", "instruments", "data", "data-preparation", "study-design", "variables", "analysis-plan", "analysis", "results", "reports", "audit-trail", "settings"];
export default async function Page({ params }: { params: Promise<{ projectId: string; section: string }> }) { const { section } = await params; if (!sections.includes(section)) notFound(); return <ProjectPage section={section} />; }
