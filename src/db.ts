import Dexie, { type Table } from 'dexie'

export type Frequency = 'Per transaction'|'Hourly'|'Daily'|'Weekly'|'Monthly'|'Quarterly'|'Yearly'|'Ad hoc / On event'
export type NextType = 'end'|'step'|'handoff'

export interface ProcessRow {
  id?: number
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  cloudId?: string
}

export interface StepRow {
  id?: number
  processId: number
  index: number
  who: string
  action: string
  tools: string[]
  details: string
  frequency: '' | Frequency
  outcome: string
  duration: string
  nextType: NextType
  nextRef?: number | string
  isEnd: boolean
}

export type ArtifactKind = 'input'|'output'|'system'
export interface ArtifactRow {
  id?: number
  processId: number
  stepId: number
  type: ArtifactKind
  name: string
  mimeType: string
  size: number
  blob?: Blob
}

export class ApoDB extends Dexie {
  processes!: Table<ProcessRow, number>
  steps!: Table<StepRow, number>
  artifacts!: Table<ArtifactRow, number>
  constructor() {
    super('apo_process_db_v1')
    this.version(1).stores({
      processes: '++id, name, createdAt, updatedAt',
      steps: '++id, processId, index, isEnd',
      artifacts: '++id, processId, stepId, type',
    })
  }
}
export const db = new ApoDB()
export const DEFAULT_FREQUENCIES: Frequency[] = ['Per transaction','Hourly','Daily','Weekly','Monthly','Quarterly','Yearly','Ad hoc / On event']
