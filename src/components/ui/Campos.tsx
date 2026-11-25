interface Base { name: string; label: string; obrigatorio?: boolean; dica?: string; cheio?: boolean; /** Use quando o mesmo campo aparece em vários modais da mesma página. */ id?: string }
const idDe = (p: { name: string; id?: string }) => p.id ?? `f_${p.name}`;
const env = (cheio?: boolean) => `campo ${cheio ? "sm:col-span-2" : ""}`;
const Rotulo = ({ name, label, obrigatorio, id }: Base) => (
  <label htmlFor={idDe({ name, id })}>{label}{obrigatorio && <span className="text-perigo" aria-hidden="true"> *</span>}</label>
);
const Dica = ({ dica }: { dica?: string }) => (dica ? <span className="text-xs text-texto-suave">{dica}</span> : null);

export function CampoTexto(p: Base & { tipo?: string; valor?: string | number | null; maxLength?: number; min?: number; max?: number; step?: string; readOnly?: boolean; autoComplete?: string; placeholder?: string }) {
  return (
    <div className={env(p.cheio)}>
      <Rotulo {...p} />
      <input id={idDe(p)} name={p.name} type={p.tipo ?? "text"} defaultValue={p.valor ?? ""} required={p.obrigatorio}
        maxLength={p.maxLength} min={p.min} max={p.max} step={p.step} readOnly={p.readOnly} autoComplete={p.autoComplete ?? "off"} placeholder={p.placeholder} />
      <Dica dica={p.dica} />
    </div>
  );
}

export function CampoAreaTexto(p: Base & { valor?: string | null; linhas?: number; maxLength?: number }) {
  return (
    <div className={env(p.cheio)}>
      <Rotulo {...p} />
      <textarea id={idDe(p)} name={p.name} rows={p.linhas ?? 4} defaultValue={p.valor ?? ""} required={p.obrigatorio} maxLength={p.maxLength} />
      <Dica dica={p.dica} />
    </div>
  );
}

export interface Opcao { v: string; l: string }

export function CampoSelecao(p: Base & { opcoes: Opcao[]; valor?: string | null; vazio?: string | null }) {
  return (
    <div className={env(p.cheio)}>
      <Rotulo {...p} />
      <select id={idDe(p)} name={p.name} defaultValue={p.valor ?? ""} required={p.obrigatorio}>
        {p.vazio !== null && <option value="">{p.vazio ?? "Selecione..."}</option>}
        {p.opcoes.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
      <Dica dica={p.dica} />
    </div>
  );
}

export function CampoMarcar(p: Base & { marcado?: boolean }) {
  return (
    <div className={`${env(p.cheio)} !flex-row items-center gap-2`}>
      <input id={idDe(p)} name={p.name} type="checkbox" defaultChecked={p.marcado} className="h-4 w-4" />
      <label htmlFor={idDe(p)} className="!font-normal">{p.label}</label>
    </div>
  );
}
