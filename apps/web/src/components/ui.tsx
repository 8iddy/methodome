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
    <button type="button" className="theme-toggle" onClick={toggle}
      aria-label={theme === "dark" ? "Use light mode" : "Use dark mode"}
      title={theme === "dark" ? "Use light mode" : "Use dark mode"}>
      <span className="theme-icon" aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
      <span>{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}

export function Mark() {
  return <Link href="/" className="brand" aria-label="Methodome home">
    <span className="mark" aria-hidden="true">M</span><span>Methodome</span>
  </Link>;
}

export function Button({ children, href, variant = "primary", type = "button", onClick }: {
  children: ReactNode;
  href?: string;
  variant?: "primary" | "secondary" | "quiet";
  type?: "button" | "submit";
  onClick?: () => void;
}) {
  const className = `button ${variant}`;
  return href ? <Link href={href} className={className}>{children}</Link> :
    <button type={type} className={className} onClick={onClick}>{children}</button>;
}

export function Badge({ children, kind = "neutral" }: {
  children: ReactNode;
  kind?: "success" | "warning" | "danger" | "blue" | "neutral" | "teal";
}) {
  return <span className={`badge ${kind}`}>{children}</span>;
}

export function MethodBadge({ maturity }: { maturity: Maturity }) {
  return <Badge kind={maturity === "Validated" ? "success" : maturity === "Supported" ? "blue" : "warning"}>{maturity}</Badge>;
}

export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return <header className="page-header">
    <div className="page-heading-copy">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {description && <p className="lead">{description}</p>}
    </div>
    {actions && <div className="header-actions">{actions}</div>}
  </header>;
}

export function Stage({ compact = false }: { compact?: boolean }) {
  const labels = ["Protocol", "Data", "Preparation", "Design", "Plan", "Analysis"];
  return <div className={`stage ${compact ? "compact" : ""}`} aria-label="Project stage">
    {labels.map((label, index) => <span key={label} className={index < 4 ? "done" : index === 4 ? "active" : ""}>
      <i aria-hidden="true">{index < 4 ? "✓" : index + 1}</i>{label}
    </span>)}
  </div>;
}

const globalItems = [
  ["Projects", "/app/projects"],
  ["Methods library", "/app/methods"],
  ["Analysis history", "/app/history"],
  ["Documentation", "/app/documentation"],
  ["Account settings", "/app/settings"]
] as const;

const projectGroups: Array<{
  label: string;
  items: Array<readonly [string, string]>;
}> = [
  { label: "Research inputs", items: [["Overview", "overview"], ["Protocol", "protocol"], ["Instruments", "instruments"]] },
  { label: "Data layer", items: [["Data", "data"], ["Data preparation", "data-preparation"]] },
  { label: "Research design", items: [["Study design", "study-design"], ["Variable mapping", "variables"], ["Analysis plan", "analysis-plan"]] },
  { label: "Execution and output", items: [["Analysis", "analysis"], ["Results", "results"], ["Reports", "reports"]] }
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const match = path.match(/^\/app\/projects\/([^/]+)/);
  const projectId = match?.[1] ?? null;
  const sectionSlug = path.split("/").at(-1) ?? "";
  const sectionName = projectGroups.flatMap((group) => group.items).find(([, slug]) => slug === sectionSlug)?.[0];
  const [projectName, setProjectName] = useState("Active project");
  const [navigationOpen, setNavigationOpen] = useState(false);

  useEffect(() => setNavigationOpen(false), [path]);

  useEffect(() => {
    if (!projectId || projectId === "new") {
      setProjectName("Active project");
      return;
    }
    getProject(projectId).then((project) => setProjectName(project.name)).catch(() => setProjectName("Active project"));
  }, [projectId]);

  async function logout() {
    try { await signOut(); } finally { window.location.href = "/sign-in"; }
  }

  return <div className="app-shell">
    <button type="button" className="sidebar-scrim" data-open={navigationOpen}
      aria-label="Close navigation" onClick={() => setNavigationOpen(false)} />
    <aside className="sidebar" data-open={navigationOpen}>
      <div className="sidebar-scroll">
        <div className="sidebar-brand-row">
          <Mark />
          <button type="button" className="sidebar-close" onClick={() => setNavigationOpen(false)} aria-label="Close navigation">×</button>
        </div>
        <nav className="main-nav" aria-label="Workspace navigation">
          <p className="nav-label">Workspace</p>
          {globalItems.map(([label, href]) => <Nav key={href} href={href} label={label} active={path === href} />)}
        </nav>
        {projectId && projectId !== "new" && <div className="project-navigation">
          <div className="project-identity"><span>Current project</span><strong>{projectName}</strong></div>
          {projectGroups.map((group) => <nav className="project-nav" aria-label={group.label} key={group.label}>
            <p className="nav-label">{group.label}</p>
            {group.items.map(([label, slug]) => <Nav key={slug} href={`/app/projects/${projectId}/${slug}`} label={label} active={path.endsWith(`/${slug}`)} />)}
          </nav>)}
          <nav className="project-nav" aria-label="Project records">
            <p className="nav-label">Records and controls</p>
            <Nav href={`/app/projects/${projectId}/audit-trail`} label="Audit trail" active={path.endsWith("/audit-trail")} />
            <Nav href={`/app/projects/${projectId}/settings`} label="Project settings" active={path.endsWith("/settings")} />
          </nav>
        </div>}
      </div>
      <div className="profile">
        <span className="avatar" aria-hidden="true">M</span>
        <span><strong>Research workspace</strong><small>Methodome account</small></span>
        <button className="text-button" onClick={() => void logout()}>Sign out</button>
      </div>
    </aside>
    <section className="app-area">
      <header className="app-top">
        <div className="app-top-context">
          <button type="button" className="sidebar-trigger" onClick={() => setNavigationOpen(true)} aria-label="Open navigation" aria-expanded={navigationOpen}>☰</button>
          <div className="crumb" aria-label="Breadcrumb">
            <Link href="/app/projects">Projects</Link>
            {projectId && projectId !== "new" && <><span>/</span><strong>{projectName}</strong></>}
            {sectionName && <><span>/</span><em>{sectionName}</em></>}
          </div>
        </div>
        <div className="app-top-actions"><span className="workspace-status"><i />Research workspace</span><ThemeToggle /></div>
      </header>
      {children}
    </section>
  </div>;
}

function Nav({ href, label, active }: { href: string; label: string; active: boolean }) {
  return <Link href={href} className={active ? "nav-item active" : "nav-item"} aria-current={active ? "page" : undefined}><span>{label}</span></Link>;
}
