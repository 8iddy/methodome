import { Badge } from "@/components/ui";
import { documentationSections } from "@/content/documentation";

export function DocumentationContent() {
  return (
    <div className="documentation-content">
      <aside className="documentation-nav">
        <p className="eyebrow">ON THIS PAGE</p>
        <nav aria-label="Documentation contents">
          {documentationSections.map((section, index) => (
            <a key={section.id} href={`#${section.id}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>{section.title}
            </a>
          ))}
        </nav>
      </aside>

      <div className="documentation-body">
      <section className="documentation-principle">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">PRODUCT PRINCIPLE</p>
            <h2>Research interpretation and statistical computation are separate.</h2>
          </div>
          <Badge kind="teal">Methodome</Badge>
        </div>
        <p>
          Methodome connects protocol, instruments, datasets, research decisions,
          deterministic method rules, analysis execution and provenance. Language
          models may extract, map, suggest and explain. Statistical values come from
          deterministic statistical software.
        </p>
      </section>

      {documentationSections.map((section, index) => (
        <section className="documentation-section" id={section.id} key={section.id}>
          <span className="documentation-index">{String(index + 1).padStart(2, "0")}</span>
          <h2>{section.title}</h2>
          <p>{section.summary}</p>
          <ul>
            {section.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>
      ))}
      </div>
    </div>
  );
}
