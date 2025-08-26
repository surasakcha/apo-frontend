import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Save, Upload, Trash2, ArrowUp, ArrowDown, Download, FileText, Database, PlayCircle, Import, Link2, CheckCircle2, XCircle, MoveRight, GitCommit, Settings2, RotateCcw, RotateCw } from 'lucide-react'
import { Pill, SectionTitle, ToolbarButton, TextInput, TextArea, Select, ChipInput, DropZone, ArtifactItem } from './components'
import { db, DEFAULT_FREQUENCIES, type ArtifactRow, type ArtifactKind, type ProcessRow, type StepRow } from './db'
import { API_BASE, apiCreateProcess, apiUpdateProcess, apiPutSteps } from './lib/api'

const nowISO = () => new Date().toISOString()

export default function App() {
  const [processes, setProcesses] = useState<ProcessRow[]>([])
  const [activeId, setActiveId] = useState<number | undefined>(undefined)
  const [steps, setSteps] = useState<StepRow[]>([])
  const [artifactsByStep, setArtifactsByStep] = useState<Record<number, ArtifactRow[]>>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  // --- Undo/Redo state & helpers ---
  const [history, setHistory] = useState<StepRow[][]>([])
  const [future, setFuture] = useState<StepRow[][]>([])
  const MAX_HISTORY = 50

  const snapshotSteps = (arr: StepRow[]) => arr.map(s => ({ ...s }))

  function pushHistory() {
    setHistory(h => [snapshotSteps(steps), ...h].slice(0, MAX_HISTORY))
    setFuture([]) // clear redo after a new action
  }

  function undo() {
    if (!history.length) return
    const prev = history[0]
    setFuture(f => [snapshotSteps(steps), ...f])
    setHistory(h => h.slice(1))
    setSteps(prev)
    markDirty()
  }

  function redo() {
    if (!future.length) return
    const next = future[0]
    setHistory(h => [snapshotSteps(steps), ...h].slice(0, MAX_HISTORY))
    setFuture(f => f.slice(1))
    setSteps(next)
    markDirty()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [history, future, steps])
  // --- end Undo/Redo ---

  useEffect(()=>{ (async()=>{ const list=await db.processes.orderBy('updatedAt').reverse().toArray(); setProcesses(list); if(list.length) setActiveId(list[0].id) })() }, [])
  useEffect(()=>{
    if(!activeId){ setSteps([]); setArtifactsByStep({}); setHistory([]); setFuture([]); return }
    (async()=>{
      const s=await db.steps.where({processId:activeId}).sortBy('index');
      setSteps(s)
      setHistory([]); setFuture([])
      const grouped:Record<number,ArtifactRow[]>= {};
      const arts=await db.artifacts.where({processId:activeId}).toArray()
      for(const a of arts){ if(!grouped[a.stepId]) grouped[a.stepId]=[]; grouped[a.stepId].push(a) }
      setArtifactsByStep(grouped)
    })()
  }, [activeId])

  function markDirty(){ setDirty(true) }

  async function createProcess(){
    let cloudId: string | undefined = undefined
    const name = `Untitled Process ${processes.length + 1}`
    if(API_BASE){ try{ const res:any = await apiCreateProcess(name); cloudId = res.processId } catch(e){ console.warn('Remote create failed', e) } }
    const id = await db.processes.add({ name, description:'', createdAt: nowISO(), updatedAt: nowISO(), cloudId })
    const list = await db.processes.orderBy('updatedAt').reverse().toArray(); setProcesses(list); setActiveId(id)
  }

  async function renameProcess(id:number, name:string){
    const p = await db.processes.get(id)
    await db.processes.update(id, { name, updatedAt: nowISO() })
    setProcesses(await db.processes.orderBy('updatedAt').reverse().toArray())
    if(API_BASE && p?.cloudId){ try{ await apiUpdateProcess(p.cloudId, { name }) } catch(e){ console.warn('Remote rename failed', e) } }
  }

  async function deleteProcess(id:number){
    if(!confirm('Delete this process and all steps/artifacts?')) return
    await db.transaction('rw', db.processes, db.steps, db.artifacts, async()=>{
      await db.artifacts.where({processId:id}).delete()
      await db.steps.where({processId:id}).delete()
      await db.processes.delete(id)
    })
    const list = await db.processes.orderBy('updatedAt').reverse().toArray(); setProcesses(list); setActiveId(list[0]?.id)
  }

  function addStep(){
    if(!activeId) return
    pushHistory()
    const idx = steps.length
    const newStep: StepRow = { processId: activeId, index: idx, who:'', action:'', tools:[], details:'', frequency:'', outcome:'', duration:'', nextType:'end', nextRef: undefined, isEnd: idx === 0 }
    setSteps(prev=>[...prev,newStep]); markDirty()
  }

  function updateStep(i:number, patch: Partial<StepRow>){
    pushHistory()
    const copy = steps.slice(); copy[i] = { ...copy[i], ...patch }
    if((patch as any).isEnd){ for(let k=0;k<copy.length;k++) if(k!==i) copy[k].isEnd=false; copy[i].nextType='end'; copy[i].nextRef=undefined }
    setSteps(copy); markDirty()
  }

  function moveStep(i:number, dir:-1|1){
    const j=i+dir; if(j<0||j>=steps.length) return
    pushHistory()
    const r=steps.slice(); const tmp=r[i]; r[i]=r[j]; r[j]=tmp; const withIndex=r.map((s,idx)=>({...s,index:idx}))
    setSteps(withIndex); markDirty()
  }

  function removeStep(i:number){
    const step=steps[i]; if(step?.id && artifactsByStep[step.id]?.length){ if(!confirm('This step has artifacts. Delete anyway?')) return }
    pushHistory()
    const filtered=steps.filter((_,idx)=>idx!==i).map((s,idx)=>({...s,index:idx})); setSteps(filtered); markDirty()
  }

  async function onDropFiles(stepLocalIndex:number, type:ArtifactKind, files:File[]){
    const step=steps[stepLocalIndex]; if(!activeId) return
    if(!step.id){ await saveAll() }
    const fresh=steps[stepLocalIndex]; const created:ArtifactRow[]=[]
    await db.transaction('rw', db.artifacts, async()=>{
      for(const f of files){
        const id = await db.artifacts.add({ processId: activeId, stepId: fresh.id!, type, name: f.name, mimeType: (f as any).type || 'application/octet-stream', size: f.size, blob: f })
        const rec = await db.artifacts.get(id); if(rec) created.push(rec)
      }
    })
    setArtifactsByStep(prev=>({ ...(prev), [fresh.id!]: [ ...(prev[fresh.id!]||[]), ...created ] }))
  }

  async function removeArtifact(artifact:ArtifactRow){
    await db.artifacts.delete(artifact.id!)
    setArtifactsByStep(prev=>{ const arr=(prev[artifact.stepId]||[]).filter(a=>a.id!==artifact.id); return { ...(prev), [artifact.stepId]: arr } })
  }

  async function saveAll(){
    if(!activeId) return
    setSaving(true)
    try{
      await db.transaction('rw', db.processes, db.steps, async()=>{
        await db.processes.update(activeId, { updatedAt: nowISO() })
        for(const s of steps){
          if(s.id){
            await db.steps.put(s)
          } else {
            const id = await db.steps.add({ ...s })
            s.id = id
          }
        }
        const ids = steps.filter(s=>s.id).map(s=>s.id!) as number[]
        const toDelete = await db.steps.where({processId:activeId}).toArray()
        for(const row of toDelete) if(!ids.includes(row.id!)) await db.steps.delete(row.id!)
      })
      setDirty(false)
      setProcesses(await db.processes.orderBy('updatedAt').reverse().toArray())

      const proc = (processes.find(p=>p.id===activeId)) || (await db.processes.get(activeId))
      if(API_BASE){
        let cloudId = proc?.cloudId
        try{
          if(!cloudId){ const res:any = await apiCreateProcess(proc?.name || 'Untitled'); cloudId = res.processId; await db.processes.update(activeId, { cloudId }) }
          else { await apiUpdateProcess(cloudId, { name: proc?.name }) }
          await apiPutSteps(cloudId!, steps.map(s=>({ index:s.index, who:s.who, action:s.action, tools:s.tools, details:s.details, frequency:s.frequency||'', outcome:s.outcome, duration:s.duration, isEnd:s.isEnd, nextType:s.nextType, nextRef:s.nextRef })))
        }catch(e){ console.warn('Cloud sync failed (offline mode)', e) }
      }
    } finally { setSaving(false) }
  }

  async function resetAllData(){ if(!confirm('This will delete all locally stored processes and files for this app. Continue?')) return; await db.delete(); window.location.reload() }

  function exportProcess(){ if(!activeId) return; (async()=>{
    const proc=await db.processes.get(activeId); const s=await db.steps.where({processId:activeId}).sortBy('index'); const arts=await db.artifacts.where({processId:activeId}).toArray()
    const data={ process:proc, steps:s, artifacts: arts.map(a=>({ ...a, blob: undefined })) }
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`${(proc?.name||'process').replace(/\\s+/g,'_')}.apo.json`; a.click(); URL.revokeObjectURL(url)
  })() }

  function importProcess(file:File){ (async()=>{
    const text=await file.text(); const parsed=JSON.parse(text); const { process, steps: s, artifacts: arts } = parsed
    await db.transaction('rw', db.processes, db.steps, db.artifacts, async()=>{
      const pid = await db.processes.add({ name:(process?.name||'Imported Process')+' (import)', description:process?.description||'', createdAt:nowISO(), updatedAt:nowISO() })
      const idMap=new Map<number,number>()
      for(const st of s as StepRow[]){ const oldId=(st as any).id as number; delete (st as any).id; st.processId=pid; const newId=await db.steps.add(st); idMap.set(oldId,newId) }
      for(const a of arts as ArtifactRow[]){ delete (a as any).id; a.processId=pid; a.stepId=idMap.get(a.stepId)!; (a as any).blob=undefined; await db.artifacts.add(a) }
    })
    setProcesses(await db.processes.orderBy('updatedAt').reverse().toArray())
  })() }

  const activeProcess = useMemo(()=> processes.find(p=>p.id===activeId), [processes, activeId])
  const endStepIndex = steps.findIndex(s=>s.isEnd)

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Database className="w-5 h-5 text-slate-600"/><h1 className="text-base font-semibold">A-PO Current Process Gatherer – Prototype</h1>
          <Pill>Local-first (IndexedDB)</Pill>{API_BASE && <Pill>Cloud sync ON</Pill>}{dirty && <Pill>Unsaved changes</Pill>}
          <div className="ml-auto flex items-center gap-2">
            <ToolbarButton icon={RotateCcw} label="Undo" onClick={undo} disabled={history.length===0}/>
            <ToolbarButton icon={RotateCw} label="Redo" onClick={redo} disabled={future.length===0}/>
            <ToolbarButton icon={Save} label={saving ? 'Saving…' : 'Save'} onClick={saveAll}/>
            <ToolbarButton icon={Trash2} label="Reset data" variant="danger" onClick={resetAllData}/>
            <ToolbarButton icon={Download} label="Export JSON" onClick={exportProcess}/>
            <label className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer">
              <Import className="w-4 h-4"/> Import
              <input type="file" accept="application/json" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f) importProcess(f) }}/>
            </label>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-4 grid grid-cols-12 gap-4">
        <aside className="col-span-12 lg:col-span-3 rounded-2xl bg-white border border-slate-200 p-3">
          <SectionTitle icon={GitCommit} title="Processes" right={<Pill>{processes.length}</Pill>}/>
          <div className="space-y-2 max-h-[50vh] overflow-auto pr-1">
            {processes.map(p=> (
              <button key={p.id} onClick={()=>setActiveId(p.id)} className={'w-full text-left rounded-xl border px-3 py-2 '+(activeId===p.id?'border-slate-400 bg-slate-50':'border-slate-200 hover:bg-slate-50')}>
                <div className="text-sm font-medium truncate">{p.name}</div>
                <div className="text-xs text-slate-500">Updated {new Date(p.updatedAt).toLocaleString()}</div>
              </button>
            ))}
          </div>
          <div className="mt-3"><ToolbarButton icon={Plus} label="Create new process" onClick={createProcess}/></div>
          {activeProcess && (<div className="mt-4 border-t pt-3"><SectionTitle icon={Settings2} title="Process Settings"/><TextInput label="Name" value={activeProcess.name} onChange={v=>renameProcess(activeProcess.id!, v)}/></div>)}
          {activeProcess && (<div className="mt-4 border-t pt-3"><ToolbarButton icon={Trash2} label="Delete process" variant="danger" onClick={()=>deleteProcess(activeProcess.id!)}/></div>)}
        </aside>

        <main className="col-span-12 lg:col-span-9 space-y-4">
          <div className="rounded-2xl bg-white border border-slate-200 p-3">
            <SectionTitle icon={PlayCircle} title="Flow Preview"/>
            {steps.length===0 ? <div className="text-sm text-slate-500">No steps yet. Start by adding steps below.</div> : (
              <ol className="relative ml-4">{steps.map((s,idx)=> (
                <li key={idx} className="mb-4">
                  <div className="absolute -left-4 top-1.5 h-full w-px bg-slate-200"/>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-white text-xs">{idx+1}</span>
                    <div className="text-sm font-medium">{s.action || <span className="text-slate-400">(doing what)</span>}</div>
                    <div className="text-xs text-slate-500">by {s.who || '(who)'}</div>
                    {s.isEnd ? (<Pill><CheckCircle2 className="w-3 h-3 mr-1"/>End</Pill>) : (<Pill><MoveRight className="w-3 h-3 mr-1"/>Next</Pill>)}
                  </div>
                </li>
              ))}</ol>
            )}
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-3">
            <SectionTitle icon={FileText} title="Current Process Gathering" right={<Pill>{steps.length} steps</Pill>}/>
            <div className="space-y-4">
              {steps.map((s,i)=>(
                <div key={i} className="rounded-2xl border border-slate-200 p-3">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-800 text-white text-xs">{i+1}</span>
                    <input className="flex-1 text-sm font-semibold border-0 focus:outline-none" placeholder="Doing what (short title)" value={s.action} onChange={e=>updateStep(i,{action:e.target.value})}/>
                    <div className="flex items-center gap-1">
                      <button title="Move up" className="p-1 text-slate-500 hover:text-slate-900" onClick={()=>moveStep(i,-1)}><ArrowUp className="w-4 h-4"/></button>
                      <button title="Move down" className="p-1 text-slate-500 hover:text-slate-900" onClick={()=>moveStep(i,1)}><ArrowDown className="w-4 h-4"/></button>
                      <button title="Delete step" className="p-1 text-red-600 hover:text-red-700" onClick={()=>removeStep(i)}><Trash2 className="w-4 h-4"/></button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <TextInput label="By who (role/owner)" value={s.who || ''} onChange={v=>updateStep(i,{who:v})} placeholder="e.g., Campaign Ops Analyst"/>
                    <Select label="How frequent" value={s.frequency || ''} onChange={v=>updateStep(i,{frequency: v as any})} options={DEFAULT_FREQUENCIES}/>
                    <ChipInput label="On which tools" values={s.tools || []} onChange={vals=>updateStep(i,{tools:vals})} placeholder="e.g., Jira, Excel, NEXT Admin (use comma to add)"/>
                    <TextInput label="How long does this step usually take?" value={s.duration || ''} onChange={v=>updateStep(i,{duration:v})} placeholder="e.g., 5–10 minutes, 1–2 hours"/>
                    <TextArea label="Detailed steps of how to execute" value={s.details || ''} onChange={v=>updateStep(i,{details:v})} placeholder="Describe the exact steps, forms, buttons, rules…" rows={4}/>
                    <TextArea label="What is the current outcome" value={s.outcome || ''} onChange={v=>updateStep(i,{outcome:v})} placeholder="e.g., Approved campaign payload JSON, submitted ticket, exported file" rows={4}/>
                    <div className="col-span-1 md:col-span-2">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <label className="flex items-center gap-2 text-sm"><input type="radio" name={`next-${i}`} checked={s.isEnd===true} onChange={()=>updateStep(i,{isEnd:true, nextType:'end', nextRef:undefined})}/><span>Mark as <b>End</b> of process</span></label>
                        <label className="flex items-center gap-2 text-sm"><input type="radio" name={`next-${i}`} checked={!s.isEnd && s.nextType==='step'} onChange={()=>updateStep(i,{isEnd:false, nextType:'step', nextRef: i+1<steps.length ? steps[i+1].index : undefined})}/><span>Next → another step</span></label>
                        <label className="flex items-center gap-2 text-sm"><input type="radio" name={`next-${i}`} checked={!s.isEnd && s.nextType==='handoff'} onChange={()=>updateStep(i,{isEnd:false, nextType:'handoff'})}/><span>Handoff → other team/system</span></label>
                        {!s.isEnd && s.nextType==='step' && (<select className="rounded-lg border border-slate-200 px-2 py-1 text-sm" value={(s.nextRef as any) ?? ''} onChange={e=>updateStep(i,{nextRef:Number(e.target.value)})}>
                          <option value="">Select step…</option>
                          {steps.map((opt,idx)=> idx!==i && (<option key={idx} value={idx}>{`Step ${idx+1}: ${opt.action || '(untitled)'}`}</option>))}
                        </select>)}
                        {!s.isEnd && s.nextType==='handoff' && (<input className="rounded-lg border border-slate-200 px-2 py-1 text-sm" placeholder="e.g., Submit to Compliance via ServiceNow" value={(s.nextRef as any) || ''} onChange={e=>updateStep(i,{nextRef:e.target.value})}/>)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                    {(['input','output','system'] as const).map(kind=> (
                      <div key={kind} className="rounded-xl border border-slate-200 p-2">
                        <SectionTitle icon={Upload} title={`Examples: ${kind}`}/>
                        <DropZone stepId={s.id} type={kind} onFiles={files=>onDropFiles(i, kind, files)}/>
                        <div className="mt-2 space-y-2 max-h-44 overflow-auto pr-1">
                          {(s.id && artifactsByStep[s.id] ? artifactsByStep[s.id].filter(a=>a.type===kind) : []).map(a=> (<ArtifactItem key={a.id} artifact={a} onRemove={()=>removeArtifact(a)}/>))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between">
                <ToolbarButton icon={Plus} label="Add step" onClick={addStep}/>
                <div className="text-xs text-slate-500 flex items-center gap-2">
                  {endStepIndex===-1 ? (<span className="inline-flex items-center gap-1 text-red-600"><XCircle className="w-4 h-4"/>No end step marked</span>) : (<span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-4 h-4"/>End at step {endStepIndex+1}</span>)}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-3">
            <SectionTitle icon={Link2} title="What happens next"/>
            <p className="text-sm text-slate-600">Local-first (IndexedDB). If <code>VITE_API_BASE</code> is set, Save will also sync to your AWS backend.</p>
          </div>
        </main>
      </div>
    </div>
  )
}
