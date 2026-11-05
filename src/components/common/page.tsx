import type { ReactNode } from "react";

export function PageContainer({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 md:px-8 md:py-8">
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight break-words">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm break-words text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions}
    </header>
  );
}

interface SectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function Section({ title, description, children }: SectionProps) {
  return (
    <section className="min-w-0 space-y-3">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
