# `shopee-awb-sku-exporter` Repository Instructions

## Operating principles

- Work pragmatically, directly, and toward a verified result.
- Inspect the real repository, fixture, documentation, and current Git state before making material recommendations or changes.
- Produce the smallest complete solution that satisfies the approved request.
- Keep explanations concise and never claim success without evidence from checks that were actually run.

## Workflow authority

- **Superpowers is the only workflow router and lifecycle authority.** Use it for brainstorming, design approval, implementation planning, worktrees when appropriate, test-driven development, debugging, subagent execution, review, verification, and branch completion.
- Start with the relevant Superpowers skill. Do not jump directly into scaffolding or implementation.
- Follow the Superpowers design gate: inspect the project and test fixture, clarify only genuinely blocking questions, compare viable approaches, recommend one, write the approved design to `docs/superpowers/specs/YYYY-MM-DD-shopee-awb-sku-exporter-design.md`, self-review it, commit it, and wait for explicit user approval before writing the implementation plan.
- After design approval, use the Superpowers planning and implementation workflow. Prefer small, independently verifiable tasks and targeted subagents where they provide real value.

## Bounded Agent Skills guidance

Use `addyosmani/agent-skills` only as bounded domain guidance for:

- `source-driven-development`
- `api-and-interface-design` when defining module boundaries or extension interfaces
- `security-and-hardening`
- `performance-optimization` only when supported by measurements
- `documentation-and-adrs` only for decisions that genuinely need an ADR

Do not use Agent Skills as a second workflow router. Disable or avoid its overlapping specification, planning, TDD, debugging, browser-testing, frontend, review, simplification, Git workflow, and shipping workflows when Superpowers already owns that phase.

## Repository and privacy rules

- Use official primary documentation for Chrome Extensions Manifest V3, Microsoft Edge extension compatibility, and PDF.js or any chosen dependency. Record material sources in the design or README.
- Use Conventional Commits. Keep commits atomic and do not commit generated build artifacts or sensitive fixtures.
- Never stage, commit, copy into documentation, or print customer names, addresses, phone numbers, order numbers, tracking numbers, or other personal data from `RESI.pdf`.
- Use `RESI.pdf` only for local integration verification. Automated tests must use synthetic, redacted fixtures. Any local expected-summary artifact derived from the real file must remain ignored and must not contain customer or shipment identifiers.
- The extension must operate entirely on-device. Do not add analytics, telemetry, cloud services, backend calls, authentication, sync, OCR, or unrelated marketplace support without explicit approval.
- Do not configure a remote, create a GitHub repository, or push anything unless explicitly requested.

## Engineering constraints

- Prefer deterministic extraction from structured DOM/accessibility text, then local PDF text bytes, and only use a narrowly scoped fallback if inspection proves both are unavailable.
- Keep adapters separate from normalized product rows, validation and warnings, aggregation, CSV serialization, and browser download behavior.
- Preserve SKU text exactly enough to retain leading zeroes and meaningful punctuation; parse Qty as a positive integer; aggregate duplicate SKUs in first-seen order.
- Use the smallest practical Manifest V3 permission set. Never request `<all_urls>` or unrelated host access.
- Never silently invent missing SKU or quantity values. Partial extraction must be visible and require explicit user action before download.
- Never claim success without running and reporting the relevant verification commands.

