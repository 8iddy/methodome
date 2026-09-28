import { DocumentationContent } from "@/components/documentation";
import { PageHeader } from "@/components/ui";

export default function AuthenticatedDocumentationPage() {
  return <main className="app-content narrow"><PageHeader eyebrow="DOCUMENTATION" title="Methodome research workflow" description="Product guidance for the capabilities available in this workspace." /><DocumentationContent /></main>;
}
