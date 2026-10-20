import { useState } from 'react';
import type { Response, TaskDef } from '../lib/types';

interface Props {
  task: TaskDef;
  disabled?: boolean;
  busy?: boolean;
  submitLabel: string;
  onSubmit: (r: Response) => void;
}

export default function TaskForm({ task, disabled, busy, submitLabel, onSubmit }: Props) {
  const [vals, setVals] = useState<Response>({});
  const set = (k: string, v: string) => setVals((s) => ({ ...s, [k]: v }));

  const filled =
    task.kind === 'numeric'
      ? (task.fields ?? []).every((f) => (vals[f.key] ?? '').trim() !== '')
      : task.kind === 'choice'
        ? !!vals.choice
        : (vals.symbol ?? '').trim() !== '';

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (filled && !disabled && !busy) onSubmit(vals);
      }}
    >
      {task.kind === 'numeric' && (
        <div className="grid gap-3 sm:grid-cols-3">
          {(task.fields ?? []).map((f) => (
            <label key={f.key} className="block">
              <span className="label">{f.label}</span>
              <input
                className="input"
                inputMode="decimal"
                autoComplete="off"
                value={vals[f.key] ?? ''}
                onChange={(e) => set(f.key, e.target.value)}
                disabled={disabled}
                placeholder="0"
              />
            </label>
          ))}
        </div>
      )}

      {task.kind === 'choice' && (
        <fieldset className="space-y-2" disabled={disabled}>
          {(task.options ?? []).map((o) => (
            <label
              key={o.id}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-xl transition ${
                vals.choice === o.id ? 'border-cyan-300 bg-cyan-300/15' : 'border-cyan-300/20 hover:bg-cyan-300/5'
              }`}
            >
              <input type="radio" name="choice" className="h-5 w-5 accent-cyan-300" checked={vals.choice === o.id} onChange={() => set('choice', o.id)} />
              <span>{o.text}</span>
            </label>
          ))}
        </fieldset>
      )}

      {task.kind === 'symbol' && (
        <label className="block">
          <span className="label">Kí hiệu nguyên tử</span>
          <input
            className="input font-mono"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={vals.symbol ?? ''}
            onChange={(e) => set('symbol', e.target.value)}
            disabled={disabled}
            placeholder="vd: 35/17Cl"
          />
        </label>
      )}

      <button type="submit" className="btn-primary w-full sm:w-auto" disabled={!filled || disabled || busy}>
        {busy ? 'Đang gửi...' : submitLabel}
      </button>
    </form>
  );
}
