import type { ReactNode } from "react";

interface Props {
  title: string;
  count?: number;
  hint?: string;
  empty?: string;
  isEmpty: boolean;
  /** Rendered at the right of the header (a button, typically). */
  action?: ReactNode;
  children: ReactNode;
}

export function Section({ title, count, hint, empty, isEmpty, action, children }: Props) {
  return (
    <section className="card">
      <header className="card-header">
        <div className="card-header-row">
          <h2>
            {title}
            {count !== undefined ? <span className="count">{count}</span> : null}
          </h2>
          {action ?? null}
        </div>
        {hint ? <p className="hint">{hint}</p> : null}
      </header>
      {isEmpty ? <p className="empty">{empty ?? "Nothing yet."}</p> : <div className="table-wrap">{children}</div>}
    </section>
  );
}
