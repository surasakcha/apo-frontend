import React, { useEffect, useState } from 'react'
import { Upload, FileText, Trash2 } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import type { ArtifactRow, ArtifactKind } from './db'

export function Pill({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-slate-700 bg-white">{children}</span>
}

export function SectionTitle({ icon: Icon, title, right }: { icon: any; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      {right}
    </div>
  )
}

export function ToolbarButton({ icon: Icon, label, onClick, variant='default', disabled=false }: { icon:any; label:string; onClick?:()=>void; variant?:'default'|'ghost'|'danger'; disabled?:boolean }) {
  const base = 'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm border transition';
  const v = variant==='ghost'
    ? 'border-transparent hover:bg-slate-50 text-slate-600'
    : variant==='danger'
      ? 'border-red-200 text-red-700 hover:bg-red-50'
      : 'border-slate-200 text-slate-700 hover:bg-slate-50';
  const disabledCls = disabled ? ' opacity-50 cursor-not-allowed pointer-events-none' : '';
  return (
    <button onClick={onClick} className={base+' '+v+disabledCls} disabled={disabled}>
      <Icon className="w-4 h-4"/>{label}
    </button>
  );
}

export function TextInput({ label, value, onChange, placeholder, required }: { label:string; value:string; onChange:(v:string)=>void; placeholder?:string; required?:boolean }) {
  return (
    <label className="block">
      <div className="text-xs text-slate-600 mb-1">{label}{required && <span className="text-red-500"> *</span>}</div>
      <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"/>
    </label>
  )
}

export function TextArea({ label, value, onChange, placeholder, rows=3 }: { label:string; value:string; onChange:(v:string)=>void; placeholder?:string; rows?:number }) {
  return (
    <label className="block">
      <div className="text-xs text-slate-600 mb-1">{label}</div>
      <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"/>
    </label>
  )
}

export function Select({ label, value, onChange, options }: { label:string; value:string; onChange:(v:string)=>void; options:string[] }) {
  return (
    <label className="block">
      <div className="text-xs text-slate-600 mb-1">{label}</div>
      <select value={value} onChange={e=>onChange(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300">
        <option value="">— Select —</option>
        {options.map(o=> <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}

export function ChipInput({ label, values, onChange, placeholder }: { label:string; values:string[]; onChange:(vals:string[])=>void; placeholder?:string }) {
  const [input, setInput] = useState('')
  function addChip(v:string){ const t=v.trim(); if(!t) return; if(!values.includes(t)) onChange([...values,t]) }
  function addMany(parts:string[]){ for(const p of parts) addChip(p) }
  const showPlaceholder = values.length === 0 && input.trim().length === 0;
  return (
    <div>
      <div className="text-xs text-slate-600 mb-1">{label}</div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-2">
        {values.map((v,i)=> (
          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
            {v}
            <button className="text-slate-500 hover:text-red-600" onClick={()=>onChange(values.filter(x=>x!==v))}>×</button>
          </span>
        ))}
        <input value={input} onChange={e=>{ const val=e.target.value; if(val.includes(',')){ const parts=val.split(','); const last=parts.pop()??''; addMany(parts); setInput(last) } else { setInput(val) } }}
          placeholder={showPlaceholder ? (placeholder || 'Type and press Enter or comma') : ''} onKeyDown={e=>{ if(e.key==='Enter'||e.key===','){ e.preventDefault(); addChip(input); setInput('') } }} className="min-w-[140px] flex-1 border-0 focus:outline-none text-sm"/>
      </div>
    </div>
  )
}

export function DropZone({ stepId, type, onFiles }: { stepId?:number; type:ArtifactKind; onFiles:(files:File[])=>void }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop: onFiles })
  return (
    <div {...getRootProps()} className={'rounded-xl border border-dashed p-3 text-xs cursor-pointer ' + (isDragActive?'bg-slate-50 border-slate-400':'border-slate-300')}>
      <input {...getInputProps()} />
      <div className="flex items-center gap-2 text-slate-600"><Upload className="w-4 h-4"/><span>Drag & drop or click to add {type} examples</span></div>
    </div>
  )
}

function extFrom(artifact: ArtifactRow) {
  const byName = artifact.name?.split('.').pop();
  if (byName && byName.length <= 5) return byName.toUpperCase();
  const mime = artifact.mimeType?.split('/').pop();
  return (mime || 'FILE').toUpperCase();
}

function badgeColor(ext: string) {
  switch (ext) {
    case 'PDF':
      return 'bg-red-100 text-red-700';
    case 'PNG':
    case 'JPG':
    case 'JPEG':
    case 'GIF':
      return 'bg-purple-100 text-purple-700';
    case 'CSV':
    case 'XLS':
    case 'XLSX':
      return 'bg-emerald-100 text-emerald-700';
    case 'DOC':
    case 'DOCX':
    case 'PPT':
    case 'PPTX':
      return 'bg-blue-100 text-blue-700';
    case 'ZIP':
    case 'RAR':
      return 'bg-amber-100 text-amber-700';
    case 'JSON':
    case 'TXT':
      return 'bg-slate-100 text-slate-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

export function ArtifactItem({ artifact, onRemove }: { artifact:ArtifactRow; onRemove:()=>void }) {
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (artifact.blob) {
      const u = URL.createObjectURL(artifact.blob);
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    }
  }, [artifact.id, artifact.blob]);

  const isImage = artifact.mimeType?.startsWith('image/');
  const ext = extFrom(artifact);

  const handleRemove = () => {
    const sizePart = artifact.size ? ` (${humanFileSize(artifact.size)})` : '';
    if (confirm(`Delete "${artifact.name}"${sizePart}?`)) onRemove();
  };

  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 px-2 py-1">
      <div className="min-w-0 flex items-center gap-2">
        {isImage && url ? (
          <img src={url} alt={artifact.name} className="w-10 h-10 object-cover rounded" />
        ) : (
          <FileText className="w-6 h-6 text-slate-500" />
        )}
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${badgeColor(ext)}`}
          title={artifact.mimeType || ''}
        >
          {ext}
        </span>
        <div className="truncate text-xs font-medium text-slate-700 max-w-[180px]" title={artifact.name}>
          {artifact.name}
        </div>
        <div className="ml-2 text-xs text-slate-500 shrink-0">
          {humanFileSize(artifact.size || 0)}
        </div>
      </div>
      <button
        onClick={handleRemove}
        title="Remove"
        className="p-1 text-red-600 hover:text-red-700"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function humanFileSize(bytes:number){ if(bytes===0) return '0 B'; const k=1024; const sizes=['B','KB','MB','GB']; const i=Math.floor(Math.log(bytes)/Math.log(k)); return parseFloat((bytes/Math.pow(k,i)).toFixed(2))+' '+sizes[i] }
