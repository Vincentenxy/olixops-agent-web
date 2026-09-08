import type { ReactNode } from 'react';

export function Panel({
  title,
  actions,
  children,
  className = '',
}: {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-toolbar">
        <h2>{title}</h2>
        <div className="panel-actions">{actions}</div>
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}
