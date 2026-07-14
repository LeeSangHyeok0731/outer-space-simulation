# Git Scope Guide

Use this guide when selecting branch names, commit scopes, PR title scopes, and logical commit groups.

## Runtime Discovery

Prefer changed files over guesses:

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/discover-changed-areas.sh" auto
```

Use `staged` when the user specifically asks about staged changes:

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/discover-changed-areas.sh" staged
```

## Scope Priority

Choose the most specific meaningful scope:

1. Product area: `simulation`, `ui`, `app`
2. Cross-cutting: `harness`, `docs`, `ci`, `config`, `assets`, `global`

## Common Scope Mapping

| Changed Area                                            | Preferred Scope | When to Use                                                          |
| ------------------------------------------------------- | --------------- | -------------------------------------------------------------------- |
| `components/Simulation/Universe.tsx` (physics, bodies)  | `simulation`    | Gravity, collision/merge, black-hole promotion, time step, culling   |
| `components/Simulation/CelestialBody.tsx`, `SpacetimeGrid.tsx`, `OrbitPath.tsx` | `simulation` | Scene objects, materials, particles, grid deformation |
| `Universe.tsx` overlay panel, context menu              | `ui`            | Control panel, sliders, buttons, Tailwind styling                    |
| `app/**`                                                | `app`           | Route entrypoint, layout, metadata, global CSS                       |
| `public/3D/**`                                          | `assets`        | `.glb` models and other static assets                                |
| `.claude/**`                                            | `harness`       | Agent, skill, rule, hook, or settings changes                        |
| `.github/**`                                            | `ci`            | Workflow or PR template changes                                      |
| `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/**`        | `docs`          | Documentation-only changes                                           |
| `package.json`, `tsconfig`, `eslint.config`, `next.config`, `postcss` | `config` | TypeScript, ESLint, Next, package config                     |

When a change spans the scene and the overlay in the same file, pick the scope that matches the user-visible intent.

## Commit Type Selection

| Type       | Use For                                              |
| ---------- | ---------------------------------------------------- |
| `feat`     | User-visible capability or new app behavior          |
| `fix`      | Bug fix or regression fix                            |
| `refactor` | Internal restructuring without behavior change       |
| `perf`     | Frame-rate or allocation improvements with no behavior change |
| `style`    | Visual styling or formatting-only UI changes         |
| `chore`    | Harness, tooling, dependency, or maintenance changes |
| `docs`     | Documentation-only changes                           |
| `test`     | Test-only changes                                    |
| `ci`       | GitHub Actions or CI changes                         |

## Examples

```text
chore(harness): Claude harness를 이 프로젝트에 맞게 이식
fix(simulation): bufferAttribute에 args 지정해 타입 오류 해결
feat(ui): 시간 배속 슬라이더 추가
perf(simulation): useFrame 내 Vector3 할당 제거
docs: README에 실행 방법 추가
```
