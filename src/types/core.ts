// ============================================================
// Domnotate — Shared Types
// ============================================================

// === Element Identity ===

export interface ElementDescriptor {
  /** Primary CSS selector (most robust available) */
  cssSelector: string;
  /** XPath fallback */
  xpath: string;
  /** Tag name, e.g. "div" */
  tagName: string;
  /** Class list */
  classes: string[];
  /** Element id if present */
  id: string | null;
  /** Text content preview (first 80 chars) */
  textPreview: string;
  /** Bounding rect at time of selection (iframe-relative) */
  rect: { x: number; y: number; width: number; height: number };
  /** DOM depth from body */
  depth: number;
  /** Human-readable path e.g. "body > div.container > p:nth-child(2)" */
  domPath: string;
}

// === Annotations ===

export interface Annotation {
  id: string;
  /** Identified element */
  element: ElementDescriptor;
  /** Pin position relative to iframe content (not viewport) */
  anchorPoint: { x: number; y: number };
  /** The annotation text (single comment) */
  text: string;
  /** Visual color tag */
  color: string;
  createdAt: string;
  updatedAt: string;
}

// === Session ===

export interface AnnotationSession {
  id: string;
  sourceType: 'file' | 'url';
  sourceName: string;
  /** Blob URL or original URL loaded in iframe */
  loadedUrl: string;
  annotations: Annotation[];
  createdAt: string;
  updatedAt: string;
}

// === Event Bus ===

export type DomnotateEvent =
  | { type: 'content:loaded'; url: string; sourceType: 'file' | 'url'; sourceName: string }
  | { type: 'content:unloaded' }
  | { type: 'picker:hover'; element: ElementDescriptor; mouseX: number; mouseY: number }
  | { type: 'picker:unhover' }
  | { type: 'picker:select'; element: ElementDescriptor; mouseX: number; mouseY: number }
  | { type: 'picker:deselect' }
  | { type: 'annotation:create'; annotation: Annotation }
  | { type: 'annotation:update'; annotation: Annotation }
  | { type: 'annotation:delete'; id: string }
  | { type: 'annotation:select'; id: string }
  | { type: 'annotation:deselect' }
  | { type: 'pins:visibility'; visible: boolean }
  | { type: 'session:loaded'; session: AnnotationSession }
  | { type: 'session:cleared' }
  | { type: 'output:copy'; format: 'markdown' | 'compact' | 'json' }
  | { type: 'output:download'; format: 'markdown' | 'json' };

export type DomnotateEventType = DomnotateEvent['type'];

export type DomnotateEventPayload<T extends DomnotateEventType> = Extract<
  DomnotateEvent,
  { type: T }
>;

export interface EventBus {
  emit<T extends DomnotateEventType>(event: DomnotateEventPayload<T>): void;
  on<T extends DomnotateEventType>(
    type: T,
    handler: (event: DomnotateEventPayload<T>) => void,
  ): () => void;
}

// === Module Interfaces ===

export interface ContentLoader {
  init(iframeEl: HTMLIFrameElement, dropZoneEl: HTMLElement, bus: EventBus): void;
  loadFile(file: File): Promise<void>;
  loadUrl(url: string): Promise<void>;
  getIframeDocument(): Document | null;
  unload(): void;
}

export interface ElementPicker {
  init(iframeEl: HTMLIFrameElement, overlayEl: HTMLElement, bus: EventBus): void;
  activate(): void;
  deactivate(): void;
  isActive(): boolean;
}

export interface AnnotationManager {
  init(bus: EventBus): void;
  getAll(): Annotation[];
  getById(id: string): Annotation | undefined;
  create(element: ElementDescriptor, anchorPoint: { x: number; y: number }, text: string): Annotation;
  updateText(annotationId: string, text: string): void;
  delete(id: string): void;
  loadAnnotations(annotations: Annotation[]): void;
  clearAll(): void;
}

export interface PinRenderer {
  init(
    overlayEl: HTMLElement,
    iframeEl: HTMLIFrameElement,
    bus: EventBus,
    manager: AnnotationManager,
  ): void;
  render(): void;
  setVisible(visible: boolean): void;
  destroy(): void;
}

export interface OutputFormatter {
  toMarkdown(session: AnnotationSession): string;
  toCompact(session: AnnotationSession): string;
  toJSON(session: AnnotationSession): string;
}

export interface SessionStore {
  save(session: AnnotationSession): Promise<void>;
  load(id: string): Promise<AnnotationSession | null>;
  listSessions(): Promise<Array<{ id: string; sourceName: string; updatedAt: string }>>;
  delete(id: string): Promise<void>;
  exportJSON(session: AnnotationSession): string;
  importJSON(json: string): AnnotationSession;
}
