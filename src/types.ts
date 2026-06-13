export interface Viewport {
  x: number
  y: number
  zoom: number
}

export interface CanvasObject {
  id: string
  type: 'space'
  name: string
  x: number
  y: number
  width: number
  height: number
  targetSpaceId: string
}

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
