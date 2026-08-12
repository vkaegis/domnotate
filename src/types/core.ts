// ============================================================
// Domnotate — Shared Types
// ============================================================

import type { SourceHint } from '@/core/source-hint/types';

export type { SourceHint };

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

export type ViewScopeKind =
  | 'slide'
  | 'tabpanel'
  | 'hash-route'
  | 'carousel'
  | 'wizard-step'
  | 'active-panel'
  | 'custom';

export interface ViewScope {
  kind: ViewScopeKind;
  id: string;
  index: number;
  label?: string;
  selector: string;
  activeSelector?: string;
  controllerSelector?: string;
  activation?:
    | 'click-controller'
    | 'radio-input'
    | 'set-hash'
    | 'call-goTo'
    | 'toggle-active'
    | 'set-hidden'
    | 'noop';
}

export interface Annotation {
  id: string;
  /** Identified element */
  element: ElementDescriptor;
  /**
   * Source-localisation brief for an agent (plan §3.2). Deliberately separate
   * from `element`, which re-anchors the pin in *this* session: on a live app
   * the two share nothing. Optional — the web app on static HTML has no use
   * for it, and every existing session and fixture stays valid without it.
   */
  sourceHint?: SourceHint;
  /** Pin position relative to iframe content (not viewport) */
  anchorPoint: { x: number; y: number };
  /** The annotation text (single comment) */
  text: string;
  /** Visual color tag */
  color: string;
  /** Logical view scope active when the annotation was created */
  viewScope?: ViewScope;
  /** Slide index (0-based) if the content is a slide deck, undefined otherwise */
  slideIndex?: number;
  createdAt: string;
  updatedAt: string;
}

// === Text Edits ===

/**
 * A proposed in-place text change to a source element.
 *
 * Edits are ephemeral with respect to the HTML file — Domnotate never writes
 * them back to disk. They are captured as instructions and exported alongside
 * annotations so an agent can apply the real change to the source. The live DOM
 * edit is a preview + the authoring gesture.
 */
export interface TextEdit {
  id: string;
  /** Identified element whose text was edited */
  element: ElementDescriptor;
  /** innerHTML before the edit (rich — preserves inline formatting) */
  oldHtml: string;
  /** innerHTML after the edit */
  newHtml: string;
  /** textContent before the edit (readable diff for the agent) */
  oldText: string;
  /** textContent after the edit */
  newText: string;
  /** Logical view scope active when the edit was made */
  viewScope?: ViewScope;
  createdAt: string;
  updatedAt: string;
}

// === Session ===

export interface AnnotationSession {
  id: string;
  /** Cloud share id when this session was loaded from or published to /share/:id */
  shareId?: string;
  sourceType: 'file' | 'url';
  sourceName: string;
  /** Blob URL or original URL loaded in iframe */
  loadedUrl: string;
  /** Original HTML text loaded into the iframe, used for share publishing */
  html?: string;
  annotations: Annotation[];
  /** In-place text edits captured as agent instructions (never written to file) */
  edits?: TextEdit[];
  createdAt: string;
  updatedAt: string;
}

// === Event Bus ===

export type DomnotateEvent =
  | { type: 'content:loaded'; url: string; sourceType: 'file' | 'url'; sourceName: string; html?: string }
  | { type: 'content:unloaded' }
  | { type: 'picker:hover'; element: ElementDescriptor; mouseX: number; mouseY: number }
  | { type: 'picker:unhover' }
  | { type: 'picker:select'; element: ElementDescriptor; mouseX: number; mouseY: number }
  | { type: 'picker:deselect' }
  | { type: 'edit:activate' }
  | { type: 'edit:deactivate' }
  | {
      type: 'edit:commit';
      element: ElementDescriptor;
      oldHtml: string;
      newHtml: string;
      oldText: string;
      newText: string;
      viewScope?: ViewScope;
    }
  | { type: 'edit:create'; edit: TextEdit }
  | { type: 'edit:update'; edit: TextEdit }
  | { type: 'edit:delete'; id: string }
  | { type: 'annotation:create'; annotation: Annotation }
  | { type: 'annotation:update'; annotation: Annotation }
  | { type: 'annotation:delete'; id: string }
  | { type: 'annotation:select'; id: string }
  | { type: 'annotation:deselect' }
  | { type: 'pins:visibility'; visible: boolean }
  | { type: 'session:loaded'; session: AnnotationSession }
  | { type: 'session:cleared' }
  | { type: 'output:copy'; format: 'markdown' | 'compact' | 'json' }
  | { type: 'output:download'; format: 'markdown' | 'json' }
  | { type: 'share:publish' }
  | { type: 'share:publishing' }
  | { type: 'share:copied'; id: string; url: string }
  | { type: 'share:notice'; message: string }
  | { type: 'share:error'; message: string }
  | { type: 'scope:changed'; scope: ViewScope; previousScope: ViewScope | null }
  | { type: 'slide:changed'; slideIndex: number };

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
  loadHtml(
    html: string,
    sourceType: 'file' | 'url',
    sourceName: string,
    options?: { allowScripts?: boolean },
  ): Promise<void>;
  getIframeDocument(): Document | null;
  unload(): void;
}

export interface ElementPicker {
  init(iframeEl: HTMLIFrameElement, overlayEl: HTMLElement, bus: EventBus): void;
  activate(): void;
  deactivate(): void;
  isActive(): boolean;
}

export interface TextEditor {
  init(
    iframeEl: HTMLIFrameElement,
    overlayEl: HTMLElement,
    bus: EventBus,
    /** Resolves the view scope from the actual edited node at commit time. */
    resolveScope?: (el: Element) => ViewScope | undefined,
  ): void;
  /** Arm edit mode: hovering highlights text, clicking makes an element editable. */
  activate(): void;
  /** Commit the open field (if any) and disarm edit mode. */
  deactivate(): void;
  /** Whether edit mode is armed. */
  isActive(): boolean;
  /** Whether an element is currently open for editing. */
  isEditing(): boolean;
  /** Commit the open field without disarming edit mode. */
  commitPending(): void;
  /** Re-apply committed edits to freshly (re)loaded content as a preview. */
  applyEdits(edits: TextEdit[]): void;
  /** Restore a committed edit's original HTML preview in the live document. */
  revertEdit(edit: TextEdit): boolean;
  /** Remove the edited preview marker when an edit collapses back to no-op. */
  clearEditedMarker(element: ElementDescriptor, viewScope?: ViewScope): boolean;
}

export interface EditManager {
  init(bus: EventBus): void;
  getAll(): TextEdit[];
  getById(id: string): TextEdit | undefined;
  /**
   * Upsert an edit by element selector: a second edit to the same element
   * updates the existing record's new value rather than adding a duplicate.
   */
  commit(input: {
    element: ElementDescriptor;
    oldHtml: string;
    newHtml: string;
    oldText: string;
    newText: string;
    viewScope?: ViewScope;
  }): TextEdit | null;
  delete(id: string): void;
  loadEdits(edits: TextEdit[]): void;
  clearAll(): void;
}

export interface AnnotationManager {
  init(bus: EventBus): void;
  getAll(): Annotation[];
  getById(id: string): Annotation | undefined;
  create(
    element: ElementDescriptor,
    anchorPoint: { x: number; y: number },
    text: string,
    options?: number | { slideIndex?: number; viewScope?: ViewScope },
  ): Annotation;
  updateText(annotationId: string, text: string): void;
  /** Replace or clear the stored view scope on an existing annotation. */
  updateScope(annotationId: string, scope: ViewScope | null): void;
  /**
   * Attach a late-arriving source hint. Unlike the other updaters this is a
   * no-op for an unknown id rather than a throw: the hint is resolved
   * asynchronously across the world boundary, so the annotation may legitimately
   * have been deleted while it was in flight. Returns whether it landed.
   */
  updateSourceHint(annotationId: string, hint: SourceHint | null): boolean;
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
    slideObserver?: SlideObserver,
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

export type ScopeDetectorStage = 'explicit' | 'semantic' | 'rendered-state';

export interface ScopeDetectorMeta {
  id: string;
  stage: ScopeDetectorStage;
  priority: number;
  confidence: number;
}

export interface ScopeDetectionInfo {
  /** Detector id (or 'semantic-composite') that produced the active scope records; null when no scopes were detected. */
  source: string | null;
  /** Ordered detector plan that ran during the last detection pass. */
  detectors: readonly ScopeDetectorMeta[];
}

export interface ViewScopeObserver {
  init(iframeEl: HTMLIFrameElement, bus: EventBus): void;
  /** Active logical view scope, or null when the document is unscoped. */
  getActiveScope(): ViewScope | null;
  /** All currently active logical view scopes, for documents with independent scope groups. */
  getActiveScopes(): ViewScope[];
  /** All detected logical view scopes in document order. */
  getScopes(): ViewScope[];
  /** Given a DOM element, return the nearest matching scope. */
  getScopeForElement(el: Element): ViewScope | undefined;
  /** Return whether a logical view scope is currently active. */
  isScopeActive(scope: ViewScope): boolean;
  /** Activate a logical view scope inside the iframe. */
  activateScope(scope: ViewScope): void;
  /** Diagnostic info about the last detection pass (detector plan + winning source). */
  getDetectionInfo(): ScopeDetectionInfo;
  destroy(): void;
}

export interface SlideObserver extends ViewScopeObserver {
  /** null = not a slide deck. Otherwise 0-based index of active slide. */
  getActiveSlide(): number | null;
  /** Total slide count, or null if not a slide deck */
  getSlideCount(): number | null;
  /** Navigate to slide n inside the iframe */
  goToSlide(n: number): void;
  /** Given a DOM element, return its slide index or undefined */
  getSlideForElement(el: Element): number | undefined;
}

export interface SessionStore {
  save(session: AnnotationSession, options?: { cacheOnly?: boolean }): Promise<void>;
  load(id: string, options?: { preferCloud?: boolean }): Promise<AnnotationSession | null>;
  listSessions(): Promise<Array<{ id: string; sourceName: string; updatedAt: string }>>;
  delete(id: string): Promise<void>;
  exportJSON(session: AnnotationSession): string;
  importJSON(json: string): AnnotationSession;
}
