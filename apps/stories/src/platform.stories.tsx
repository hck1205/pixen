import { getSupportReport, summariseSupport, type SurfaceReport } from "@pixen/core";
import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Platform",
} satisfies StoryDefault;

/**
 * What this browser can do, read from the browser you are looking at.
 *
 * Open it in an older Safari or a locked-down browser and the fallbacks in play
 * are listed here rather than discovered during an export.
 */
export const SupportReport: Story = () => {
  const report = getSupportReport();

  return (
    <div style={{ display: "grid", gap: 20, font: "400 13px/1.6 system-ui, sans-serif", maxWidth: 860 }}>
      <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>{summariseSupport(report)}</p>
      <Surface title="Engine — decode, edit, export" report={report.engine} />
      <Surface title="UI — the custom element" report={report.ui} />
      <p style={{ margin: 0, opacity: 0.65 }}>
        Levels: <code>full</code> uses every fast path, <code>degraded</code> falls back but works,
        <code> unsupported</code> means a host should show a plain upload control instead.
      </p>
    </div>
  );
};

function Surface({ title, report }: { title: string; report: SurfaceReport }) {
  return (
    <section style={{ display: "grid", gap: 8 }}>
      <h2 style={{ margin: 0, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.04em", opacity: 0.7 }}>
        {title} · <Level level={report.level} />
      </h2>

      {report.blockers.length === 0 && report.degradations.length === 0 && (
        <p style={{ margin: 0, opacity: 0.7 }}>Every fast path is available.</p>
      )}

      {report.blockers.map((blocker) => (
        <p key={blocker.feature} style={{ margin: 0 }}>
          <code>{blocker.feature}</code> is missing — {blocker.reason}
        </p>
      ))}

      {report.degradations.map((degradation) => (
        <p key={degradation.feature} style={{ margin: 0, opacity: 0.85 }}>
          <code>{degradation.feature}</code> is missing — {degradation.consequence}
        </p>
      ))}
    </section>
  );
}

function Level({ level }: { level: SurfaceReport["level"] }) {
  const colour = level === "full" ? "#2fb673" : level === "degraded" ? "#f2a007" : "#ef3e36";
  return <span style={{ color: colour, fontWeight: 700 }}>{level}</span>;
}
