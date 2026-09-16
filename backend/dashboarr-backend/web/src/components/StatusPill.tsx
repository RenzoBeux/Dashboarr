export type Tone = "neutral" | "success" | "warning" | "danger" | "primary";

interface Props {
  tone: Tone;
  children: React.ReactNode;
  title?: string;
}

export function StatusPill({ tone, children, title }: Props) {
  return (
    <span className={`pill pill-${tone}`} title={title}>
      {children}
    </span>
  );
}
