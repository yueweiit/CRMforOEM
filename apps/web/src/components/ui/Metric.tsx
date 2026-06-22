import type { ReactNode } from "react";

type MetricProps = {
  icon: ReactNode;
  label: string;
  value: number | string;
  tone: string;
};

export function Metric({ icon, label, value, tone }: MetricProps) {
  return (
    <section className={`metric ${tone}`}>
      <span>{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </section>
  );
}
