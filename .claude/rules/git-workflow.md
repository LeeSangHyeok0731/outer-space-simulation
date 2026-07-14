---
description: 'Branch, commit, PR text, and change grouping conventions for outer-space-simulation Git workflow and GitHub metadata.'
paths:
  - '.github/**/*'
  - '.claude/skills/commit/**/*'
  - '.claude/skills/write-pr/**/*'
  - '.claude/skills/review-pr/**/*'
  - '.claude/rules/git-workflow.md'
---

# Git Workflow Rules

Use these rules for branch names, commits, PR text, and change grouping.

## Branch Names

Use:

```text
<type>/<kebab-case-description>
```

Recommended types:

- `feat`
- `fix`
- `refactor`
- `style`
- `chore`
- `docs`
- `test`
- `ci`

Examples:

- `feat/add-time-scale-control`
- `fix/orbit-path-line-type`
- `chore/setup-claude-harness`

## Commit Messages

Use short Conventional Commit-style messages. Write the description in Korean:

```text
<type>: <한국어 설명>
```

Add a scope only when it improves clarity:

```text
feat(simulation): 시간 배속 컨트롤 추가
```

Scopes in this repository: `simulation` (physics/scene), `ui` (overlay panel), `app` (route/layout), `harness` (`.claude/**`), `config`.

Keep each commit focused on one logical change. Do not mix source changes, formatting churn, and harness configuration unless they are part of the same requested task.

## Pull Requests

- Follow `.github/PULL_REQUEST_TEMPLATE.md`.
- Describe purpose, summarize work, link related issues, and attach screenshots or videos for UI changes.
- Visual and simulation changes are hard to review from a diff. Attach a short screen capture of the running scene whenever behavior changes.
- Mention validation commands and any checks that could not be run.
- The base branch is `main`.
