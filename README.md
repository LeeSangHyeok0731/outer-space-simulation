# Outer Space Sandbox

천체를 던지면 중력으로 서로 끌어당기고, 부딪히면 하나로 합쳐지는 N-body 우주 샌드박스.

## 조작

| 입력 | 동작 |
|---|---|
| 왼쪽 드래그 (빈 공간) | 새총처럼 천체 던지기 (드래그 중 예상 궤적 표시) |
| 왼쪽 클릭 (천체) | 선택 — 정보 카드 표시, 카메라가 추적 |
| 오른쪽 드래그 | 카메라 회전 |
| 휠 | 줌 |
| 가운데 드래그 | 팬 |

## 개발

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # 물리 엔진 테스트
pnpm check-types
pnpm lint
pnpm build
```

## 구조

- `lib/sim/` — 순수 TypeScript 물리 엔진. React도 three.js도 모르며, 테스트 대상이다.
- `components/scene/` — React Three Fiber. 엔진 배열을 읽어 그리기만 한다.
- `components/ui/` — Canvas 위의 DOM 오버레이.
- `state/` — 엔진 인스턴스와 UI state의 소유자.

**핵심 규칙:** 천체의 위치·속도는 React state에 들어가지 않는다. 엔진의 `Float64Array`에만 존재하며, `useFrame`이 매 프레임 읽어 `InstancedMesh`에 직접 쓴다.

설계 근거는 [`docs/superpowers/specs/2026-07-14-space-sandbox-core-design.md`](docs/superpowers/specs/2026-07-14-space-sandbox-core-design.md)에 있다. 로드맵 2~4단계(신의 손 / 시나리오 프리셋 / 우주선 조종)도 그 문서에 정리되어 있다.
