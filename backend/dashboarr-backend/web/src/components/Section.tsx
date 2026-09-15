import type { ReactNode } from "react";

interface Props {
  title: string;
  count?: number;
  hint?: string;
  empty?: string;
  isEmpty: boolean;
  children: ReactNode;
}

export function Section({ title, count, hint, empty, isEmpty, children }: Props) {
  return (
    <section className="card">
      <header className="card-header">
        <h2>
          {title}
          {count !== undefined ? <span className="count">{count}</span> : null}
        </h2>
        {hint ? <p className="hint">{hint}</p> : null}
      </header>
      {isEmpty ? <p className="empty">{empty ?? "Nothing yet."}</p> : <div className="table-wrap">{children}</div>}
    </section>
  );
}
