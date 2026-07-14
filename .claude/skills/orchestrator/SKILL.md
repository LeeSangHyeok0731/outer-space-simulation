---
name: orchestrator
description: 'Coordinate the outer-space-simulation agent team for features, bug fixes, refactors, UI work, 3D scene and physics work, QA, code review, debugging, branch names, actual commits, PR creation, PR review comment replies, React Three Fiber rendering, and project architecture. Use this skill for implementation tasks, reviews, reruns, updates, revisions, partial reruns, follow-up fixes, Git workflow tasks, and requests to improve previous results. Simple one-off questions may be answered directly.'
---

# Orchestrator

Coordinate the outer-space-simulation harness. This skill routes work to the right specialists and keeps the implementation small, verifiable, and aligned with the repository.

## Execution Mode

Use agent team mode by default.

Team members:

| Agent                        | Type   | Model  | Role                                | Skill                               | Primary Output                                             |
| ---------------------------- | ------ | ------ | ----------------------------------- | ----------------------------------- | ---------------------------------------------------------- |
| `frontend-architect`         | custom | sonnet | Structure planning and scope control | `frontend-architecture`             | `_workspace/{phase}_frontend-architect_plan.md`            |
| `ui-implementation-engineer` | custom | sonnet | React, Tailwind, and R3F scene work | `ui-implementation`                 | `_workspace/{phase}_ui-implementation-engineer_changes.md` |
| `qa-inspector`               | custom | sonnet | Verification and regression checks  | `quality-gate`                      | `_workspace/{phase}_qa-inspector_report.md`                |
| `code-reviewer`              | custom | sonnet | Changed-file review                 | `code-review`                       | `_workspace/{phase}_code-reviewer_review.md`               |
| `bug-investigator`           | custom | sonnet | Root-cause debugging                | `systematic-debugging`              | `_workspace/{phase}_bug-investigator_report.md`            |
| `git-workflow-assistant`     | custom | haiku  | Commit, PR, and review workflow     | `commit` / `write-pr` / `review-pr` | `_workspace/{phase}_git-workflow-assistant_git.md`         |

This project has no server, no API layer, and no data-fetching stack, so there is no data-integration agent. Physics and rendering work belongs to `ui-implementation-engineer`, with `frontend-architect` owning state-ownership and Canvas-boundary decisions.

When invoking agents in a Claude harness that supports model selection, use the `model` value from each agent frontmatter unless the user explicitly asks for a different model.

## Phase 0: Context Check

Before starting work:

1. Check whether `_workspace/` exists.
2. Choose the run mode:
   - No `_workspace/`: initial run.
   - `_workspace/` exists and the user asks for a narrow correction: partial rerun. Read the relevant previous artifacts and update only the affected area.
   - `_workspace/` exists and the user provides a new broad request: fresh run. Preserve the old workspace by moving it to `_workspace_{YYYYMMDD_HHMMSS}/`, then create a new `_workspace/`.
3. Read `package.json`, dynamically discovered `.claude/rules/*.md`, root instruction files (`CLAUDE.md`, `AGENTS.md`) when present, and the relevant source files before assigning work.

`AGENTS.md` requires reading the relevant guide in `node_modules/next/dist/docs/` before writing framework-level code. Pass that requirement down to any agent doing Next.js work.

## Phase 1: Classify the Task

Classify the request into one or more tracks:

- Structure, state ownership, Canvas boundary, or scope: assign `frontend-architect`.
- Overlay UI, controls, scene objects, materials, shaders, or physics implementation: assign `ui-implementation-engineer`.
- Review, regression, or final acceptance: assign `qa-inspector`.
- Explicit code review, staged diff review, or pre-PR review: assign `code-reviewer`.
- Bugs, build failures, lint failures, type errors, runtime failures, or bodies behaving strangely: assign `bug-investigator` before implementation.
- Branch names, actual commits, logical commit splits, PR creation, or PR review comment replies: assign `git-workflow-assistant`.

For small tasks, use only the needed agents. For cross-cutting tasks, use the full team.

## Phase 2: Assign Work

Use a supervisor plus producer-reviewer workflow:

1. `frontend-architect` defines scope, ownership, and state placement.
2. `bug-investigator` runs before fixes when the task starts from a failure or unclear behavior.
3. `ui-implementation-engineer` implements only its owned areas.
4. `qa-inspector` verifies after each meaningful boundary, not only at the end.
5. `code-reviewer` reviews changed files for multi-file or pre-PR work.
6. `git-workflow-assistant` prepares or executes commit, PR creation, and PR review workflows when explicitly requested.
7. The orchestrator integrates findings and keeps the final response concise.

Expected task shape:

```text
TeamCreate(
  team_name: "simulation-team",
  members: [
    { name: "frontend-architect", agent_type: "frontend-architect", model: "sonnet" },
    { name: "ui-implementation-engineer", agent_type: "ui-implementation-engineer", model: "sonnet" },
    { name: "qa-inspector", agent_type: "qa-inspector", model: "sonnet" },
    { name: "code-reviewer", agent_type: "code-reviewer", model: "sonnet" },
    { name: "bug-investigator", agent_type: "bug-investigator", model: "sonnet" },
    { name: "git-workflow-assistant", agent_type: "git-workflow-assistant", model: "haiku" }
  ]
)
```

The example above is illustrative. Keep it synchronized with each agent's frontmatter.

## Data Flow

Use `_workspace/` for intermediate artifacts:

- `_workspace/00_input_request.md`
- `_workspace/01_frontend-architect_plan.md`
- `_workspace/02_ui-implementation-engineer_changes.md`
- `_workspace/03_qa-inspector_report.md`
- `_workspace/03_code-reviewer_review.md`
- `_workspace/01_bug-investigator_report.md`
- `_workspace/04_git-workflow-assistant_git.md`

`_workspace/` is gitignored. Preserve it after completion for audit and follow-up work.

## Bundled Resources

Use skill resources only when they help the active task:

- `commit/scripts/discover-changed-areas.sh` for commit and PR scope discovery.
- `commit/references/scope-guide.md` for scope/type selection.
- `write-pr/scripts/create-pr.sh` for explicit PR creation requests.
- `write-pr/references/labels.md` for PR label selection.
- `review-pr/scripts/get-pr-data.sh` for explicit PR review comment handling.
- `review-pr/scripts/reply-review-comment.sh` for explicit GitHub review replies.
- `review-pr/references/reply-formats.md` for Korean reply templates.
- `code-review/references/review-checklist.md` for multi-file or pre-PR reviews.
- `systematic-debugging/references/root-cause-tracing.md` for cross-boundary failures.

## Error Handling

| Situation                                 | Strategy                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| One agent fails or stalls                 | Retry once with the same narrowed task. If it fails again, continue with a clear gap in the final report. |
| Most agents fail                          | Stop and ask the user whether to continue with partial results.                                           |
| Conflicting findings                      | Keep both claims with file evidence, then inspect the source directly before deciding.                    |
| Validation command fails from environment | Report the environment cause separately from code issues and continue static checks.                      |
| Scope expands unexpectedly                | Return to `frontend-architect` to reduce scope before implementation continues.                           |

## Quality Gate

Before final delivery, run or request:

- `pnpm lint`
- `pnpm check-types`
- `pnpm build`

Static checks do not prove the scene still renders. When behavior changed, also run `pnpm dev` and observe it, or report that as residual risk.

## Test Scenarios

Normal flow:

1. User asks for a feature that touches the overlay and the simulation.
2. Architect decides state ownership and which side of the Canvas boundary each part lives on.
3. UI agent implements the overlay control and the scene/physics change.
4. QA runs the commands, then exercises the scene.
5. Final response reports changed behavior and validation results.

Partial rerun flow:

1. User asks to revise only a previous UI behavior.
2. Orchestrator reads `_workspace/` artifacts.
3. Only `ui-implementation-engineer` and `qa-inspector` are assigned.
4. The relevant artifact is updated and validation is rerun for the affected area.

Debugging flow:

1. User reports a bug, failed command, or a body behaving strangely.
2. `bug-investigator` reads the full error and traces the relevant boundary.
3. The implementation agent applies one root-cause fix.
4. `qa-inspector` runs the smallest meaningful check, then the broader quality gate when practical.

Git workflow flow:

1. User asks for a branch name, commit, PR creation, or PR review comment handling.
2. `git-workflow-assistant` inspects actual git state and relevant templates.
3. For commit requests, use `commit`.
4. For PR creation requests, use `write-pr`.
5. For PR review comment handling, use `review-pr`.
6. Do not commit, push, create PRs, or post replies unless the user explicitly requested that side effect.
