"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { getProject, signOut } from "@/lib/api";
import type { Maturity } from "@/lib/types";

export function Mark() { return <Link href="/" className="brand" aria-label="Methodome home"><span className="mark">M</span><span>Methodome</span></Link>; }
export function Button({ children, href, variant = "primary", type = "button", onClick }: { children: ReactNode; href?: string; variant?: "primary" | "secondary" | "quiet"; type?: "button" | "submit"; onClick?: () => void }) { const className = `button ${variant}`; return href ? <Link href={href} className={className}>{children}</Link> : <button type={type} className={className} onClick={onClick}>{children}</button>; }
export function Badge({ children, kind = "neutral" }: { children: ReactNode; kind?: "success" | "warning" | "danger" | "blue" | "neutral" | "teal" }) { return <span className={`badge ${kind}`}>{children}</span>; }
export function MethodBadge({ maturity }: { maturity: Maturity }) { return <Badge kind={maturity === "Validated" ? "success" : maturity === "Supported" ? "blue" : "warning"}>{maturity}</Badge>; }
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) { return <div className="page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="lead">{description}</p>}</div>{actions && <div className="header-actions">{actions}</div>}</div>; }
export function Stage({ compact = false }: { compact?: boolean }) { const labels = ["Protocol", "Data", "Cleaning", "Design", "Plan 6/8", "Analysis"]; return <div className={`stage ${compact ? "compact" : ""}`} aria-label="Project stage">{labels.map((label, i) => <span key={label} className={i < 4 ? "done" : i === 4 ? "active" : ""}>{i < 4 ? "✓ " : ""}{label}</span>)}</div>; }
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const match = path.match(/^\/app\/projects\/([^/]+)/);
  const projectId = match?.[1] ?? null;
  const [projectName, setProjectName] = useState("Active project");

  useEffect(() => {
    if (!projectId || projectId === "new") {
      setProjectName("Active project");
      return;
    }
    getProject(projectId)
      .then((project) => setProjectName(project.name))
      .catch(() => setProjectName("Active project"));
  }, [projectId]);

  const projectItems = [
    ["Overview", "overview"],
    ["Protocol", "protocol"],
    ["Instruments", "instruments"],
    ["Data", "data"],
    ["Data Preparation", "data-preparation"],
    ["Study Design", "study-design"],
    ["Variables", "variables"],
    ["Analysis Plan", "analysis-plan"],
    ["Analysis", "analysis"],
    ["Results", "results"],
    ["Reports", "reports"]
  ];

  async function logout() {
    try {
      await signOut();
    } finally {
      window.location.href = "/sign-in";
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <Mark />
          <nav className="main-nav" aria-label="Main navigation">
            <Nav href="/app/projects" label="Projects" active={path.startsWith("/app/projects")} />
            <Nav href="/app/methods" label="Methods" active={path === "/app/methods"} />
            <Nav href="/app/history" label="Analysis History" active={path === "/app/history"} />
            <Nav href="/app/documentation" label="Documentation" active={path === "/app/documentation"} />
          </nav>
          {projectId && projectId !== "new" && (
            <>
              <div className="nav-label">Active study</div>
              <div className="study-name">{projectName}</div>
              <nav className="project-nav" aria-label="Project navigation">
                {projectItems.map(([label, slug]) => (
                  <Nav
                    key={slug}
                    href={`/app/projects/${projectId}/${slug}`}
                    label={label}
                    active={path.endsWith(`/${slug}`)}
                  />
                ))}
              </nav>
              <div className="nav-label spaced">Project records</div>
              <nav className="project-nav">
                <Nav
                  href={`/app/projects/${projectId}/audit-trail`}
                  label="Audit Trail"
                  active={path.endsWith("/audit-trail")}
                />
                <Nav
                  href={`/app/projects/${projectId}/settings`}
                  label="Project Settings"
                  active={path.endsWith("/settings")}
                />
              </nav>
            </>
          )}
        </div>
        <div className="profile">
          <span className="avatar">M</span>
          <span>
            <strong>Methodome</strong>
            <small>Research workspace</small>
          </span>
          <button className="text-button" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </aside>
      <section className="app-area">
        <header className="app-top">
          <div className="crumb">
            Projects
            {projectId && projectId !== "new" && (
              <>
                <span>/</span> {projectName}
              </>
            )}
          </div>
          <Badge kind="teal">Research workspace</Badge>
        </header>
        {children}
      </section>
    </div>
  );
}
function Nav({ href, label, active }: { href: string; label: string; active: boolean }) { return <Link href={href} className={active ? "nav-item active" : "nav-item"}>{label}</Link>; }
