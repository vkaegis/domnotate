# Token-Efficient Context Formats for LLM Web Agents

Research synthesis from 20+ papers and 10+ production frameworks, conducted for Domnotate's compact export feature.

## Format Comparison

| Format | Relative Tokens | Notes |
|--------|----------------|-------|
| Raw HTML | 100% (baseline) | Tags cost 3-5 tokens each; scripts/styles waste most budget |
| Cleaned HTML | ~40-60% | Strip scripts, styles, nav, ads |
| Accessibility Tree | ~20-50% | Playwright MCP uses YAML AX snapshots with ref= attributes |
| Semantic Markdown | ~5-15% | SearchCans 2026: 40k → 1.5k tokens on typical pages |
| TOON/CSV | ~4-10% | Best for structured/tabular data |
| Indexed flat format | ~5-15% | Browser-Use, Mind2Web convergence point |

## Key Findings

**SearchCans 2026 Benchmark** (100 real-world pages): Semantic Markdown achieved 89% retrieval accuracy vs 71% for plain text and 62% for raw HTML. Structure preservation matters more than compression alone.

**Agent-E** (Emergence AI): DOM distillation via accessibility trees with three modes (text-only, input fields, all content). 73.2% on WebVoyager — 20% above previous text-only SOTA.

**AgentOccam** (ICLR 2025): 29.4% improvement by restructuring observations into concise Markdown. Aligning format with LLM pretraining data significantly impacts performance.

**Playwright MCP**: YAML-formatted accessibility snapshots with machine-readable `ref=` attributes alongside human-readable descriptions. Deterministic element targeting without coordinates.

**Mind2Web**: Two-stage filtering — fine-tuned small LM ranks candidate elements, then LLM processes cleaned HTML snippets.

**Prune4Web / FocusAgent**: Task-relevant filtering provides 50-80% additional reduction beyond format conversion.

## What to Strip

1. `<script>`, `<style>`, `<noscript>`, `<svg>` (inline), `<meta>`, `<link>`
2. Navigation, footers, ads, cookie banners
3. Redundant selectors — one unique selector is sufficient (CSS preferred over XPath)
4. Decorative formatting — bold markers, horizontal rules, nested headers
5. Timestamps on ephemeral actions (e.g., "just now" on comments)

## Compression Techniques (Ranked)

1. **Relevance filtering** (50-80%): Only include task-relevant elements
2. **Format conversion** (40-95%): HTML → Markdown/indexed format
3. **Selector deduplication** (10-20%): One selector strategy, not three
4. **Integer rounding** (2-5%): Drop decimal precision on dimensions
5. **Comment flattening** (5-10%): Remove threading overhead, author dedup

## Domnotate-Specific Recommendations

- **Primary win**: Drop XPath + DOM Path selectors → CSS selector only (saves ~30% per annotation)
- **Secondary win**: Flatten comment threads, skip decorative markdown → ~20% additional
- **Tertiary win**: Integer dimensions, skip redundant headers → ~5%
- **Combined target**: ~50% token reduction vs current markdown format
- **Preserve**: Text preview, CSS selector, status, dimensions — these are what agents actually use for element identification and task grounding

## References

- SearchCans (2026): Semantic markdown RAG benchmark
- Agent-E, Emergence AI: DOM distillation for web agents
- AgentOccam, ICLR 2025: Observation space optimization
- Playwright MCP: Accessibility tree snapshots
- Mind2Web: Two-stage element filtering
- Prune4Web: Task-relevant DOM pruning
- FocusAgent: Selective attention for web navigation
- TOON: Token-optimized notation for structured data
- Firecrawl: Production HTML→Markdown conversion
- WebClaw: Compact accessibility tree format (51-79% reduction over full AX tree)
