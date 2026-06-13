import { useState, useCallback, useRef, useEffect } from 'react'
import type { Space, CanvasObject, NoteObject, FileObject, LinkObject, ShapeObject, FontSize } from './types'
import { createId } from './types'

// ─── Persistence ───

const STORAGE_KEY = 'mnd:workspace'
const AUTO_SAVE_DELAY = 500 // ms

interface PersistedData {
  spaces: Record<string, Space>
  currentId: string
  navStack: { spaceId: string; viewport: { x: number; y: number; zoom: number } }[]
  workspaces: WorkspaceMeta[]
  activeWorkspace: string
}

export interface WorkspaceMeta {
  id: string
  name: string
  description: string
  createdAt: number
}

const ROOT_ID = createId()
const DEMO_ID = createId()

function createInitialData(): PersistedData {
  const root: Space = {
    id: ROOT_ID,
    name: 'root',
    parentId: null,
    viewport: { x: -960, y: -540, zoom: 1 },
    objects: [],
  }
  const demo: Space = {
    id: DEMO_ID,
    name: 'Demo Space',
    parentId: ROOT_ID,
    viewport: { x: -960, y: -540, zoom: 1 },
    objects: [],
  }
  root.objects.push({
    id: createId(),
    type: 'space',
    name: 'Demo Space',
    x: -200,
    y: -100,
    width: 400,
    height: 300,
    targetSpaceId: DEMO_ID,
  })

  return {
    spaces: { [ROOT_ID]: root, [DEMO_ID]: demo },
    currentId: ROOT_ID,
    navStack: [],
    workspaces: [{ id: 'default', name: 'My Projects', description: 'Personal workspace', createdAt: Date.now() }],
    activeWorkspace: 'default',
  }
}

function loadData(): PersistedData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw) as PersistedData
      // Validate basic structure
      if (data.spaces && data.currentId && data.navStack) {
        return data
      }
    }
  } catch { /* ignore */ }
  return createInitialData()
}

function saveData(data: PersistedData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* ignore quota errors */ }
}

// ─── Store hook ───

export interface StoreActions {
  // Navigation
  currentId: string
  currentSpace: Space
  navStack: { spaceId: string; viewport: { x: number; y: number; zoom: number } }[]
  path: { id: string; name: string }[]
  isRoot: boolean
  enterSpace: (targetId: string, viewport: { x: number; y: number; zoom: number }) => void
  leaveSpace: () => void
  resetToRoot: () => void

  // Objects
  updateObject: (objectId: string, x: number, y: number) => void
  resizeObject: (objectId: string, x: number, y: number, width: number, height: number) => void
  renameObject: (objectId: string, name: string) => void
  bodyEdit: (objectId: string, content: string) => void
  fontSizeChange: (objectId: string, fontSize: FontSize) => void

  // Create
  createObject: (type: 'space' | 'note' | 'file' | 'link' | 'shape', worldX: number, worldY: number, extra?: Record<string, unknown>) => { id: string }

  // Delete
  deleteObject: (objectId: string) => void

  // Search
  allObjects: { spaceName: string; spaceId: string; object: CanvasObject }[]

  // Workspace
  workspaces: WorkspaceMeta[]
  activeWorkspace: string
  switchWorkspace: (id: string) => void
  createWorkspace: (name: string) => void

  // Pending edit signals
  pendingEditId: string | null
  pendingBodyEditId: string | null
  clearPendingEdit: () => void
  clearPendingBodyEdit: () => void
}

export function useStore(): StoreActions {
  // Load persisted data
  const initial = useRef(loadData())
  const [spaces, setSpaces] = useState<Record<string, Space>>(initial.current.spaces)
  const [currentId, setCurrentId] = useState(initial.current.currentId)
  const [navStack, setNavStack] = useState(initial.current.navStack)
  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>(initial.current.workspaces)
  const [activeWorkspace, setActiveWorkspace] = useState(initial.current.activeWorkspace)

  // Pending edit signals
  const [pendingEditId, setPendingEditId] = useState<string | null>(null)
  const [pendingBodyEditId, setPendingBodyEditId] = useState<string | null>(null)

  // Auto-save debounce
  const saveTimer = useRef(0)
  const dataRef = useRef<PersistedData | null>(null)

  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      if (dataRef.current) {
        saveData(dataRef.current)
      }
    }, AUTO_SAVE_DELAY)
  }, [])

  // Keep dataRef in sync for saves
  useEffect(() => {
    dataRef.current = { spaces, currentId, navStack, workspaces, activeWorkspace }
    scheduleSave()
  }, [spaces, currentId, navStack, workspaces, activeWorkspace, scheduleSave])

  // Safety reset: if current space deleted, go to root
  useEffect(() => {
    if (!spaces[currentId] && currentId !== ROOT_ID) {
      setCurrentId(ROOT_ID)
    }
  }, [spaces, currentId])

  const currentSpace = spaces[currentId]
  const isRoot = currentId === ROOT_ID

  const path = [
    ...navStack.map(e => ({ id: e.spaceId, name: spaces[e.spaceId]?.name || '' })),
    { id: currentId, name: currentSpace?.name || '' },
  ]

  // Build flat list of all objects for search
  const allObjects = Object.entries(spaces).flatMap(([spaceId, space]) =>
    space.objects.map(obj => ({
      spaceName: space.name,
      spaceId,
      object: obj,
    }))
  )

  // ─── Navigation ───
  const enterSpace = useCallback((targetId: string, viewport: { x: number; y: number; zoom: number }) => {
    setNavStack(prev => [...prev, { spaceId: currentId, viewport }])
    setCurrentId(targetId)
    setPendingEditId(null)
    setPendingBodyEditId(null)
  }, [currentId])

  const leaveSpace = useCallback(() => {
    setNavStack(prev => {
      if (prev.length === 0) return prev
      setCurrentId(prev[prev.length - 1].spaceId)
      return prev.slice(0, -1)
    })
    setPendingEditId(null)
    setPendingBodyEditId(null)
  }, [])

  const resetToRoot = useCallback(() => {
    setNavStack([])
    setCurrentId(ROOT_ID)
    setPendingEditId(null)
    setPendingBodyEditId(null)
  }, [])

  const jumpToSpace = useCallback((spaceId: string) => {
    setNavStack([])
    setCurrentId(spaceId)
    setPendingEditId(null)
    setPendingBodyEditId(null)
  }, [])

  // ─── Object operations ───
  const updateObject = useCallback((objectId: string, x: number, y: number) => {
    setSpaces(prev => ({
      ...prev,
      [currentId]: {
        ...prev[currentId],
        objects: prev[currentId].objects.map(o =>
          o.id === objectId ? { ...o, x, y } : o
        ),
      },
    }))
  }, [currentId])

  const resizeObject = useCallback((objectId: string, x: number, y: number, width: number, height: number) => {
    setSpaces(prev => ({
      ...prev,
      [currentId]: {
        ...prev[currentId],
        objects: prev[currentId].objects.map(o =>
          o.id === objectId ? { ...o, x, y, width, height } : o
        ),
      },
    }))
  }, [currentId])

  const renameObject = useCallback((objectId: string, name: string) => {
    setSpaces(prev => {
      const space = prev[currentId]
      const obj = space.objects.find(o => o.id === objectId)
      let extra: Record<string, Space> = {}
      if (obj?.type === 'space') {
        const targetId = (obj as any).targetSpaceId
        if (prev[targetId]) {
          extra[targetId] = { ...prev[targetId], name }
        }
      }
      return {
        ...prev,
        ...extra,
        [currentId]: {
          ...space,
          objects: space.objects.map(o =>
            o.id === objectId ? { ...o, name } : o
          ),
        },
      }
    })
  }, [currentId])

  const bodyEdit = useCallback((objectId: string, content: string) => {
    setSpaces(prev => ({
      ...prev,
      [currentId]: {
        ...prev[currentId],
        objects: prev[currentId].objects.map(o =>
          o.id === objectId ? { ...o, content } : o
        ),
      },
    }))
  }, [currentId])

  const fontSizeChange = useCallback((objectId: string, fontSize: FontSize) => {
    setSpaces(prev => ({
      ...prev,
      [currentId]: {
        ...prev[currentId],
        objects: prev[currentId].objects.map(o =>
          o.id === objectId ? { ...o, fontSize } : o
        ),
      },
    }))
  }, [currentId])

  const deleteObject = useCallback((objectId: string) => {
    setSpaces(prev => {
      const space = prev[currentId]
      const obj = space.objects.find(o => o.id === objectId)
      // If deleting a space, also remove the target space
      let extra: Record<string, Space> = {}
      if (obj?.type === 'space') {
        const targetId = (obj as any).targetSpaceId
        if (prev[targetId]) {
          const { [targetId]: _, ...rest } = prev
          extra = rest as Record<string, Space>
        }
      }
      return {
        ...prev,
        ...extra,
        [currentId]: {
          ...space,
          objects: space.objects.filter(o => o.id !== objectId),
        },
      }
    })
    setPendingEditId(null)
    setPendingBodyEditId(null)
  }, [currentId])

  // ─── Create ───
  const createObject = useCallback((
    type: 'space' | 'note' | 'file' | 'link' | 'shape',
    worldX: number, worldY: number,
    extra?: Record<string, unknown>,
  ): { id: string } => {
    const id = createId()

    setSpaces(prev => {
      const space = prev[currentId]
      const defSize = (() => {
        switch (type) {
          case 'space': return { w: 400, h: 300 }
          case 'note': return { w: 200, h: 160 }
          case 'file': return { w: 220, h: 180 }
          case 'link': return { w: 200, h: 120 }
          case 'shape': return { w: 160, h: 160 }
        }
      })()

      let obj: CanvasObject

      switch (type) {
        case 'space': {
          const spaceId = createId()
          obj = {
            id, type: 'space', name: 'unnamed',
            x: worldX - defSize.w / 2, y: worldY - defSize.h / 2,
            width: defSize.w, height: defSize.h,
            targetSpaceId: spaceId,
          } as CanvasObject
          const newSpace: Space = {
            id: spaceId, name: 'unnamed',
            parentId: currentId,
            viewport: { x: -960, y: -540, zoom: 1 },
            objects: [],
          }
          return {
            ...prev,
            [spaceId]: newSpace,
            [currentId]: { ...space, objects: [...space.objects, obj] },
          }
        }
        case 'note':
          obj = {
            id, type: 'note', name: 'unnamed', content: '',
            x: worldX - defSize.w / 2, y: worldY - defSize.h / 2,
            width: defSize.w, height: defSize.h,
          } as NoteObject
          break
        case 'file':
          obj = {
            id, type: 'file', name: 'unnamed', content: '',
            x: worldX - defSize.w / 2, y: worldY - defSize.h / 2,
            width: defSize.w, height: defSize.h,
          } as FileObject
          break
        case 'link':
          obj = {
            id, type: 'link', name: 'unnamed', url: '',
            x: worldX - defSize.w / 2, y: worldY - defSize.h / 2,
            width: defSize.w, height: defSize.h,
          } as LinkObject
          break
        case 'shape':
          obj = {
            id, type: 'shape', name: 'unnamed',
            x: worldX - defSize.w / 2, y: worldY - defSize.h / 2,
            width: defSize.w, height: defSize.h,
            kind: (extra?.kind as string) || 'rectangle',
          } as ShapeObject
          break
      }

      return {
        ...prev,
        [currentId]: { ...space, objects: [...space.objects, obj] },
      }
    })

    // Signal auto-edit
    if (type === 'space') {
      setPendingEditId(id)
    }
    if (type === 'note') {
      setPendingBodyEditId(id)
    }

    return { id }
  }, [currentId])

  // ─── Workspace ───
  const switchWorkspace = useCallback((id: string) => {
    setActiveWorkspace(id)
    // Reset navigation
    setNavStack([])
    setCurrentId(ROOT_ID)
  }, [])

  const createWorkspace = useCallback((name: string) => {
    const id = createId()
    setWorkspaces(prev => [...prev, { id, name, description: '', createdAt: Date.now() }])
    switchWorkspace(id)
  }, [switchWorkspace])

  // Export the ROOT_ID for external use
  ;(window as any).__MND_ROOT_ID = ROOT_ID

  return {
    currentId,
    currentSpace,
    navStack,
    path,
    isRoot,
    enterSpace,
    leaveSpace,
    resetToRoot,
    jumpToSpace,
    updateObject,
    resizeObject,
    renameObject,
    bodyEdit,
    fontSizeChange,
    createObject,
    deleteObject,
    allObjects,
    workspaces,
    activeWorkspace,
    switchWorkspace,
    createWorkspace,
    pendingEditId,
    pendingBodyEditId,
    clearPendingEdit: () => setPendingEditId(null),
    clearPendingBodyEdit: () => setPendingBodyEditId(null),
  }
}
