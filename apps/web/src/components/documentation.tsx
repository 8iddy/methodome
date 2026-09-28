import { Badge } from "@/components/ui";
import { documentationSections } from "@/content/documentation";

export function DocumentationContent() {
  return (
    <div className="documentation-content">
      <section className="panel">
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

      <nav className="panel" aria-label="Documentation contents">
        <p className="eyebrow">CONTENTS</p>
        <div className="documentation-links">
          {documentationSections.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.title}
            </a>
          ))}
        </div>
      </nav>

      {documentationSections.map((section) => (
        <section className="panel" id={section.id} key={section.id}>
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
  );
}
