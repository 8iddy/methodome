import { notFound } from "next/navigation";
import { LiveProjectPage } from "@/components/live";

const sections = [
  "overview",
  "protocol",
  "instruments",
  "data",
  "data-preparation",
  "study-design",
  "variables",
  "analysis-plan",
  "analysis",
  "results",
  "reports",
  "audit-trail",
  "settings"
];

export default async function Page({
  params
}: {
  params: Promise<{ projectId: string; section: string }>;
}) {
  const { projectId, section } = await params;
  if (!sections.includes(section)) notFound();
  return <LiveProjectPage projectId={projectId} section={section} />;
}
