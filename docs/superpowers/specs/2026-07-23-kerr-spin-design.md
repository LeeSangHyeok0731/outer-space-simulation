# 커 블랙홀 스핀 설계 — 블랙홀 확장 3/3

- 작성일: 2026-07-23
- 상태: 승인됨 (구현 대기)
- 범위: 회전하는(커) 블랙홀. 스핀 상태를 도입하고 — 병합에서 자연 발생 + 슬라이더로 제어 — **프레임 끌림(중력자기 힘)**과 **스핀 의존 ISCO(흡수 반경)**를 물리에 반영한다. 시각으로 ergosphere·스핀 연동 원반/제트를 얹는다.
- 선행: 블랙홀 물리 팩 + 도플러 비밍(1/3) + 상대론적 제트(2/3) 완료. [[blackhole-extension-workflow]]. 설계 문서 §128이 "스핀 미구현"으로 남겨둔 비목표를 여는 작업.

> 이 문서는 살아있는 설계 문서다. 구현 중 설계가 바뀌면 코드와 함께 이 문서를 갱신한다.

## 1. 목적과 원칙

지금 블랙홀은 스핀이 없다(슈바르츠실트). 실제 블랙홀은 대부분 빠르게 돌고, 그 회전이 커의 상징적 현상들을 낳는다 — 주변 공간을 끌고 도는 프레임 끌림, 회전 방향에 따라 달라지는 흡수 반경. 이 시뮬의 "그럴듯하고 안정적이면 충분한 장난감" 원칙에 맞춰, 완전한 커 메트릭(GR) 대신 **정성적으로 옳은 근사**를 쓴다.

**스핀 표현:** 무차원 커 파라미터 `a*` ∈ [−1, 1]. 축은 +Y 고정(이 우주는 황도면 XZ에서 벌어지고, 강착원반·제트축이 이미 ±Y다). 부호가 회전 방향, 크기가 회전 세기(1 = 극단적 커). 이 스칼라 하나로 스핀 상태를 다 담는다.

## 2. 스핀 상태 (`lib/sim/bodies.ts`, `engine.ts`)

- `BodyBuffer`에 `spin: Float64Array` 추가. 일반 천체는 0, 블랙홀만 의미가 있다.
- `add()`가 `BodyInit.spin ?? 0`을 넣고, `removeAt()`의 swap이 옮기고, `serialize()/load()`가 실어 나른다. `BodyInit`·`SerializedBody`에 `spin?: number` 추가.
- `SimulationEngine.setSpin(id, aStar)` — `[-1, 1]`로 클램프해 `b.spin`에 넣는다(2단계 신의 손 계열의 명령형 API).
- 저장 검증(`lib/saves.ts`)에 `spin`은 선택 필드로 관대하게(유한 수 또는 없음) 다룬다. 옛 세이브(스핀 없음)는 0으로 로드된다.

## 3. 병합에서 스핀 자연 발생 (`lib/sim/collisions.ts`)

병합 결과가 블랙홀이면, 합쳐지는 두 천체의 **질량중심(COM) 기준 궤도 각운동량**의 Y성분 `L_y`에, 입력이 블랙홀이면 그 **기존 스핀 각운동량**을 더해 잔여 스핀을 정한다.

```
J = Σ mₖ · ((xₖ−cx)(vzₖ−cvz) − (zₖ−cz)(vxₖ−cvx))   // COM 기준 궤도 L_y
  + Σ (aₖ* · Mₖ² / C)   // 입력 블랙홀의 기존 스핀 각운동량 (a* = Jc/GM² 역산)
a*_remnant = clamp(J · C / M_remnant², −1, 1)
```

`a* = Jc/GM²`는 실제 커 공식이고, 이 시뮬 단위(G=1, `C`=25)에서 그대로 성립한다 — 임의 계수가 아니다. 빙글빙글 도는 충돌은 스핀하는 블랙홀을 낳고, 한쪽에서 계속 먹이면 스핀업한다. 클램프가 극단적 커 한계(|a*|≤1)를 강제한다.

## 4. 프레임 끌림 (`lib/sim/integrator.ts`)

`computeAccelerations`(순수 중력) 끝에 스핀 블랙홀의 중력자기 항을 더한다. 스핀 블랙홀이 하나도 없으면 건너뛴다(비용 0).

각 스핀 블랙홀 k, 각 다른 천체 i에 대해:
```
r = |위치차|,  soft로 하한
B_g = ŷ · (FRAME_DRAG_K · aₖ* · r_s(k)³ / (r³ + soft³))   // 렌즈-티링 ω ∝ J/r³
a_i += v_i × B_g
```

**왜 v×B(중력자기) 형태인가:** 이 힘은 속도에 수직이라 **일을 하지 않는다 → 에너지를 주입하지 않는다 → 안정적**이다(자기력과 같은 성질). 단순 접선 힘은 궤도 에너지를 펌핑해 폭발 위험이 있어 쓰지 않는다. `r³`로 급감쇠해 먼 천체는 무영향, 근처 천체만 스핀 방향으로 감겨 든다.

**받아들인 근사:** 립프로그는 원래 위치 의존 힘을 가정하는데, 이 항은 속도 의존이다. 프레임 끌림은 작고 국소적이라 심플렉틱성의 미세한 손상은 무시한다. 폭주는 기존 `sanitize()`가 최후 방어한다.

**튜닝:** `FRAME_DRAG_K` — 감김의 세기. 사람이 브라우저에서 맞춘다.

## 5. 스핀 의존 ISCO (`lib/sim/units.ts`, `lib/sim/collisions.ts`)

커 ISCO는 회전 방향에 따라 다르다. `a*=0`이면 3 r_s(현행 슈바르츠실트), 같이 도는(prograde) 극단이면 ~0.5 r_s, 거스르는(retrograde) 극단이면 ~4.5 r_s.

- `iscoRadiusKerr(mass, aEff)` 신규. `aEff`는 **천체 기준 유효 스핀**: 천체가 블랙홀과 같은 방향으로 돌면 `+|a*|`(prograde, 반경 축소), 반대면 `−|a*|`(retrograde, 반경 확대). 단조 보간:
  ```
  aEff ≥ 0:  factor = 3 − 2.5·aEff   // 0→3, +1→0.5
  aEff < 0:  factor = 3 − 1.5·aEff   // 0→3, −1→4.5
  iscoRadiusKerr = factor · r_s
  ```
- `collisions.ts`의 `captureDistance`: 블랙홀이 관여하면, 천체의 블랙홀 기준 궤도 각운동량 부호와 스핀 부호로 pro/retro를 정해 `iscoRadiusKerr`를 쓴다. 블랙홀 둘이면 각자의 Kerr ISCO 중 큰 값(기존 규칙 유지).
- 기존 `iscoRadius(mass)`(= 3 r_s)는 남겨 두되, 스핀을 아는 곳은 Kerr 버전을 쓴다.

## 6. 시각 (`components/scene/`)

- **강착원반 안쪽 테두리:** 스핀할수록 prograde ISCO로 좁아지게 `AccretionDisks`의 안쪽 반경 스케일을 `a*` 기반으로 조정. (도플러 비밍은 그대로.)
- **Ergosphere (신규 `Ergospheres.tsx` 또는 기존 확장):** 스핀할 때만 적도(XZ)에 찌그러진(적도로 부푼) 껍질/링. 크기 ∝ |a*|·r_s. `meshBasicMaterial`+블룸, 가산 혼합 미사용.
- **제트 연동 (보너스, 다듬어 보고 지저분하면 컷):** `Jets`의 밝기·길이를 |a*|와 곱해 스핀할수록 제트가 세지게(블랜포드-즈나젝의 정성적 반영). Task 2의 흡수 플레어와 곱해서 얹는다.

## 7. 파일

**수정:**
- `lib/sim/bodies.ts` — `spin` 필드·`BodyInit.spin`·add/removeAt.
- `lib/sim/engine.ts` — serialize/load에 spin, `setSpin`.
- `lib/sim/collisions.ts` — 병합 스핀 발생, Kerr ISCO 흡수.
- `lib/sim/integrator.ts` — 프레임 끌림 패스.
- `lib/sim/units.ts` — `iscoRadiusKerr`.
- `lib/saves.ts` — spin 검증(선택 필드).
- `components/ui/BodyCard.tsx` — 스핀 슬라이더(블랙홀 선택 시).
- `components/scene/AccretionDisks.tsx` — 스핀 반영 안쪽 반경.
- `components/scene/Jets.tsx` — (보너스) 스핀 연동.
- `state/SimulationProvider.tsx` — 필요 시 setSpin 노출(BodyCard가 engine 직접 호출하므로 불필요할 수 있음).

**생성:**
- `components/scene/Ergospheres.tsx`
- 테스트: `bodies`/`collisions`/`integrator`/`units` 테스트에 스핀 케이스 추가.

## 8. 테스트 (Vitest)

- `units.test.ts` — `iscoRadiusKerr`: a*=0이면 3 r_s, prograde 축소, retrograde 확대, 단조성.
- `bodies.test.ts` — spin 필드 add/removeAt swap/serialize 왕복.
- `collisions.test.ts` — (a) 빙글빙글 충돌이 부호 있는 스핀을 낳는다, (b) 정면(각운동량 0) 충돌은 스핀 ~0, (c) prograde 천체는 3 r_s보다 가까이서 살아남고 retrograde는 더 멀리서 잡힌다.
- `integrator.test.ts` — 스핀 0이면 프레임 끌림 항이 0(기존 궤도 불변), 스핀이 있으면 정지 천체에 접선 속도가 붙는다(감김), 에너지가 폭주하지 않는다(유계).
- 시각(원반 반경·ergosphere·제트 연동)은 사람이 브라우저에서 확인.

## 9. 조정 가능한 숫자와 한계

- `FRAME_DRAG_K`(끌림 세기), Kerr ISCO 보간 계수(2.5/1.5), ergosphere 크기·색, 제트-스핀 연동 세기.
- **축 고정(+Y):** 스핀축은 항상 ±Y다. 황도면을 벗어난 스핀(기울어진 축)은 다루지 않는다 — 이 우주의 모든 것이 황도면 기준이라는 가정과 일관되고, 강착원반·제트축과 맞다.
- **근사임을 인정:** 프레임 끌림·Kerr ISCO 모두 정성적으로 옳은 근사이며 완전한 커 메트릭이 아니다. C가 비물리적인 이 우주(§units)에 맞춘 튜닝이다.

## 10. 비목표

- **완전한 커 메트릭 없음.** 측지선·ergosphere 내 에너지 추출(펜로즈)·링 특이점 등은 스코프 밖.
- **기울어진 스핀축 없음.** 축은 ±Y 고정.
- **스핀 세차·정렬 없음.** 병합으로 스핀이 갱신될 뿐, 시간에 따른 스핀축 세차는 없다.

## 11. 사람의 브라우저 확인 (자동화 불가)

- 블랙홀 슬라이더로 스핀을 주면 근처 천체가 스핀 방향으로 **감겨 도는가**(프레임 끌림).
- 빙글빙글 도는 두 천체를 충돌시키면 결과 블랙홀이 스핀을 갖는가(슬라이더가 그 값을 보임).
- 같은 방향 궤도 천체는 더 가까이 살아남고 거스르는 천체는 더 멀리서 잡아먹히는가.
- 스핀할 때 ergosphere가 뜨고 원반 안쪽이 좁아지는가(+ 제트가 세지는가).
- 폭주 없이 안정적인가(고배속에서도).
