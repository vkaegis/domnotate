/* eslint-disable */
// ============================================================
// Domnotate — Phase 0 Signal Reconnaissance Probe
// ============================================================
//
// A standalone DevTools-console script. Not part of the build, not imported by
// anything, no test file (vitest only collects src/**/*.test.ts).
//
// Purpose: find out which source-localization signals actually exist on a
// target app before designing the extension's fiber walker around any of them.
// See .context/chrome-extension-plan.md §5 Phase 0.
//
// PRIVACY NOTE: this probe deliberately records prop *keys* but never prop
// *values*. Reconnaissance needs to know which signals are available, not what
// they contain. Text content is captured but truncated to 60 chars, which is
// all you need to judge grep-ability.
//
// Usage:
//   1. Paste into the DevTools console on the target page.
//   2. __dnProbe.env()            -> React version + dev/prod build
//   3. __dnProbe.start()          -> Alt+Click elements to sample. Esc to stop.
//   4. __dnProbe.report()         -> aggregate stats + Phase 0 gate verdict
//   5. __dnProbe.copy()           -> full JSON to clipboard
//
// Also available:
//   __dnProbe.inspect(el)         -> probe one element, returns the record
//   __dnProbe.inspect($0)         -> probe the DevTools-selected element
//   __dnProbe.samples             -> raw sample array
//   __dnProbe.reset()             -> clear samples

(() => {
  'use strict';

  const TEXT_LIMIT = 60;
  const MAX_CHAIN = 12;

  // ----------------------------------------------------------
  // React internals access
  // ----------------------------------------------------------

  const FIBER_PREFIXES = ['__reactFiber$', '__reactInternalInstance$'];
  const PROPS_PREFIXES = ['__reactProps$', '__reactEventHandlers$'];

  function findKey(obj, prefixes) {
    for (const key of Object.keys(obj)) {
      for (const prefix of prefixes) {
        if (key.startsWith(prefix)) return key;
      }
    }
    return null;
  }

  function getFiber(el) {
    const key = findKey(el, FIBER_PREFIXES);
    return key ? el[key] : null;
  }

  function getProps(el) {
    const key = findKey(el, PROPS_PREFIXES);
    return key ? el[key] : null;
  }

  /** Detect React version and whether this is a development bundle. */
  function detectReact() {
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    const out = { present: false, version: null, bundleType: null, build: 'unknown' };

    if (hook && hook.renderers && hook.renderers.size > 0) {
      const renderer = Array.from(hook.renderers.values())[0];
      out.present = true;
      out.version = renderer.version ?? null;
      // bundleType: 0 = production, 1 = development
      if (typeof renderer.bundleType === 'number') {
        out.bundleType = renderer.bundleType;
        out.build = renderer.bundleType === 1 ? 'development' : 'production';
      }
    }

    if (!out.present) {
      // No DevTools hook (it's injected by the React DevTools extension, so its
      // absence says nothing about React). Sniff a spread of nodes instead of
      // one — the first div on a page is often outside the React root.
      const candidates = document.querySelectorAll('div, span, main, section, button');
      const step = Math.max(1, Math.floor(candidates.length / 25));
      for (let i = 0; i < candidates.length; i += step) {
        if (getFiber(candidates[i])) {
          out.present = true;
          out.detectedVia = 'dom-fiber-sniff';
          break;
        }
      }
    }

    return out;
  }

  /**
   * Build type, inferred from evidence rather than the DevTools hook.
   * Dev bundles always carry `_debugOwner`; production ones never do.
   */
  function inferBuild(samplesArr) {
    const env = detectReact();
    if (env.build !== 'unknown') return { build: env.build, via: 'bundleType' };
    if (!samplesArr || samplesArr.length === 0) return { build: 'unknown', via: 'no-samples' };

    const anyDebugFields = samplesArr.some((s) => s.react.debugFields.length > 0);
    const anyOwnerChain = samplesArr.some((s) => s.react.ownerChain.length > 0);
    if (anyDebugFields || anyOwnerChain) return { build: 'development', via: 'debug-fields-present' };
    if (samplesArr.some((s) => s.react.hasFiber)) {
      return { build: 'production', via: 'fibers-present-no-debug-fields' };
    }
    return { build: 'unknown', via: 'no-fibers' };
  }

  // ----------------------------------------------------------
  // Component naming
  // ----------------------------------------------------------

  const SYM = (name) => (typeof Symbol === 'function' ? Symbol.for(name) : null);
  const MEMO = SYM('react.memo');
  const FORWARD_REF = SYM('react.forward_ref');
  const PROVIDER = SYM('react.provider');
  const CONTEXT = SYM('react.context');
  const LAZY = SYM('react.lazy');

  /**
   * Resolve a display name from a fiber's `type`, unwrapping memo/forwardRef.
   * Returns null for host (DOM) components and unnameable internals.
   */
  function componentName(type, depth = 0) {
    if (!type || depth > 4) return null;
    if (typeof type === 'string') return null; // host component

    if (typeof type === 'function') {
      return type.displayName || type.name || null;
    }

    if (typeof type === 'object') {
      if (type.displayName) return type.displayName;
      switch (type.$$typeof) {
        case MEMO:
          return componentName(type.type, depth + 1);
        case FORWARD_REF:
          return componentName(type.render, depth + 1);
        case LAZY:
          return componentName(type._payload && type._payload._result, depth + 1);
        case PROVIDER:
          return 'ContextProvider';
        case CONTEXT:
          return 'ContextConsumer';
        default:
          return null;
      }
    }

    return null;
  }

  /**
   * Heuristic: does this look like a minifier-generated identifier?
   * Single/double letters, optionally with digits, or leading-lowercase stubs.
   */
  function looksMinified(name) {
    if (!name) return true;
    if (name.length <= 2) return true;
    if (/^[a-zA-Z]{1,2}[0-9]*$/.test(name)) return true;
    if (/^[a-z][0-9]+$/.test(name)) return true;
    if (/^_+$/.test(name)) return true;
    return false;
  }

  /**
   * Names that are long enough to pass the minification test but still say
   * nothing about application source. Emotion/MUI `styled()` produces
   * `Styled(div)` by the thousand; Radix-style libraries produce
   * `Primitive.div` and `Foo.Root`.
   *
   * Learned the hard way: a first pass counted these as "named components" and
   * reported 100% coverage on a build where the real app components were all
   * minified. Identifying-ness, not name length, is the property that matters.
   */
  const GENERIC_NAME = new RegExp(
    [
      '^Styled\\(',           // emotion / MUI styled()
      '^ForwardRef',          // React.forwardRef default naming
      '^Memo\\(',             // React.memo default naming
      '^Context(Provider|Consumer)$',
      '^[A-Za-z]*Primitive\\.', // Radix / assistant-ui primitives
      '^Primitive\\.',
      '^Fragment$',
      '^Suspense$',
      '^ErrorBoundary$',
      '^Portal$',
      '^Slot$',
      '^Provider$',
      '^Root$',
    ].join('|'),
  );

  function isGenericName(name) {
    return Boolean(name) && GENERIC_NAME.test(name);
  }

  /**
   * The signal that actually matters: a name that could plausibly be grepped
   * for in application source and land on a component definition.
   */
  function isIdentifyingName(name) {
    if (!name) return false;
    if (looksMinified(name)) return false;
    if (isGenericName(name)) return false;
    return true;
  }

  /** Nearest ancestor component whose name actually identifies app source. */
  function nearestIdentifyingComponent(fiber) {
    let node = fiber;
    while (node) {
      const name = componentName(node.type);
      if (isIdentifyingName(name)) return name;
      node = node.return;
    }
    return null;
  }

  // ----------------------------------------------------------
  // Source location — try every known shape
  // ----------------------------------------------------------

  /**
   * `_debugSource` was the classic carrier ({fileName, lineNumber}). It has
   * moved and in some React versions been removed entirely, so probe several
   * shapes and report which one hit.
   */
  function extractSource(fiber, props) {
    if (!fiber) return null;

    if (fiber._debugSource && fiber._debugSource.fileName) {
      return {
        via: '_debugSource',
        file: fiber._debugSource.fileName,
        line: fiber._debugSource.lineNumber ?? null,
        column: fiber._debugSource.columnNumber ?? null,
      };
    }

    // Classic JSX transform can leave the source on props as __source.
    if (props && props.__source && props.__source.fileName) {
      return {
        via: 'props.__source',
        file: props.__source.fileName,
        line: props.__source.lineNumber ?? null,
        column: props.__source.columnNumber ?? null,
      };
    }

    // Owner's memoized element may carry it even when the fiber does not.
    const owner = fiber._debugOwner;
    if (owner && owner._debugSource && owner._debugSource.fileName) {
      return {
        via: '_debugOwner._debugSource',
        file: owner._debugSource.fileName,
        line: owner._debugSource.lineNumber ?? null,
        column: owner._debugSource.columnNumber ?? null,
      };
    }

    return null;
  }

  /** Report which debug fields exist at all, so a miss is diagnosable. */
  function debugFieldsPresent(fiber) {
    if (!fiber) return [];
    return [
      '_debugSource',
      '_debugOwner',
      '_debugInfo',
      '_debugStack',
      '_debugTask',
      '_debugHookTypes',
    ].filter((k) => fiber[k] != null);
  }

  // ----------------------------------------------------------
  // Fiber chains
  // ----------------------------------------------------------

  /** Parent chain via `fiber.return` — DOM-structural ancestry. */
  function returnChain(fiber) {
    const chain = [];
    let node = fiber ? fiber.return : null;
    while (node && chain.length < MAX_CHAIN) {
      const name = componentName(node.type);
      if (name) chain.push(name);
      node = node.return;
    }
    return chain.reverse();
  }

  /**
   * Owner chain via `fiber._debugOwner` — which component's JSX actually
   * contains this element. Closer to "where is this in source" than the return
   * chain, but dev-build only.
   */
  function ownerChain(fiber) {
    const chain = [];
    let node = fiber ? fiber._debugOwner : null;
    while (node && chain.length < MAX_CHAIN) {
      const name = componentName(node.type);
      if (name) chain.push(name);
      node = node._debugOwner;
    }
    return chain.reverse();
  }

  /** Nearest named component at or above this fiber. */
  function nearestComponent(fiber) {
    let node = fiber;
    while (node) {
      const name = componentName(node.type);
      if (name) return name;
      node = node.return;
    }
    return null;
  }

  // ----------------------------------------------------------
  // Framework-independent DOM signals
  // ----------------------------------------------------------

  const TESTID_ATTRS = [
    'data-testid',
    'data-test-id',
    'data-test',
    'data-cy',
    'data-qa',
    'data-automation-id',
  ];

  function findTestId(el) {
    for (const attr of TESTID_ATTRS) {
      const value = el.getAttribute(attr);
      if (value) return { attribute: attr, value, own: true };
    }
    // An ancestor testid still narrows the search usefully.
    let node = el.parentElement;
    let hops = 0;
    while (node && hops < 6) {
      for (const attr of TESTID_ATTRS) {
        const value = node.getAttribute(attr);
        if (value) return { attribute: attr, value, own: false, hops: hops + 1 };
      }
      node = node.parentElement;
      hops++;
    }
    return null;
  }

  /** Approximate accessible name. Not the full accname algorithm. */
  function accessibleName(el) {
    const label = el.getAttribute('aria-label');
    if (label) return { name: label.trim(), from: 'aria-label' };

    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const parts = labelledBy
        .split(/\s+/)
        .map((id) => el.ownerDocument.getElementById(id))
        .filter(Boolean)
        .map((n) => (n.textContent || '').trim())
        .filter(Boolean);
      if (parts.length) return { name: parts.join(' '), from: 'aria-labelledby' };
    }

    if (el.id) {
      const explicit = el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (explicit && explicit.textContent.trim()) {
        return { name: explicit.textContent.trim(), from: 'label[for]' };
      }
    }

    const alt = el.getAttribute('alt');
    if (alt) return { name: alt.trim(), from: 'alt' };

    const title = el.getAttribute('title');
    if (title) return { name: title.trim(), from: 'title' };

    const placeholder = el.getAttribute('placeholder');
    if (placeholder) return { name: placeholder.trim(), from: 'placeholder' };

    return null;
  }

  /**
   * Text that is plausibly a literal in source. Prefers the element's own text
   * nodes; falls back to descendant text only when the element is small.
   */
  function literalText(el) {
    const ownText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent.trim())
      .filter(Boolean)
      .join(' ');

    if (ownText) {
      return {
        text: ownText.slice(0, TEXT_LIMIT),
        truncated: ownText.length > TEXT_LIMIT,
        from: 'own-text-nodes',
      };
    }

    const all = (el.textContent || '').trim().replace(/\s+/g, ' ');
    if (!all) return null;
    // A huge subtree's text is not a source literal, it's the whole page.
    if (el.querySelectorAll('*').length > 20) {
      return { text: all.slice(0, TEXT_LIMIT), truncated: true, from: 'subtree-large' };
    }
    return {
      text: all.slice(0, TEXT_LIMIT),
      truncated: all.length > TEXT_LIMIT,
      from: 'subtree',
    };
  }

  /**
   * Text that is clearly runtime data will never grep. Distinguishing it from a
   * source literal matters more than whether text exists at all — "Download" is
   * a lead, "feedback-dashboard.html" and "Vineet Kumar" are dead ends.
   * Conservative: only flags shapes that are unambiguously data.
   */
  function looksLikeRuntimeData(text) {
    if (!text) return null;
    const reasons = [];
    if (/\.[a-z]{2,5}(\s|$)/i.test(text) && /[\w-]+\.[a-z]{2,5}/i.test(text)) reasons.push('filename-like');
    if (/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(text)) reasons.push('email');
    if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(text)) reasons.push('uuid');
    if (/https?:\/\//i.test(text)) reasons.push('url');
    if (/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(text)) reasons.push('date');
    if (/^\s*[\d,.$%]+\s*$/.test(text)) reasons.push('numeric');
    return reasons.length ? reasons : null;
  }

  /**
   * Framework-independent class analysis.
   *
   * The general principle — not a MUI special case: **class strings are usually
   * written literally in component source**, so whatever survives hash
   * filtering is a grep candidate. That holds for Tailwind, BEM, CSS Modules,
   * Bootstrap, Ant, Chakra and hand-written CSS alike. It fails only for
   * runtime-hashed CSS-in-JS output (`css-1a2b3c`, `sc-xyz`), which is exactly
   * what `isHashClass` strips.
   *
   * On top of that floor, recognised conventions additionally yield a component
   * name and its variant props. MUI is one flavour:
   *   MuiButton-root MuiButton-outlined MuiButton-colorPrimary
   *     -> <Button variant="outlined" color="primary">
   */
  const CONVENTIONS = [
    {
      id: 'mui',
      test: (cs) => cs.some((c) => /^Mui[A-Z]/.test(c)),
      parse: (cs) => {
        const own = cs.filter((c) => /^Mui[A-Z]/.test(c));
        const components = Array.from(new Set(own.map((c) => c.split('-')[0])));
        const modifiers = own.map((c) => c.split('-').slice(1).join('-')).filter((m) => m && m !== 'root');
        return { component: components[0] ? components[0].replace(/^Mui/, '') : null, modifiers, matched: own };
      },
    },
    {
      id: 'css-modules',
      // Already hash-stripped to `Button_root` by stableClassForm.
      test: (cs, raw) => raw.some((c) => cssModuleBase(c)),
      parse: (cs, raw) => {
        const bases = raw.map(cssModuleBase).filter(Boolean);
        return {
          component: bases[0] ? bases[0].split('_')[0] : null,
          modifiers: bases.map((b) => b.split('_').slice(1).join('_')).filter(Boolean),
          matched: bases,
        };
      },
    },
    {
      id: 'ant',
      test: (cs) => cs.some((c) => /^ant-[a-z]/.test(c)),
      parse: (cs) => {
        const own = cs.filter((c) => /^ant-[a-z]/.test(c));
        const base = own.reduce((a, b) => (a && a.length <= b.length ? a : b), null);
        return {
          component: base ? base.replace(/^ant-/, '') : null,
          modifiers: own.filter((c) => c !== base).map((c) => c.replace(base + '-', '')),
          matched: own,
        };
      },
    },
    {
      id: 'bem',
      // block__element--modifier. cssModuleBase() already claimed the hashed ones.
      test: (cs, raw) => cs.some((c) => /^[a-z][\w-]*__[\w-]+/.test(c)) && !raw.some(cssModuleBase),
      parse: (cs) => {
        const own = cs.filter((c) => /^[a-z][\w-]*__[\w-]+/.test(c));
        return {
          component: own[0] ? own[0].split('__')[0] : null,
          modifiers: own.map((c) => (c.split('--')[1] || '')).filter(Boolean),
          matched: own,
        };
      },
    },
    {
      id: 'bootstrap',
      test: (cs) => cs.includes('btn') || cs.some((c) => /^(card|navbar|form-control|badge|alert)$/.test(c)),
      parse: (cs) => {
        const base = cs.find((c) => /^(btn|card|navbar|badge|alert|form-control)$/.test(c));
        return {
          component: base || null,
          modifiers: cs.filter((c) => base && c.startsWith(base + '-')).map((c) => c.slice(base.length + 1)),
          matched: cs.filter((c) => base && (c === base || c.startsWith(base + '-'))),
        };
      },
    },
    {
      id: 'utility',
      // Tailwind-ish. No component name, but the class string itself greps well.
      test: (cs) =>
        cs.filter((c) => /^(sm:|md:|lg:|xl:|hover:|focus:|dark:)?[a-z-]+(-[\w./[\]%]+)*$/.test(c)).length >= 4,
      parse: (cs) => ({ component: null, modifiers: [], matched: cs }),
    },
  ];

  function classConventionSignal(el) {
    const all = Array.from(el.classList);
    const stable = all.map(stableClassForm).filter(Boolean);
    if (stable.length === 0) return null;

    const hit = CONVENTIONS.find((c) => c.test(stable, all));
    const parsed = hit ? hit.parse(stable, all) : { component: null, modifiers: [], matched: [] };

    return {
      convention: hit ? hit.id : 'unknown',
      component: parsed.component,
      modifiers: parsed.modifiers,
      /** Best guess at the source element, when the convention supports one. */
      reconstructed: parsed.component
        ? `<${parsed.component}${parsed.modifiers.length ? ' ' + parsed.modifiers.join(' ') : ''}>`
        : null,
      /**
       * The universal floor: stable classes are grep candidates in almost any
       * codebase, convention recognised or not.
       */
      grepClasses: stable,
    };
  }

  const LANDMARK_SELECTOR =
    'main, nav, header, footer, aside, form, dialog, ' +
    '[role="main"], [role="navigation"], [role="banner"], [role="dialog"], ' +
    '[role="tabpanel"], [role="region"], [role="search"], [role="form"], ' +
    'section[aria-label], section[aria-labelledby]';

  function landmarkPath(el) {
    const path = [];
    let node = el.parentElement;
    while (node && path.length < 6) {
      if (node.matches(LANDMARK_SELECTOR)) {
        const role = node.getAttribute('role');
        const tag = node.tagName.toLowerCase();
        const label = node.getAttribute('aria-label');
        let entry = role ? `${tag}[role=${role}]` : tag;
        if (label) entry += `("${label.slice(0, 24)}")`;
        path.push(entry);
      }
      node = node.parentElement;
    }
    return path.reverse();
  }

  // ----------------------------------------------------------
  // Selector generation — mirrors src/picker/selector-engine.ts closely
  // enough to judge whether hash filtering helps.
  // ----------------------------------------------------------

  // Fully runtime-generated: nothing recoverable, drop entirely.
  const HASH_CLASS = /^(css-[a-z0-9]+|e[a-z0-9]{7,}|sc-[a-zA-Z0-9]+)$/;

  /**
   * CSS Modules are *partly* hashed — `Button_root__a1b2c` keeps a source-derived
   * prefix. Don't drop these; strip the hash and keep `Button_root`, which greps.
   * Discriminated from BEM (`card__header--active`) by the suffix looking like a
   * hash: short, alphanumeric, contains a digit, no hyphens.
   */
  const CSS_MODULE = /^([A-Za-z][\w]*(?:_[\w]+)*)__([A-Za-z0-9]{4,10})$/;

  function cssModuleBase(c) {
    const m = c.match(CSS_MODULE);
    return m && /\d/.test(m[2]) ? m[1] : null;
  }

  function isHashClass(c) {
    return HASH_CLASS.test(c);
  }

  /** Stable, grep-worthy form of a class, or null if it's pure hash. */
  function stableClassForm(c) {
    if (isHashClass(c)) return null;
    return cssModuleBase(c) || c;
  }

  function isUnique(doc, sel) {
    try {
      return doc.querySelectorAll(sel).length === 1;
    } catch {
      return false;
    }
  }

  function buildSelector(el, { filterHashes }) {
    const doc = el.ownerDocument;

    const classesOf = (node) => {
      const list = Array.from(node.classList);
      return filterHashes ? list.filter((c) => !isHashClass(c)) : list;
    };

    if (el.id) {
      const sel = `#${CSS.escape(el.id)}`;
      if (isUnique(doc, sel)) return sel;
    }

    const testId = el.getAttribute('data-testid');
    if (testId) {
      const sel = `[data-testid="${testId}"]`;
      if (isUnique(doc, sel)) return sel;
    }

    const tag = el.tagName.toLowerCase();
    const own = classesOf(el);
    if (own.length) {
      const sel = tag + own.map((c) => `.${CSS.escape(c)}`).join('');
      if (isUnique(doc, sel)) return sel;
    }

    const parts = [];
    let current = el;
    while (current && current !== doc.body && current !== doc.documentElement) {
      let segment = current.tagName.toLowerCase();
      if (current.id) {
        parts.unshift(`#${CSS.escape(current.id)}`);
        break;
      }
      const cls = classesOf(current);
      if (cls.length) segment += cls.map((c) => `.${CSS.escape(c)}`).join('');

      const parent = current.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter(
          (c) => c.tagName === current.tagName,
        );
        if (sameTag.length > 1) {
          segment += `:nth-child(${Array.from(parent.children).indexOf(current) + 1})`;
        }
      }
      parts.unshift(segment);
      const candidate = parts.join(' > ');
      if (isUnique(doc, candidate)) return candidate;
      current = parent;
    }
    return parts.join(' > ');
  }

  // ----------------------------------------------------------
  // Portal detection
  // ----------------------------------------------------------

  /**
   * A portal shows up as a divergence: the React parent chain leads somewhere
   * the DOM parent chain does not. Detected by checking whether the nearest
   * host-component ancestor in the fiber tree is also a DOM ancestor.
   */
  function detectPortal(el, fiber) {
    if (!fiber) return { portaled: null, reason: 'no-fiber' };
    let node = fiber.return;
    while (node) {
      if (typeof node.type === 'string' && node.stateNode instanceof Element) {
        const contains = node.stateNode.contains(el);
        return {
          portaled: !contains,
          fiberParentTag: node.type,
          domParentTag: el.parentElement ? el.parentElement.tagName.toLowerCase() : null,
        };
      }
      node = node.return;
    }
    return { portaled: null, reason: 'no-host-ancestor' };
  }

  // ----------------------------------------------------------
  // Single-element probe
  // ----------------------------------------------------------

  function inspect(el) {
    if (!el || el.nodeType !== 1) {
      console.warn('[dnProbe] not an element:', el);
      return null;
    }

    const fiber = getFiber(el);
    const props = getProps(el);
    const source = extractSource(fiber, props);
    const owners = ownerChain(fiber);
    const returns = returnChain(fiber);
    const nearest = nearestComponent(fiber);
    const chain = owners.length ? owners : returns;
    const minified = chain.length > 0 && chain.filter(looksMinified).length > chain.length / 2;

    const identifying = nearestIdentifyingComponent(fiber);
    const testId = findTestId(el);
    const accName = accessibleName(el);
    const text = literalText(el);
    const landmarks = landmarkPath(el);
    const classConvention = classConventionSignal(el);

    if (text) {
      text.runtimeDataReasons = looksLikeRuntimeData(text.text);
      text.isSourceLiteral =
        !text.runtimeDataReasons && text.from !== 'subtree-large';
    }

    const rawSelector = buildSelector(el, { filterHashes: false });
    const cleanSelector = buildSelector(el, { filterHashes: true });

    // Signal tiering per plan §3.2 / Phase 0 gate.
    // Tier 2 requires an *identifying* name — a generic library wrapper like
    // Styled(div) is not a lead, however un-minified it looks.
    const tier1 = Boolean(source) || Boolean(testId && testId.own);
    const tier2 = Boolean(identifying) || Boolean(testId && !testId.own);
    const tier3 =
      Boolean(accName) || Boolean(text && text.isSourceLiteral) || Boolean(classConvention);

    let confidence = 'weak';
    if (source) confidence = 'exact';
    else if (tier1) confidence = 'strong';
    else if (tier2 && (testId || (text && text.isSourceLiteral))) confidence = 'strong';

    const record = {
      tag: el.tagName.toLowerCase(),
      react: {
        hasFiber: Boolean(fiber),
        source,
        debugFields: debugFieldsPresent(fiber),
        nearestComponent: nearest,
        nearestMinified: nearest ? looksMinified(nearest) : null,
        nearestGeneric: nearest ? isGenericName(nearest) : null,
        /** Nearest name that could actually be grepped for in app source. */
        nearestIdentifying: identifying,
        ownerChain: owners,
        returnChain: returns,
        chainMinified: minified,
        // KEYS ONLY — values are deliberately never recorded.
        propKeys: props ? Object.keys(props).filter((k) => k !== 'children') : [],
      },
      dom: {
        testId,
        accessibleName: accName,
        literalText: text,
        landmarkPath: landmarks,
        role: el.getAttribute('role'),
        classConvention,
      },
      selector: {
        raw: rawSelector,
        filtered: cleanSelector,
        rawLength: rawSelector.length,
        filteredLength: cleanSelector.length,
        improved: cleanSelector.length < rawSelector.length,
        filteredStillUnique: isUnique(el.ownerDocument, cleanSelector),
        hashClasses: Array.from(el.classList).filter(isHashClass),
        stableClasses: Array.from(el.classList).filter((c) => !isHashClass(c)),
      },
      portal: detectPortal(el, fiber),
      tiers: { tier1, tier2, tier3 },
      confidence,
      // Strings worth grepping in the target repo. Generic wrapper names and
      // runtime data are deliberately excluded — they only waste grep budget.
      grepCandidates: [
        testId && testId.value,
        identifying,
        accName && accName.name,
        text && text.isSourceLiteral ? text.text : null,
      ].filter(Boolean),
      route: location.pathname + location.search,
    };

    return record;
  }

  // ----------------------------------------------------------
  // Click-to-sample mode
  // ----------------------------------------------------------

  const samples = [];
  let capturing = false;
  let hud = null;
  let outline = null;

  function ensureChrome() {
    if (hud) return;

    hud = document.createElement('div');
    Object.assign(hud.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: '2147483647',
      background: '#1b1b1b',
      color: '#fff',
      font: '12px/1.5 ui-monospace, monospace',
      padding: '10px 14px',
      borderRadius: '8px',
      boxShadow: '0 4px 16px rgba(0,0,0,.4)',
      pointerEvents: 'none',
      whiteSpace: 'pre',
    });
    document.body.appendChild(hud);

    outline = document.createElement('div');
    Object.assign(outline.style, {
      position: 'fixed',
      zIndex: '2147483646',
      border: '2px solid #ff5c00',
      background: 'rgba(255,92,0,.08)',
      pointerEvents: 'none',
      display: 'none',
      borderRadius: '2px',
    });
    document.body.appendChild(outline);
  }

  function updateHud() {
    if (!hud) return;
    const withT1 = samples.filter((s) => s.tiers.tier1).length;
    hud.textContent =
      `dnProbe  ${samples.length} sampled\n` +
      `tier1: ${withT1}  |  Alt+Click to add\n` +
      `Esc to stop, then __dnProbe.report()`;
  }

  function onMove(e) {
    if (!capturing || !outline) return;
    const el = e.target;
    if (!el || el === hud || el === outline) return;
    const r = el.getBoundingClientRect();
    Object.assign(outline.style, {
      display: 'block',
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
  }

  function onClick(e) {
    if (!capturing || !e.altKey) return;
    e.preventDefault();
    e.stopPropagation();

    let record = null;
    try {
      record = inspect(e.target);
    } catch (err) {
      console.error('[dnProbe] inspect failed:', err);
      return;
    }
    if (!record) return;

    samples.push(record);
    updateHud();
    console.log(
      `[dnProbe] #${samples.length} ${record.tag} ` +
        `[${record.confidence}] ` +
        `${record.react.nearestComponent || 'no-component'}` +
        `${record.dom.testId ? ' testid=' + record.dom.testId.value : ''}`,
      record,
    );
  }

  function onKey(e) {
    if (e.key === 'Escape' && capturing) stop();
  }

  function start() {
    if (capturing) return;
    capturing = true;
    ensureChrome();
    outline.style.display = 'none';
    updateHud();
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    console.log('[dnProbe] capture ON — Alt+Click elements to sample, Esc to stop.');
  }

  function stop() {
    capturing = false;
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    if (outline) outline.style.display = 'none';
    if (hud) hud.textContent = `dnProbe  ${samples.length} sampled (stopped)\n__dnProbe.report()`;
    console.log(`[dnProbe] capture OFF — ${samples.length} samples. Run __dnProbe.report()`);
  }

  // ----------------------------------------------------------
  // Aggregate report + Phase 0 gate
  // ----------------------------------------------------------

  function pct(n, total) {
    return total === 0 ? 0 : Math.round((n / total) * 100);
  }

  function report() {
    const env = detectReact();
    const n = samples.length;

    if (n === 0) {
      console.warn('[dnProbe] no samples. Run __dnProbe.start() and Alt+Click some elements.');
      return null;
    }

    const count = (fn) => samples.filter(fn).length;

    const stats = {
      environment: {
        url: location.origin,
        routes: Array.from(new Set(samples.map((s) => s.route))),
        react: env,
        inferredBuild: inferBuild(samples),
        sampledAt: new Date().toISOString(),
        sampleCount: n,
      },
      signals: {
        hasFiber: pct(count((s) => s.react.hasFiber), n),
        sourceLocation: pct(count((s) => s.react.source), n),
        ownTestId: pct(count((s) => s.dom.testId && s.dom.testId.own), n),
        anyTestId: pct(count((s) => s.dom.testId), n),
        // The one that matters: a name that could land on app source.
        identifyingComponent: pct(count((s) => s.react.nearestIdentifying), n),
        genericWrapperOnly: pct(
          count((s) => s.react.nearestComponent && !s.react.nearestIdentifying),
          n,
        ),
        accessibleName: pct(count((s) => s.dom.accessibleName), n),
        sourceLiteralText: pct(count((s) => s.dom.literalText && s.dom.literalText.isSourceLiteral), n),
        runtimeDataText: pct(
          count((s) => s.dom.literalText && s.dom.literalText.runtimeDataReasons),
          n,
        ),
        classConvention: pct(count((s) => s.dom.classConvention), n),
        classConventionRecognised: pct(
          count((s) => s.dom.classConvention && s.dom.classConvention.convention !== 'unknown'),
          n,
        ),
        componentFromClasses: pct(count((s) => s.dom.classConvention && s.dom.classConvention.component), n),
        landmarkPath: pct(count((s) => s.dom.landmarkPath.length > 0), n),
      },
      tiers: {
        tier1: pct(count((s) => s.tiers.tier1), n),
        tier1or2: pct(count((s) => s.tiers.tier1 || s.tiers.tier2), n),
        tier3only: pct(count((s) => !s.tiers.tier1 && !s.tiers.tier2 && s.tiers.tier3), n),
        noSignal: pct(count((s) => !s.tiers.tier1 && !s.tiers.tier2 && !s.tiers.tier3), n),
      },
      selectors: {
        hashFilteringImproved: pct(count((s) => s.selector.improved), n),
        filteredStillUnique: pct(count((s) => s.selector.filteredStillUnique), n),
        avgRawLength: Math.round(samples.reduce((a, s) => a + s.selector.rawLength, 0) / n),
        avgFilteredLength: Math.round(samples.reduce((a, s) => a + s.selector.filteredLength, 0) / n),
      },
      portals: {
        detected: count((s) => s.portal.portaled === true),
        undetermined: count((s) => s.portal.portaled === null),
      },
      sourceVia: samples
        .filter((s) => s.react.source)
        .reduce((acc, s) => {
          acc[s.react.source.via] = (acc[s.react.source.via] || 0) + 1;
          return acc;
        }, {}),
      debugFieldsSeen: Array.from(
        new Set(samples.flatMap((s) => s.react.debugFields)),
      ),
    };

    // Phase 0 gate: >=80% of samples carry a Tier 1-2 signal.
    const gatePass = stats.tiers.tier1or2 >= 80;
    stats.gate = {
      criterion: 'Tier 1-2 signal present on >=80% of sampled elements',
      actual: `${stats.tiers.tier1or2}%`,
      verdict: gatePass ? 'PASS' : 'FAIL',
    };

    console.log(
      `%c[dnProbe] Phase 0 gate: ${stats.gate.verdict} (${stats.gate.actual})`,
      `font-weight:bold;color:${gatePass ? '#0a0' : '#c00'}`,
    );
    if (stats.environment.routes.length === 1) {
      console.warn(
        `[dnProbe] all ${n} samples came from one route ` +
          `(${stats.environment.routes[0]}). Sample across screens before trusting this.`,
      );
    }
    if (stats.portals.detected === 0) {
      console.warn('[dnProbe] no portaled elements sampled — the dialog/drawer case is untested.');
    }

    console.log('Environment:', stats.environment);
    console.table(stats.signals);
    console.table(stats.tiers);
    console.table(stats.selectors);
    if (Object.keys(stats.sourceVia).length) console.log('source via:', stats.sourceVia);
    console.log('debug fields seen on fibers:', stats.debugFieldsSeen);

    // Grep worksheet — paste these into the target repo.
    console.log('\n--- grep worksheet (run these in the target repo) ---');
    samples.forEach((s, i) => {
      const c = s.grepCandidates.slice(0, 2);
      if (c.length) {
        console.log(`#${i + 1} [${s.confidence}] ${c.map((x) => JSON.stringify(x)).join('  |  ')}`);
      } else {
        console.log(`#${i + 1} [${s.confidence}] (no grep candidates)`);
      }
    });

    return stats;
  }

  function toJSON() {
    return JSON.stringify({ report: report(), samples }, null, 2);
  }

  async function copy() {
    const payload = toJSON();
    try {
      await navigator.clipboard.writeText(payload);
      console.log(
        `[dnProbe] copied ${payload.length} chars to clipboard.\n` +
          '  WARNING: anything you copy next will overwrite this. ' +
          'Prefer __dnProbe.download().',
      );
    } catch {
      console.log('[dnProbe] clipboard blocked — copy the string below manually');
      console.log(payload);
    }
    return payload.length;
  }

  /**
   * Preferred over copy(). Writes straight to the browser's download folder, so
   * there is no clipboard round-trip to clobber.
   */
  function download(label) {
    const payload = toJSON();
    const tag = label || (detectReact().build === 'production' ? 'prod' : 'dev');
    const name = `phase-0-findings-${tag}.json`;

    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1000);

    console.log(`[dnProbe] downloading ${name} (${payload.length} chars)`);
    return name;
  }

  function reset() {
    samples.length = 0;
    updateHud();
    console.log('[dnProbe] samples cleared');
  }

  function teardown() {
    stop();
    if (hud) hud.remove();
    if (outline) outline.remove();
    hud = null;
    outline = null;
    delete window.__dnProbe;
    console.log('[dnProbe] removed');
  }

  window.__dnProbe = {
    env: detectReact,
    inspect,
    start,
    stop,
    report,
    download,
    copy,
    toJSON,
    reset,
    teardown,
    samples,
  };

  const env = detectReact();
  console.log(
    '%c[dnProbe] ready',
    'font-weight:bold;color:#ff5c00',
    `\nReact: ${env.present ? env.version || 'detected' : 'NOT DETECTED'} (${env.build})`,
    '\n\n  __dnProbe.start()     Alt+Click to sample, Esc to stop',
    '\n  __dnProbe.report()    aggregate stats + gate verdict',
    '\n  __dnProbe.download()  full JSON to your downloads folder',
  );
})();
