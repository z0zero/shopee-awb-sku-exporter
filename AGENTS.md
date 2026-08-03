# `shopee-awb-sku-exporter` Repository Instructions

## Operating principles

- Work pragmatically, directly, and toward a verified result.
- Inspect the real repository, fixture, documentation, and current Git state before making material recommendations or changes.
- Produce the smallest complete solution that satisfies the approved request.
- Keep explanations concise and never claim success without evidence from checks that were actually run.

## Workflow and skill authority

- **Superpowers is the mandatory primary workflow router and lifecycle authority for every task.** Begin by invoking `superpowers:using-superpowers`, then invoke the relevant Superpowers lifecycle skill before asking questions, inspecting files, planning, editing, or running verification. The user does not need to repeat this instruction.
- Superpowers exclusively owns brainstorming, specification/design approval, implementation planning, worktrees, test-driven development, debugging, subagent dispatch/execution, code review, verification, and branch completion. Keep one Superpowers workflow active for the current phase; do not combine competing lifecycle workflows.
- Announce the selected Superpowers skill and purpose before acting. Follow its gates and checklists exactly unless a direct user instruction overrides it.
- Follow the design gate: inspect the project and privacy-safe fixture evidence, clarify only genuinely blocking questions, compare viable approaches, recommend one, write the approved design to `docs/superpowers/specs/YYYY-MM-DD-shopee-awb-sku-exporter-design.md`, self-review it, GPG-sign its commit, and wait for explicit user approval.
- After design approval, re-read the approved specification and use `superpowers:writing-plans`. Write and self-review the plan in the root project at `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`, GPG-sign the plan commit, and request explicit approval. Do not create an implementation worktree, scaffold, install dependencies, or implement before that approval.
- After plan approval, use `superpowers:using-git-worktrees` and create the implementation worktree under the repository's `.worktrees/` directory. Then use `superpowers:subagent-driven-development` or `superpowers:executing-plans`, plus the Superpowers TDD/debugging/review/verification/finishing skills required by that workflow.

## Auxiliary Agent Skills policy

- Use the `agent-skills` plugin only as bounded domain evidence or specialist guidance inside the current Superpowers-owned phase. Agent Skills must never route the task, change lifecycle sequencing, duplicate a Superpowers checklist, or bypass a Superpowers approval gate.
- If both plugins expose overlapping specification, planning, TDD, debugging, browser-testing, frontend, review, simplification, Git, or shipping workflows, invoke only the Superpowers version. Do not invoke the overlapping Agent Skills workflow.
- Use only these non-overlapping Agent Skills auxiliaries:
  - `source-driven-development` for every specification, design, plan, implementation, and review verification that depends on framework, browser, library, or tool behavior. Detect exact installed/planned versions, use official primary documentation, cite material sources, and mark unsupported claims as unverified.
  - `api-and-interface-design` only for module boundaries, message contracts, and extension interfaces while Superpowers owns the design or implementation phase.
  - `security-and-hardening` only for trust boundaries, permissions, untrusted DOM/PDF/CSV data, dependency supply chain, privacy, and abuse cases while Superpowers owns the phase.
  - `performance-optimization` only after measurements identify a bottleneck and Superpowers owns the implementation/debugging phase.
  - `documentation-and-adrs` only when a durable architectural decision genuinely requires an ADR; it must not replace the Superpowers design specification or implementation plan.
- Verify every subagent or reviewer claim before accepting it. Use repository evidence first; for version-sensitive claims, apply `source-driven-development` and current official primary documentation. Reject unsupported, stale, or scope-expanding recommendations.

### Phase ownership matrix

| Phase | Superpowers owner | Allowed Agent Skills auxiliary |
| --- | --- | --- |
| Discovery and design | `brainstorming` | `source-driven-development`; `api-and-interface-design`; `security-and-hardening` |
| Implementation planning | `writing-plans` | `source-driven-development`; bounded interface/security guidance |
| Implementation | `subagent-driven-development` or `executing-plans`; `test-driven-development` | bounded source/interface/security guidance |
| Debugging | `systematic-debugging` | `source-driven-development`; measured performance or security guidance |
| Review and verification | `requesting-code-review`; `verification-before-completion` | `source-driven-development` for every review; `security-and-hardening` when relevant |
| Worktrees and branch completion | `using-git-worktrees`; `finishing-a-development-branch` | none |

## Repository and privacy rules

- Use official primary documentation for Chrome Extensions Manifest V3, Microsoft Edge extension compatibility, and PDF.js or any chosen dependency. Record material sources in the design or README.
- Use Conventional Commits. Keep commits atomic and do not commit generated build artifacts or sensitive fixtures. Every new commit must be GPG-signed with `git commit -S`; run `git verify-commit HEAD` before reporting it as complete.
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
