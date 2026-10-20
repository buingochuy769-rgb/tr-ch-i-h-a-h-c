import type { Solution, TaskDef } from '../lib/types';

export default function Solutions({ solutions, tasks, title = 'Đáp án và lời giải' }: { solutions: Solution[]; tasks: TaskDef[]; title?: string }) {
  const rows = solutions.filter((s) => s.answer_text || s.hint);
  if (!rows.length) return null;
  return (
    <section className="card space-y-4">
      <h2 className="text-2xl font-extrabold text-white">{title}</h2>
      {rows.map((s) => {
        const t = tasks.find((x) => x.no === s.task_no);
        return (
          <article key={s.task_no} className="rounded-xl bg-navy-950/60 p-4">
            <p className="font-mono text-sm text-cyan-200/70">
              Hồ sơ #{s.task_no} {s.own && '(của bạn)'}
            </p>
            {t && <p className="mt-1 text-slate-300">{t.prompt}</p>}
            {s.hint && (
              <p className="mt-3 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-amber-100">
                💡 <b>Gợi ý:</b> {s.hint}
              </p>
            )}
            {s.answer_text && (
              <>
                <p className="mt-3 text-xl">
                  <b className="text-emerald-300">Đáp án:</b> <span className="font-semibold text-white">{s.answer_text}</span>
                </p>
                <p className="mt-1 text-slate-200">{s.explanation}</p>
              </>
            )}
          </article>
        );
      })}
    </section>
  );
}
