"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { getProject, signOut } from "@/lib/api";
import type { Maturity } from "@/lib/types";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("methodome-theme", next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === "dark" ? "Use light mode" : "Use dark mode"}
      title={theme === "dark" ? "Use light mode" : "Use dark mode"}
    >
      <span aria-hidden="true">{theme === "dark" ? "○" : "●"}</span>
      <span>{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}

export function Mark() {
  return (
    <Link href="/" className="brand" aria-label="Methodome home">
      <span className="mark" aria-hidden="true">m</span>
      <span>Methodome</span>
    </Link>
  );
}

export function Button({
  children,
  href,
  variant = "primary",
  type = "button",
  onClick
}: {
  children: ReactNode;
  href?: string;
  variant?: "primary" | "secondary" | "quiet";
  type?: "button" | "submit";
  onClick?: () => void;
}) {
  const className = `button ${variant}`;
  return href ? (
    <Link href={href} className={className}>{children}</Link>
  ) : (
    <button type={type} className={className} onClick={onClick}>{children}</button>
  );
}

export function Badge({
  children,
  kind = "neutral"
}: {
  children: ReactNode;
  kind?: "success" | "warning" | "danger" | "blue" | "neutral" | "teal";
}) {
  return <span className={`badge ${kind}`}>{children}</span>;
}

export function MethodBadge({ maturity }: { maturity: Maturity }) {
  return (
    <Badge kind={maturity === "Validated" ? "success" : maturity === "Supported" ? "blue" : "warning"}>
      {maturity}
    </Badge>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="lead">{description}</p>}
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </div>
  );
}

export function Stage({ compact = false }: { compact?: boolean }) {
  const labels = ["Protocol", "Data", "Design", "Mappings", "Plan", "Analysis"];
  return (
    <div className={`stage ${compact ? "compact" : ""}`} aria-label="Project record">
      {labels.map((label) => <span key={label}>{label}</span>)}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const match = path.match(/^\/app\/projects\/([^/]+)/);
  const projectId = match?.[1] ?? null;
  const [projectName, setProjectName] = useState("Research project");

  useEffect(() => {
    if (!projectId || projectId === "new") {
      setProjectName("Research project");
      return;
    }
    getProject(projectId)
      .then((project) => setProjectName(project.name))
      .catch(() => setProjectName("Research project"));
  }, [projectId]);

  async function logout() {
    try {
      await signOut();
    } finally {
      window.location.href = "/sign-in";
    }
  }

  const projectBase = projectId && projectId !== "new" ? `/app/projects/${projectId}` : null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-main">
          <Mark />

          <nav className="main-nav" aria-label="Main navigation">
            <Nav href="/app/projects" label="Projects" active={path === "/app/projects" || path === "/app/projects/new"} />
            <Nav href="/app/methods" label="Methods" active={path === "/app/methods"} />
            <Nav href="/app/history" label="History" active={path === "/app/history"} />
            <Nav href="/app/documentation" label="Documentation" active={path === "/app/documentation"} />
          </nav>

          {projectBase && (
            <div className="project-rail">
              <div className="project-rail-title">
                <small>ACTIVE STUDY</small>
                <strong title={projectName}>{projectName}</strong>
              </div>

              <nav className="project-primary-nav" aria-label="Project navigation">
                <Nav href={`${projectBase}/overview`} label="Workspace" active={path.endsWith("/overview")} />
                <Nav href={`${projectBase}/protocol`} label="Sources" active={path.endsWith("/protocol") || path.endsWith("/instruments")} />
                <Nav href={`${projectBase}/data`} label="Data" active={path.endsWith("/data") || path.endsWith("/data-preparation")} />
                <Nav href={`${projectBase}/analysis`} label="Analysis" active={path.endsWith("/analysis") || path.endsWith("/analysis-plan")} />
                <Nav href={`${projectBase}/results`} label="Results" active={path.endsWith("/results") || path.endsWith("/reports")} />
              </nav>

              <details className="inspect-nav" open={["study-design", "variables", "audit-trail", "settings"].some((slug) => path.endsWith(`/${slug}`))}>
                <summary>Inspect study record</summary>
                <nav>
                  <Nav href={`${projectBase}/study-design`} label="Study design" active={path.endsWith("/study-design")} />
                  <Nav href={`${projectBase}/variables`} label="Variable mapping" active={path.endsWith("/variables")} />
                  <Nav href={`${projectBase}/analysis-plan`} label="Analysis plan" active={path.endsWith("/analysis-plan")} />
                  <Nav href={`${projectBase}/audit-trail`} label="Audit record" active={path.endsWith("/audit-trail")} />
                  <Nav href={`${projectBase}/settings`} label="Project settings" active={path.endsWith("/settings")} />
                </nav>
              </details>
            </div>
          )}
        </div>

        <div className="sidebar-foot">
          <ThemeToggle />
          <button className="signout-button" onClick={() => void logout()}>Sign out</button>
        </div>
      </aside>

      <section className="app-area">
        <header className="app-top">
          <div className="crumb">
            <Link href="/app/projects">Projects</Link>
            {projectBase && (
              <>
                <span>/</span>
                <Link href={`${projectBase}/overview`}>{projectName}</Link>
              </>
            )}
          </div>
          <span className="top-status">Research analysis system</span>
        </header>
        {children}
      </section>
    </div>
  );
}

function Nav({
  href,
  label,
  active
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link href={href} className={active ? "nav-item active" : "nav-item"}>
      <span>{label}</span>
    </Link>
  );
}
