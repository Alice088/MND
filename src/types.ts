export interface Viewport {
  x: number
  y: number
  zoom: number
}

export interface SpaceObjectDef {
  id: string
  type: 'space'
  name: string
  x: number
  y: number
  width: number
  height: number
  targetSpaceId: string
  fontSize?: FontSize
}

export interface NoteObject {
  id: string
  type: 'note'
  name: string
  x: number
  y: number
  width: number
  height: number
  content: string
  fontSize?: FontSize
}

export interface FileObject {
  id: string
  type: 'file'
  name: string
  x: number
  y: number
  width: number
  height: number
  storage_key?: string
  mime_type?: string
  fontSize?: FontSize
}

export interface LinkObject {
  id: string
  type: 'link'
  name: string
  x: number
  y: number
  width: number
  height: number
  url: string
  fontSize?: FontSize
}

export interface ShapeObject {
  id: string
  type: 'shape'
  name: string
  x: number
  y: number
  width: number
  height: number
  kind: 'rectangle' | 'circle'
  fontSize?: FontSize
}

export type FontSize = 'sm' | 's' | 'm' | 'l' | 'xl'

export const FONT_SIZE_MAP: Record<FontSize, number> = {
  sm: 20,
  s: 24,
  m: 28,
  l: 36,
  xl: 48,
}

export type CanvasObject = SpaceObjectDef | NoteObject | FileObject | LinkObject | ShapeObject

export interface Space {
  id: string
  name: string
  parentId: string | null
  viewport: Viewport
  objects: CanvasObject[]
}

export function createId(): string {
  return crypto.randomUUID()
}

export function shortId(id: string): string {
  return id.slice(0, 4)
}

export const OBJECT_DEFAULTS: Record<CanvasObject['type'], { width: number; height: number }> = {
  space: { width: 400, height: 300 },
  note: { width: 200, height: 160 },
  file: { width: 220, height: 180 },
  link: { width: 200, height: 120 },
  shape: { width: 160, height: 160 },
}
