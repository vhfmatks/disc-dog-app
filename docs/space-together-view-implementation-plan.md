# 스페이스 함께보기 구현 계획

## 1. 문서 상태

- 상태: **구현 완료** (2026-07-17). 계획과 다른 점은 §17에, 그 뒤 뒤집힌 결정은 §18에 있다.
- ⚠ **§18을 먼저 읽으세요.** 아래 본문의 권한 모델(단방향 grant, 관리 토큰)은 §18에서
  뒤집혔습니다. 본문은 그 결정에 이르는 과정으로 남겨둡니다.
- 배포 순서가 중요하다: 마이그레이션 6·7과 함수 배포는 한 묶음이다 (§7.5, §14 단계 3–4).
- 범위:
  - 여러 스페이스의 결과를 데이터 복사 없이 하나의 지도 View에서 조합해 보는 기능
  - 전제 작업으로 **결과 24시간 만료 정책 폐지(영속화)** 와 **결과 접근 경로의 전면 서버화**를 포함한다
- 기준 예시:
  - A 관리자가 B에게 View 공유를 제안하고, B 관리자가 수락한다.
  - C 관리자가 B에게 View 공유를 제안하고, B 관리자가 수락한다.
  - B 구성원은 `A + B`, `B + C`, `A + B + C` View를 구성할 수 있다.
- 중단 조건: 아래 인수 조건과 보안 검증을 모두 만족하면 구현 완료로 본다.

## 2. 목표

스페이스 B를 기준 스페이스(host space)로 삼고, B에 View 권한을 공유한 여러 원본 스페이스의 살아 있는 결과를 B 구성원이 선택적으로 함께 볼 수 있게 한다.

결과 행을 복사하거나 원본 스페이스를 합치지 않는다. 함께보기는 조회 범위와 지도 표현만 결합한다.

```text
A ── 제안 ──▶ B ── 수락 ──▶ A → B 활성
C ── 제안 ──▶ B ── 수락 ──▶ C → B 활성

B 구성원이 구성 가능한 View
- A + B
- B + C
- A + B + C
```

## 3. 비목표

- 원본 `spaces` 또는 `results` 행을 새 스페이스로 이동하거나 복사하지 않는다.
- A가 B에 권한을 줬다는 이유로 A 구성원이 B를 볼 수 있게 하지 않는다.
- 공유 권한을 연쇄적으로 전파하지 않는다.
- 함께보기 권한으로 원본 스페이스의 설문, 단독 지도, 관리 화면에 접근하게 하지 않는다.
- 닉네임으로 서로 다른 스페이스의 동일인을 자동 병합하지 않는다.
- 1차 구현에서는 함께보기 안에 다른 함께보기를 넣지 않는다.
- 참가자 본인의 결과 삭제·재제출 기능은 1차 범위가 아니다 (영속화의 후속 과제로 명시).

## 4. 용어

| 용어 | 의미 |
| --- | --- |
| 원본 스페이스(source space) | 자신의 결과를 다른 스페이스에 읽기 전용으로 제공하는 스페이스. 예시의 A, C |
| 기준 스페이스(host/viewer space) | 구성원이 함께보기를 만들고 열람하는 스페이스. 예시의 B |
| View 공유 제안(offer) | source 관리자가 `source → host` 방향으로 보내는 공유 제안. 수락 전에는 아무 데이터도 노출하지 않는다 |
| View 공유 권한(grant) | 제안을 host 관리자가 수락해 활성화된 읽기 전용 권한 |
| 함께보기(together view) | 기준 스페이스와 선택한 원본 스페이스의 결과를 지도에서 조합한 화면 |
| 구성원 | 현재 앱 모델에서는 계정이 아니라 해당 스페이스의 유효한 입장 토큰을 가진 사용자 |
| 관리 권한 | 스페이스 생성자가 가지는 별도 진행자 권한. View 공유 제안·수락·종료를 수행한다 |

## 5. 핵심 권한 계약

### 5.1 방향성

활성 `A → B`는 다음 한 가지만 의미한다.

> B의 유효한 입장 권한을 가진 사용자가 B 기준 함께보기 안에서 A의 허용된 결과를 읽을 수 있다.

다음 권한은 생기지 않는다.

- A 구성원의 B 열람 권한
- B 구성원의 A 단독 지도 열람 권한
- B 구성원의 A 설문 참가 권한
- B 구성원의 A 데이터 수정·삭제 권한
- B가 A의 데이터를 C에 다시 공유할 권한

### 5.2 비전이성

```text
A → B
B → C
```

위 두 권한만으로 C는 A를 볼 수 없다. C가 A를 함께보기에 넣으려면 활성 `A → C`가 별도로 존재해야 한다.

### 5.3 양방향 합의 (수락 흐름)

grant는 한쪽의 의사만으로 활성화되지 않는다.

- source 관리자만 제안을 만들 수 있다.
- host 관리자만 제안을 수락할 수 있다. 수락 전에는 pending 상태이며 host 구성원에게 노출되지 않는다.
- source 관리자와 host 관리자 **둘 다** 언제든 종료(revoke/decline)할 수 있다.

이 수락 단계는 UX 장식이 아니라 방어선이다. 수락이 없으면 아무나 스페이스를 만들어 임의의
스페이스에 grant를 걸고, 자유 텍스트인 스페이스 이름(50자)을 상대 구성원 전원의 화면에
밀어넣을 수 있다. pending 제안은 host의 **관리자에게만** 보인다.

### 5.4 N개 스페이스

B가 선택한 외부 스페이스 집합을 `S`라고 할 때 함께보기 허용 조건은 다음과 같다.

```text
사용자에게 B 입장 권한이 있고
S의 모든 X에 대해 활성(수락되고 종료되지 않은) 권한 X → B가 존재한다.
```

B는 항상 함께보기에 포함한다. 외부 스페이스는 하나 이상 선택해야 한다. DB 모델은 N개를 지원하고, 운영 상한은 서버 상수로 관리한다.

### 5.5 종료

`A → B`가 종료되면(어느 쪽이 종료했든) 다음 조회부터 B의 모든 함께보기에서 A를 제외한다. A와 B의 원본 데이터는 변경하지 않는다.

### 5.6 viewer 스페이스의 비밀번호 필수

**비밀번호 없는 스페이스는 grant의 viewer가 될 수 없다.**

근거: `password_hash IS NULL`인 스페이스는 코드만 알면 `enter`가 share_token을 그대로
내주고(`supabase/functions/spaces/index.ts`), 스페이스 ID는 의도적으로 추측 가능한 값이다
(`_shared/spaces.ts` — "입장을 막는 건 비밀번호와 공유 토큰"). 열린 스페이스가 viewer가
되면 `A → B`는 사실상 A 결과의 전체 공개다. "B 입장 권한이 있고"라는 5.4의 전제가
아무것도 보장하지 않게 된다.

- 제안 생성, 수락, `fetch-results` 세 지점 모두에서 viewer의 `password_hash IS NOT NULL`을 확인한다 (fail closed).
- 관리자가 만드는 열린 스페이스와 `demo` 스페이스도 예외가 아니다.
- source 스페이스에는 이 제약을 두지 않는다 — 열린 source의 결과는 어차피 코드만으로 열람 가능하다.

### 5.7 식별자

- 참가 결과의 내부 식별자는 기존 `results.id` UUID를 사용한다.
- 닉네임 유일성은 기존처럼 `[space_id, nickname]` 범위로 유지한다.
- 함께보기 지도에서 외부 스페이스 참가자는 `스페이스명 · 닉네임` 형식으로 표시한다. 기준 스페이스 B의 참가자는 기존처럼 닉네임만 표시한다 (7.4의 라벨 배치 부하 참고).
- 문자열 `spaceId-nickname`을 DB 기본키로 만들지 않는다.

## 6. 현재 구조에서 먼저 해결할 점

### 6.1 비밀번호는 생성자 권한이 아니다

현재 스페이스 비밀번호와 `share_token`은 참가자 입장에도 사용된다. 따라서 비밀번호나 참가 링크를 안다는 사실만으로 스페이스 생성자라고 판정할 수 없다.

목표 동작은 생성자 관리이므로 스페이스 생성자 전용 `manage_token`을 새로 발급한다. 기존 스페이스에 관리 토큰이 없는 전환 기간에는 전역 관리자(admin-spaces)가 관리 링크를 재발급한다.

### 6.2 결과 접근은 읽기·쓰기 모두 서버로 옮겨야 한다

현재 RLS는 만료 전 `results`를 anon이 읽도록 허용한다(`results_select_live`). 화면에서 비밀번호를 확인해도 API를 직접 호출하면 다른 스페이스의 결과를 조회할 수 있다. 함께보기 권한을 보안 기능으로 구현하려면 View UI보다 먼저 이 경계를 서버로 옮겨야 한다.

단, **anon SELECT 제거는 "조회만 서버화하고 INSERT는 보존"이 불가능하다.** PostgreSQL은
`INSERT … RETURNING`의 반환 행에 SELECT 정책을 적용하므로, SELECT 정책을 지우는 순간
다음 세 경로가 함께 깨진다.

- `saveResult`의 `insert(row).select(COLUMNS).single()` (`src/lib/db.ts`)
- 멱등 재시도 경로 `findCommittedSubmission`의 id 직접 SELECT
- `checkNickname`의 직접 SELECT

따라서 결과의 **쓰기 경로(저장·닉네임 확인)도 같은 단계에서 Edge Function으로 이전**하고,
그 뒤 anon의 `results` 접근 권한(정책과 테이블 GRANT)을 전부 걷어낸다.

- 저장: `spaces` 함수에 `save-result` 액션 추가. 입장 토큰 검증 → service role로 INSERT. 클라이언트가 고정한 UUID로 멱등성 유지 (id 충돌 시 기존 행을 조회·대조해 committed로 응답).
- 닉네임 확인: `spaces` 함수에 `check-nickname` 액션 추가. 최종 판정은 지금처럼 unique 제약이 한다.
- 조회: 단일 지도와 함께보기 모두 `space-views.fetch-results`로 통일한다 (8.3). 단일 지도는 source 0개인 특수형이다.
- 1차 구현은 보안이 단순한 주기적 갱신을 사용한다. anon SELECT가 사라지면 `postgres_changes` 기반 Realtime(`watchRoom`)은 조용히 아무것도 전달하지 않게 되므로 코드를 제거한다. MapApp에는 이미 20초 폴링이 있다. 비공개 Broadcast 채널은 후속 단계로 복구한다.

### 6.3 결과 24시간 만료 정책 폐지 (영속화)

**결정: 결과는 더 이상 24시간 뒤 사라지지 않는다. 스페이스가 삭제될 때까지 유지된다.**

grant는 무기한인데 결과만 24시간 만료였던 비대칭을 해소하고, 함께보기의 가치(시간이 쌓인
결과의 조합)를 살린다. 다음 파급을 모두 이 계획의 범위로 다룬다.

폐지 대상:

- `results.expires_at` 컬럼, `results_expires_idx` 인덱스, 기본값 `now() + 24h`
- `results_select_live`(만료 전만 SELECT), `results_insert_capped`(24시간 초과 금지) 정책 — 6.2의 서버화가 선행되므로 대체 정책 없이 제거한다
- pg_cron `dogtype-purge`의 results 삭제 — `space_attempts` 정리는 유지한다
- `admin-spaces`의 `expires_at` 필터 두 곳, `list_active_spaces`의 `r.expires_at > now()` 조인 조건 — 홈의 "최근 24시간 활동" 의미는 `r.created_at > now() - interval '24 hours'`로 유지한다

받아들이는 결과 (문서화된 결정):

- **닉네임 영구 점유**: `[room, nickname]` unique가 이제 영구히 잠긴다. 본인 삭제·재제출은 후속 과제.
- **정원 200명은 평생 정원이 된다**: room-cap 트리거가 만료 조건 없이 전체 행을 센다. 상수는 유지하되 운영 데이터를 본 뒤 조정한다.
- **참가자 약속 변경**: "24시간 뒤 자동으로 사라집니다"라는 문구가 ParticipantApp, ProfileApp, README(4곳 이상)에 있다. 전수 수정하고, 결과는 스페이스 삭제 시까지 남는다고 고지한다 (§10).

## 7. 데이터 모델

### 7.1 `spaces` 변경

```prisma
model spaces {
  // 기존 필드
  manage_token_hash String? @db.Text
}
```

- 생성 시 256-bit 임의 관리 토큰을 만든다 (`crypto.getRandomValues`, base64url 43자).
- DB에는 **SHA-256 해시**만 저장한다. PBKDF2는 쓰지 않는다 — 저엔트로피 비밀번호용 키 스트레칭이고, 완전 엔트로피 토큰에는 불필요한 요청당 비용이다. 검증은 스페이스 id로 행을 찾은 뒤 `timingSafeEqual`로 해시를 비교한다 (`_shared/spaces.ts`에 helper 추가).
- 관리 토큰은 생성 응답에서 한 번 반환하고 브라우저에 저장한다 (§9.1).
- 일반 입장 응답과 참가 링크에는 절대 포함하지 않는다.
- 전역 관리자는 분실된 관리 토큰을 회수하지 않고 새 토큰으로 회전시킨다 (`admin-spaces`에 `rotate-manage-token` 액션).
- 기존 컬럼 GRANT는 컬럼을 명시한 화이트리스트이므로 새 컬럼은 자동으로 anon에게 숨겨진다. `PUBLIC_SPACE_COLUMNS`에도 넣지 않는다.

### 7.2 `space_view_grants`

```prisma
model space_view_grants {
  source_space_id String    @db.Text
  viewer_space_id String    @db.Text
  granted_at      DateTime  @default(now()) @db.Timestamptz(6)
  accepted_at     DateTime? @db.Timestamptz(6)
  revoked_at      DateTime? @db.Timestamptz(6)
  visible_from    DateTime? @db.Timestamptz(6)

  @@id([source_space_id, viewer_space_id])
  @@index([viewer_space_id, revoked_at])
  @@index([source_space_id, revoked_at])
}
```

상태는 컬럼 조합으로 판정한다.

| 상태 | 조건 |
| --- | --- |
| pending | `accepted_at IS NULL AND revoked_at IS NULL` |
| active | `accepted_at IS NOT NULL AND revoked_at IS NULL` |
| ended | `revoked_at IS NOT NULL` |

필수 DB 제약 (마이그레이션 SQL에 손으로 작성 — schema.prisma 머리말 참고):

- `source_space_id <> viewer_space_id` CHECK
- 두 컬럼 모두 `spaces.id`를 참조하고 삭제 시 grant도 삭제 (`on delete cascade`)
- 같은 방향의 grant는 한 개만 존재 (복합 PK)
- 재제안 시 `granted_at = now()`, `accepted_at`, `revoked_at`, `visible_from`을 모두 비운다

**RLS와 GRANT (누락하면 §11 전체가 무너진다):**

```sql
alter table public.space_view_grants enable row level security;
-- 정책 없음 = anon/authenticated 전면 거부. service role만 접근한다.
revoke all on public.space_view_grants from anon, authenticated;
```

이 리포는 RLS·GRANT를 Prisma가 아니라 마이그레이션 SQL이 소유한다. Supabase는 public
스키마 새 테이블에 기본 권한이 열려 있으므로, 위 두 줄이 없으면 어느 스페이스가 어느
스페이스와 연결됐는지가 anon 키로 그대로 조회된다. `space_attempts`와 같은 패턴이다.

### 7.3 공개 범위와 `visible_from`

> ⛔ **폐기됨 — §18.8을 보세요.** 이 게이트는 만들었다가 걷어냈다. 실제로 써보니 기존
> 스페이스 둘을 연결하면 지도가 텅 비어 기능을 못 썼다. 지금은 공유하면 그 스페이스의
> 결과가 **전부** 넘어가고(소급), 그 대가로 참가 화면이 모두에게 미리 고지한다.
> 아래는 왜 한때 이걸 원했는지의 기록이다.

기본 정책은 **수락 이후 생성된 결과만** 외부 스페이스에 공개하는 것이다.

```text
result.created_at >= grant.visible_from   (visible_from은 수락 시각에 설정)
```

- `visible_from`은 제안 시각이 아니라 **수락 시각**에 채운다. 공유가 실제로 발효되는 순간이고, 참가자 고지(§10)와 시점이 일치한다.
- 종료 후 재제안·재수락하면 `visible_from`이 새 수락 시각으로 리셋된다. **이전 공유 기간에 B에게 보였던 결과도 새 `visible_from` 이전이면 다시 숨는다.** 이것은 의도된 방어적 동작이다 — 결과가 영속화되므로 이 규칙이 없으면 한 번이라도 공유된 결과는 영원히 재노출 가능해진다. §13.3에 테스트로 못박는다.
- 원본 스페이스의 기존 결과는 원본 지도에서는 계속 보인다.
- 기존 결과 포함 옵션은 1차 범위에서 제외한다. 필요해지면 참가자 고지와 별도 명시 옵션을 추가한다.

### 7.4 함께보기 구성 저장

1차 구현에서는 별도 `merged_space`를 만들지 않는다. B 지도에서 선택한 원본 스페이스 ID 목록을 URL 또는 화면 상태로 유지한다.

```text
/{B}/map?with=A,C
```

- URL을 신뢰하지 않는다. 서버는 요청된 모든 ID에 대해 활성 `source → B` grant를 다시 확인한다.
- `with`는 legacy `?r=` 파싱과 충돌하지 않는다. GitHub Pages 404 복원은 `location.search`를 보존하므로(`public/404.html` → `main.tsx`의 `__spa`) 추가 작업이 필요 없다 — 회귀 테스트만 둔다 (§13.4).

이름 있는 View 저장과 공유 목록이 필요해지면 후속 단계에서 `space_map_views`와 `space_map_view_sources`를 추가한다. 저장된 View도 열 때마다 현재 grant를 재검증한다.

### 7.5 영속화 마이그레이션

6.3의 결정을 별도 마이그레이션으로 적용한다. **반드시 결과 접근 서버화(단계 3) 이후에
배포한다** — 서버화 전에 만료만 없애면 anon SELECT 정책이 지금보다 넓어진 채로
(전체 행) 노출되는 중간 상태가 생긴다.

```sql
-- 서버화 마이그레이션(단계 3)에서 이미 수행:
--   drop policy results_select_live / results_insert_capped;
--   revoke all on public.results from anon, authenticated;

alter table public.results drop column expires_at;   -- results_expires_idx도 함께 사라진다
-- room-cap 트리거: expires_at 조건 제거 (평생 정원)
-- list_active_spaces: r.created_at > now() - interval '24 hours'로 교체
-- pg_cron dogtype-purge: space_attempts 정리만 남긴다
```

## 8. 서버 API 계획

새 Edge Function `space-views`를 추가하고, 기존 `spaces` 함수에 결과 쓰기 액션을 더한다. 모든 응답은 비밀번호 해시, 관리 토큰, 원본 공유 토큰을 제외한다.

레이트리밋은 기존 `note_space_attempt`를 재사용한다. 관리 토큰 검증 실패는 `#views:{spaceId}` 스코프로 세고, 제안 생성은 source 스페이스별 시간당 상한(서버 상수)을 둔다.

### 8.1 source 관리 API (A의 관리 토큰)

#### `offer`

```json
{
  "action": "offer",
  "sourceSpaceId": "A",
  "viewerSpaceId": "B",
  "manageToken": "..."
}
```

검증:

- 두 스페이스가 존재하고, source와 viewer가 다르다.
- `manageToken`이 A의 관리 토큰 해시와 일치한다.
- **viewer에 비밀번호가 설정되어 있다** (§5.6). 없으면 `VIEWER_SPACE_OPEN`으로 거절.
- 요청 횟수 제한을 통과한다.

결과: `A → B` pending 생성 또는 (ended 상태였다면) pending으로 재제안. 이미 pending/active면 멱등 처리.

응답에는 B의 공개 요약(이름·아이콘)을 포함한다 — A 관리자가 올바른 대상인지 확인하는 화면(§9.2)에 필요하다. 정확한 ID를 입력한 관리 토큰 보유자에게 잠긴 스페이스의 이름이 노출되는 작은 오라클이지만, 활성 스페이스 이름은 이미 홈에 공개되고 요청은 레이트리밋이 걸리므로 수용한다 (문서화된 결정).

#### `revoke`

- A 관리 토큰을 검증한다.
- `A → B`의 `revoked_at`을 설정한다 (pending, active 모두 가능).
- 다음 결과 조회부터 A를 반환하지 않는다.

#### `list-issued`

- A 관리 토큰을 검증한다.
- A가 제안·공유한 대상 목록을 상태(pending/active/ended)와 함께 반환한다.

### 8.2 viewer 관리 API (B의 관리 토큰)

#### `list-offers`

- B 관리 토큰을 검증한다.
- B가 받은 pending 제안과 active grant 목록, source 스페이스의 공개 요약을 반환한다.
- pending 제안은 이 API에만 나온다 — 구성원 API(8.3)에는 절대 노출하지 않는다.

#### `accept`

- B 관리 토큰을 검증한다.
- 대상 grant가 pending인지, **B에 비밀번호가 여전히 있는지** 확인한다.
- `accepted_at = now()`, `visible_from = now()` 설정.

#### `decline`

- B 관리 토큰을 검증한다.
- pending이든 active든 `revoked_at`을 설정한다. B 쪽에서 원치 않는 공유를 언제든 끊는 수단이다.

### 8.3 구성원 API (B의 입장 토큰)

#### `fetch-results`

단일 지도와 함께보기가 같은 액션을 쓴다. `sourceSpaceIds: []`가 단일 지도다.

```json
{
  "action": "fetch-results",
  "hostSpaceId": "B",
  "sourceSpaceIds": ["A", "C"],
  "hostToken": "..."
}
```

검증 순서:

1. B 입장 토큰(share_token) 검증
2. 요청 목록 정규화, 중복 제거, `hostSpaceId` 제거, 상한 검사
3. 모든 source에 대해 활성 `source → B` grant 확인 + viewer 비밀번호 확인 (§5.6)
4. 각 source의 `visible_from` 이후 결과만 조회
5. B의 결과와 합쳐 반환

응답:

```ts
interface TogetherResultRow extends ResultRow {
  source_space: {
    id: string;
    name: string;
    icon_id: string;
  };
}

interface FetchResultsResponse {
  ok: true;
  rows: TogetherResultRow[];
  /** 현재 B가 선택할 수 있는 활성 source 요약. 지도 진입 시 별도 호출을 없앤다. */
  availableSources: Array<{id: string; name: string; icon_id: string; result_count: number}>;
}
```

- `availableSources`를 응답에 포함해 지도 진입 시 grant 목록 조회를 따로 하지 않는다. `result_count`는 §12의 총량 상한을 선택 단계에서 미리 걸러내는 데 쓴다.
- 권한 없는 source가 하나라도 요청되면 데이터를 반환하지 않고 fail closed 한다. 단, **오류 응답에 어떤 ID가 거절됐는지 포함한다**:

```json
{
  "ok": false,
  "code": "SOURCE_NOT_GRANTED",
  "deniedSourceIds": ["A"]
}
```

`deniedSourceIds`가 없으면 클라이언트는 열려 있던 View에서 어느 스페이스가 종료됐는지 알 수 없어 §9.6의 동적 축소를 구현할 수 없다. B는 해당 grant의 존재를 이미 알았으므로(활성일 때 목록에 있었다) ID를 돌려주는 것은 새 정보 노출이 아니다. 데이터와 이름은 포함하지 않는다.

### 8.4 결과 쓰기 서버화 (`spaces` 함수)

6.2에 따라 참가자 쓰기 경로를 옮긴다.

- `save-result`: 입장 토큰 검증 → 필드 검증 → service role INSERT. 클라이언트 고정 UUID로 멱등 처리(id 유일성 충돌 시 기존 행 대조 후 committed 응답), 닉네임 충돌은 `NICKNAME_DUPLICATE`. room-cap 트리거는 그대로 동작한다.
- `check-nickname`: 입장 토큰 검증 → 사용 가능 여부 응답.
- 참가 화면 고지(§10)를 위해 `enter` 응답에 활성 outbound 공유 대상 요약(`sharedWith: [{name, icon_id}]`)을 포함한다.

### 8.5 갱신 방식

1차 구현:

- 최초 진입 즉시 조회
- 화면이 보이는 동안 일정 주기로 재조회 (MapApp의 기존 20초 주기 재사용)
- 탭이 다시 활성화되면 즉시 재조회
- grant 종료는 다음 조회에서 즉시 반영 (`SOURCE_NOT_GRANTED` + `deniedSourceIds` → §9.6)
- 일부 source 실패를 성공처럼 섞지 않는다

후속 구현:

- 검증된 사용자만 구독하는 비공개 Broadcast 채널
- grant 종료 시 채널 권한도 즉시 종료

## 9. 프런트엔드 계획

### 9.1 스페이스 생성 완료 화면

- 참가 링크와 별도로 `관리 링크`를 표시한다.
- 관리 링크는 `manage_token`을 URL fragment(`#m=`)에 한 번 싣고, `access.ts`와 같은 패턴으로 localStorage 저장 후 주소창에서 제거한다.
- 관리 링크를 참가자에게 공유하지 말라는 설명을 표시한다.

### 9.2 관리 화면 (`/{spaceId}/manage`)

새 라우트 `/{spaceId}/manage`에 진행자 관리 화면을 만든다 (`SpaceManageApp.tsx`).

- `manage`를 `RESERVED_IDS`에 추가한다 — **`src/lib/router.ts`와 `supabase/functions/_shared/spaces.ts` 두 곳을 함께** 갱신해야 한다 (같은 목록을 손으로 동기화하는 구조). 추가하지 않으면 `/manage` 단독 경로가 스페이스 ID `manage`의 참가 화면으로 해석될 수 있다.
- `appBaseUrl`의 경로 깊이 계산에 manage 라우트(map과 같은 깊이 2)를 반영한다.

기능:

- **보내는 공유 (source 입장)**: 대상 스페이스 코드 입력 → 서버가 돌려준 이름·아이콘으로 확인 → 제안. 상태(pending/active/ended)와 `visible_from` 표시, 개별 종료.
- **받은 공유 (viewer 입장)**: pending 제안 수락/거절, active grant 종료.
- 공유 시작 전 노출 범위 확인 문구:

> 상대가 수락한 시점 이후 제출되는 닉네임과 결과가 해당 스페이스 구성원의 함께보기에 표시됩니다.

### 9.3 B 지도 진입

B 입장 검증 후 `fetch-results`(source 없이)를 호출하면 `availableSources`가 함께 온다. 별도 grant 목록 호출은 없다.

- 활성 grant가 없으면 기존 단일 지도 UI를 그대로 유지한다.
- 활성 grant가 있으면 `함께보기` 버튼을 노출한다.
- B는 선택 해제할 수 없는 기준 스페이스로 표시한다.
- A, C 등 공유받은 스페이스는 다중 선택할 수 있다. 각 항목에 `result_count`를 표시해 총량 상한(§12)을 넘는 조합은 선택 단계에서 막는다.

```text
함께보기

✓ B               기준 스페이스
□ A (12명)        B에게 공유됨
□ C (48명)        B에게 공유됨
```

### 9.4 함께보기 지도

- 기본 화면은 선택된 모든 스페이스의 결과를 표시한다.
- 필터는 `전체`, `B`, `A`, `C` 순으로 제공한다.
- DISC 유형 색상은 기존 의미를 유지한다.
- 스페이스 구분은 외곽선, 작은 배지, 라벨로 표현한다.
- **라벨 형식**: 외부 스페이스 참가자만 `스페이스명 · 닉네임`, B 참가자는 닉네임만. 모든 노드에 접두하면 현재 라벨 충돌 회피(`MapApp.tsx`의 `slotsFor`)가 감당할 수 없다. 상세 화면 제목은 어느 쪽이든 `스페이스명 · 닉네임`을 쓴다.
- 선택한 참가자의 관계 목록은 스페이스 정보가 포함된 구조로 변경한다.
- `다른 스페이스만 보기` 필터를 제공한다.
- 기존 `가장 먼 두 사람 찾기`는 현재 선택된 View 범위에 대해서만 계산한다.

### 9.5 닉네임 중복

같은 닉네임이 여러 스페이스에 존재해도 별도 참가자로 유지한다.

```text
A · 보리
B · 보리
C · 보리
```

선택 상태, 관계선, React key는 모두 `result.id`를 사용한다.

### 9.6 권한 종료 UX

열려 있던 View에서 grant가 종료되면, 다음 조회가 `SOURCE_NOT_GRANTED`와 `deniedSourceIds`를 돌려준다.

- `deniedSourceIds`에 있는 source의 결과를 즉시 제거하고, 남은 목록으로 재조회한다.
- `공유가 종료되어 일부 스페이스가 제외되었습니다.`를 표시한다.
- 외부 source가 하나도 남지 않으면 B 단독 지도로 돌아간다.
- URL의 `with` 목록도 현재 허용 목록으로 정리한다.
- 선택돼 있던 참가자가 제거되면 선택 상태를 초기화한다.

## 10. 참가자 고지

두 가지를 고지한다. 하나는 이번에 바뀌는 보존 기간, 하나는 외부 공유다.

**보존 기간 (영속화, §6.3)** — 기존 "24시간 뒤 자동으로 사라집니다" 문구를 전수 교체한다.

```text
결과는 스페이스가 삭제될 때까지 지도에 남습니다.
```

대상: `ParticipantApp.tsx`(제출 안내), `ProfileApp.tsx`, `README.md`(무엇을 지키나, FAQ 등 4곳 이상), 홈의 "최근 24시간" 라벨은 활동 기준이므로 유지.

**외부 공유** — 활성 outbound grant가 있는 source 스페이스의 참가 화면에 공개 범위를 안내한다 (`enter` 응답의 `sharedWith`, §8.4).

```text
이 스페이스의 결과는 다음 스페이스 구성원의 함께보기에도 표시될 수 있습니다.
- B
- D
```

다음 정보는 공유하지 않는다.

- 설문 원문 응답
- 비밀번호
- 참가 링크 토큰
- 관리 토큰
- 로컬 프로필 기록

브라우저에 전달된 결과는 캡처나 복사를 기술적으로 막을 수 없다. `보기 전용`은 수정·삭제·재공유 권한이 없다는 의미이며, 복제 방지 DRM을 의미하지 않는다고 문구를 정리한다.

## 11. 보안 불변식

- 클라이언트가 보낸 source 목록을 권한 목록으로 신뢰하지 않는다.
- 결과 조회 때마다 `source → host`의 활성(수락되고 종료되지 않은) grant를 서버에서 확인한다.
- host 입장 권한만으로 grant가 없는 source를 조회할 수 없다.
- source 관리 토큰만 제안·종료를, viewer 관리 토큰만 수락·거절을 할 수 있다.
- 입장 토큰으로는 제안·수락·종료 어느 것도 할 수 없다.
- 수락 전(pending) grant는 어떤 결과도 노출하지 않고, host 구성원에게 존재도 노출하지 않는다.
- 비밀번호 없는 스페이스는 viewer가 될 수 없다 (제안·수락·조회 3중 확인).
- grant는 역방향 또는 연쇄적으로 적용하지 않는다.
- 응답에 관리 토큰, 원본 공유 토큰, 비밀번호 해시를 포함하지 않는다.
- 수락 시각(`visible_from`) 이후 결과만 외부에 노출한다. 재수락 시 리셋된다.
- `space_view_grants`는 RLS 활성 + 정책 없음 + anon revoke — 직접 DB 조회로 grant 존재를 읽을 수 없다.
- anon은 `results`를 직접 읽을 수도 쓸 수도 없다 — 모든 결과 접근은 토큰을 검증한 Edge Function을 거친다.
- 삭제된 source/viewer 스페이스와 연결된 grant는 남지 않는다 (FK cascade).
- URL 조작, 중복 source, self-grant, 과도한 N 요청을 서버에서 거절한다.

## 12. 성능과 운영 상한

스키마는 N개 source를 허용한다. 결과가 영속화되므로 스페이스당 결과 수는 평생 정원 200명까지 쌓일 수 있고, 무제한 조합은 지도 가독성과 서버 비용 문제가 있다.

초기 권장 상한:

- 함께보기 한 번에 선택 가능한 외부 스페이스: 9개
- 기준 스페이스 포함 총 10개
- 반환 결과 총량: 서버 상수로 제한. `availableSources.result_count`로 **선택 단계에서 초과 조합을 미리 막는 것이 1차 방어**이고, 서버의 명시적 오류는 최후 방어다 — 사용자가 해소할 수 없는 오류를 정상 경로로 삼지 않는다.
- source 목록과 결과 쿼리는 한 번의 서버 요청으로 묶음 (`fetch-results`의 `availableSources`)

상한값은 제품 사용 데이터를 본 뒤 조정하되, 권한 모델과 DB 스키마는 변경하지 않는다.

## 13. 테스트 계획

### 13.1 권한 행렬 단위 테스트

필수 시나리오 (A → B, C → B 모두 수락 완료 상태):

- B는 A+B를 요청할 수 있다.
- B는 B+C를 요청할 수 있다.
- B는 A+B+C를 요청할 수 있다.
- B는 grant가 없는 D를 포함할 수 없다 — `SOURCE_NOT_GRANTED` + `deniedSourceIds: ["D"]`.
- A는 B를 볼 수 없다.
- C는 A를 볼 수 없다.

수락 흐름:

- pending 상태에서 fetch-results에 A가 포함되면 fail closed.
- pending 제안은 B 입장 토큰의 어떤 응답에도 나타나지 않는다 (관리 토큰의 `list-offers`에만).
- 수락 후에만 `availableSources`에 나타난다.

비전이성 (A → B, B → C 모두 활성):

- C는 B+C를 볼 수 있다.
- C는 A+B+C를 볼 수 없다.

### 13.2 관리 권한 테스트

- 올바른 A 관리 토큰으로 `A → B` 제안 성공
- A 입장 토큰으로 제안 실패
- B 관리 토큰으로 제안 생성 실패 (수락만 가능)
- B 관리 토큰으로 수락·거절 성공, A 관리 토큰으로 수락 실패
- active grant를 A와 B 어느 쪽 관리 토큰으로도 종료 가능
- 비밀번호 없는 viewer로 제안 시 `VIEWER_SPACE_OPEN` 거절 (수락·조회 시점 확인 포함)
- 중복 제안은 멱등 처리, self-grant 거절
- 관리 토큰 회전 후 이전 토큰 실패
- 관리 토큰 검증 실패 레이트리밋 동작

### 13.3 결과 조회·저장 테스트

- B 토큰과 활성 grant로 A/C 결과 조회 성공
- `visible_from`(수락 시각) 이전 결과 제외
- 종료 → 재제안 → 재수락 시 `visible_from` 리셋 — 이전 공유 기간의 결과가 다시 숨는지
- 종료 직후 A 결과 제외, `deniedSourceIds` 반환
- forged source ID 포함 시 fail closed
- 삭제된 source 처리 (cascade 후 조회)
- 동일 닉네임을 source별로 구분
- `save-result` 멱등성: 같은 id 재전송 시 committed 응답
- `save-result`·`check-nickname`이 입장 토큰 없이 실패
- anon 키 직접 조회: `results` SELECT/INSERT 거부, `space_view_grants` SELECT 거부

### 13.4 라우터 테스트

- `with=A,C` 파싱, 정규화, 중복 제거
- B를 `with`에 넣어도 한 번만 포함
- 잘못된 ID와 상한 초과 거절
- `/{spaceId}/manage` 라우트, `manage` 예약어 (router.ts와 _shared/spaces.ts 동기화 검증)
- base path와 GitHub Pages 404 복원이 `?with=`를 보존
- 기존 participant/map/profile/admin 경로 회귀 없음

### 13.5 지도 테스트

- 전체/스페이스별 필터
- 외부 행만 `스페이스명 · 닉네임` 라벨, B 행은 닉네임만
- 선택된 사람의 다른 스페이스 관계 표시
- grant 종료 후 source 노드와 관계선 제거, 선택 상태 초기화
- N개 source 색상/배지 구분

### 13.6 영속화 테스트

- 24시간 지난 결과가 지도·관리자 화면에 계속 보인다
- pg_cron이 results를 지우지 않는다 (space_attempts는 지운다)
- `list_active_spaces`가 `created_at` 기준 24시간 창으로 같은 의미를 유지한다
- room-cap이 전체 행 기준으로 동작한다
- 기존 `r.expires_at > now()` 마이그레이션 검사(`scripts/spaces.test.mjs:215`)를 새 조건으로 교체
- "24시간 뒤 사라집니다" 문구가 코드베이스에 남아 있지 않다 (grep 검사)

### 13.7 전체 검증 명령

```bash
npm test
npm run verify
npm run typecheck
npm run build
```

DB 변경 후에는 로컬 또는 검증용 Supabase에서 마이그레이션과 Edge Function 통합 테스트를 추가로 실행한다.

## 14. 구현 단계

### 단계 0. 현재 동작 고정

- 단일 스페이스 입장, 결과 조회·저장, 지도 갱신에 대한 회귀 테스트 추가
- 현재 RLS와 Realtime 의존 범위를 테스트로 문서화
- INSERT RETURNING·닉네임 확인·멱등 재시도가 anon SELECT에 의존한다는 사실을 기준으로 확정

### 단계 1. 생성자 관리 권한

- `spaces.manage_token_hash` 마이그레이션 (SHA-256, §7.1)
- 생성 시 관리 토큰 발급, `#m=` 관리 링크와 저장/복구 흐름
- `admin-spaces`에 `rotate-manage-token` — 기존 스페이스의 재발급 경로
- 참가 토큰과 관리 토큰 분리 테스트

### 단계 2. View grant와 수락 흐름

- `space_view_grants` 마이그레이션: 제약 + **RLS/GRANT** (§7.2)
- `space-views`의 offer/revoke/list-issued/list-offers/accept/decline 구현
- viewer 비밀번호 필수 검증 (§5.6)
- `/{spaceId}/manage` 라우트와 SpaceManageApp (보내는 공유·받은 공유 UI)
- 방향성·비전이성·수락 권한 테스트

### 단계 3. 결과 접근 전면 서버화

- `spaces`에 `save-result`·`check-nickname` 추가, ParticipantApp·db.ts 전환
- `space-views.fetch-results` 구현 (단일 지도 = source 0개, `availableSources` 포함)
- anon의 `results` 정책 제거 + 테이블 GRANT revoke
- `watchRoom`(postgres_changes) 제거, 주기적 갱신으로 일원화
- `deniedSourceIds` 오류 계약과 재조회 처리
- 멱등 저장·닉네임 충돌 회귀 테스트

### 단계 4. 결과 영속화

- `expires_at` 컬럼·인덱스 제거 마이그레이션 (§7.5) — 단계 3 이후에만 배포
- room-cap 트리거, `list_active_spaces`, pg_cron, `admin-spaces` 필터 갱신
- "24시간" 문구 전수 교체 (ParticipantApp, ProfileApp, README, `scripts/spaces.test.mjs`)
- 영속화 테스트 (§13.6)

### 단계 5. 함께보기 지도

- B 기준 다중 source 선택 UI (`result_count` 표시, 상한 사전 차단)
- 지도 데이터 타입에 source 정보 추가
- 전체/스페이스별 필터와 source 배지, 외부 행 한정 라벨 접두
- 닉네임 충돌 표시
- 관계 보기와 가장 먼 조합을 현재 View 범위로 확장
- 권한 종료 시 동적 축소 (§9.6)

### 단계 6. 고지와 운영 검증

- 참가 화면의 외부 공유 안내 (`enter`의 `sharedWith`)와 보존 기간 문구
- 관리 화면의 공개 범위 경고
- 성능 상한과 rate limit 적용
- 전체 테스트, 타입 검사, 빌드
- A/C → B 제안→수락→조회→종료 수동 시나리오 검증

### 후속 단계

- 참가자 본인 결과 삭제·재제출 (영속화로 필요성이 커짐)
- 이름 있는 함께보기 저장, B 구성원 간 저장된 View 공유
- 비공개 Broadcast 채널 복구
- 스페이스별 분포 영역과 군집 시각화
- 다른 스페이스 참가자만 대상으로 관계 후보 보기
- 결과별 명시적 공개 동의

## 15. 완료 인수 조건

- `A → B`, `C → B`가 수락되어 활성일 때 B 구성원이 A+B+C View를 구성할 수 있다.
- B는 A+B 또는 B+C처럼 허용된 일부 source만 선택할 수도 있다.
- 수락 전(pending) grant는 결과도 존재도 B 구성원에게 노출되지 않는다.
- B 토큰만으로 grant가 없는 D의 존재나 결과를 조회할 수 없다.
- A와 C 구성원은 역방향 grant 없이는 B 또는 서로를 볼 수 없고, grant는 연쇄 전파되지 않는다.
- 비밀번호 없는 스페이스는 viewer가 될 수 없다.
- A 또는 B가 종료하면 B의 열린 View와 다음 조회에서 A가 사라지고, 클라이언트는 `deniedSourceIds`로 어떤 스페이스가 빠졌는지 안다.
- 원본 스페이스와 결과 행은 함께보기 생성·변경·종료로 수정되지 않는다.
- 동일 닉네임은 source 정보와 UUID로 안전하게 구분된다.
- 외부에는 수락 시각 이후 생성된 결과만 노출되고, 재수락 시 `visible_from`이 리셋된다.
- 관리 토큰과 참가 토큰의 권한이 서버와 테스트에서 분리된다.
- anon 키 직접 조회로 `results`와 `space_view_grants`에 접근할 수 없다.
- 결과가 24시간 뒤에도 유지되고, 이를 약속하는 문구가 UI·README에서 사라졌다.
- 기존 단일 스페이스 입장·설문·지도 동작이 회귀하지 않는다 (저장·닉네임 확인은 서버 경유로 동작 동일).
- `npm test`, `npm run verify`, `npm run typecheck`, `npm run build`가 통과한다.

## 16. 구현 시 변경 예상 파일

```text
prisma/schema.prisma
prisma/migrations/<manage_token>/migration.sql
prisma/migrations/<view_grants>/migration.sql
prisma/migrations/<persist_results>/migration.sql
supabase/functions/_shared/spaces.ts
supabase/functions/spaces/index.ts          (save-result, check-nickname, enter의 sharedWith)
supabase/functions/admin-spaces/index.ts    (rotate-manage-token, expires_at 필터 제거)
supabase/functions/space-views/index.ts     (신규)
src/lib/db.ts
src/lib/access.ts                           (관리 토큰 저장)
src/lib/router.ts                           (manage 라우트, RESERVED_IDS)
src/main.tsx
src/MapApp.tsx
src/ParticipantApp.tsx                      (저장·닉네임 확인 서버 경유, 고지 문구)
src/ProfileApp.tsx                          (보존 기간 문구)
src/SpaceManageApp.tsx                      (신규)
assets/style.css
scripts/spaces.test.mjs                     (expires_at 검사 교체 포함)
scripts/navigation.test.mjs
scripts/map-detail.test.mjs
새 권한/API 테스트 파일
README.md                                   (보존 정책, 무엇을 지키나)
```

구현 중 실제 책임 경계에 따라 파일은 달라질 수 있지만, 권한 검사와 결과 필터는 반드시 서버가 소유하고 프런트엔드는 표시와 사용자 입력만 담당한다.

## 17. 구현하며 계획과 달라진 것

### 17.1 `supabase/config.toml`에 `space-views` 항목이 필요했다

계획에 없던 파일이다. 빠뜨리면 게이트웨이의 JWT 검사에 걸려 모든 호출이 401이 된다.
이 함수도 로그인이 없고 게이트를 스스로 걸기 때문에 `verify_jwt = false`다.

### 17.2 만료를 읽던 트리거를 지우는 일이 추가됐다

`2_result_nickname_unique`가 만든 `results_release_expired_nickname` 트리거의 본문이
`expires_at`을 읽는다. PostgreSQL은 컬럼을 지울 때 plpgsql 본문을 검사하지 않으므로,
`7_persist_results`가 컬럼만 지우면 **마이그레이션은 조용히 성공하고 그 다음부터 모든
결과 저장이 죽는다.** 만료가 없으니 반납할 것도 없어 트리거와 함수를 함께 지웠다.

컬럼을 지우는 마이그레이션을 또 쓴다면 `grep -rn "<컬럼>" prisma/migrations/`로 그
컬럼을 읽는 객체를 전수로 찾을 것. 코드만 grep하면 이걸 놓친다.

### 17.3 브라우저에서 supabase-js가 통째로 빠졌다

결과 읽기·쓰기가 모두 Edge Function으로 가면서 `src/lib/db.ts`에 supabase-js를 쓸 일이
없어졌다. 의존성에서도 제거했다 (Edge Function은 Deno의 `npm:` 지정자로 따로 받는다).

### 17.4 `results`의 23505 판별 함수가 서버로 옮겨갔다

`isNicknameUniqueViolation` · `isResultIdUniqueViolation`은 PostgREST 오류를 보는
함수인데, 이제 그 오류를 보는 쪽이 서버뿐이라 `_shared/spaces.ts`로 옮겼다.
`src/lib/nickname-rules.ts`에는 화면이 쓰는 입력 규칙만 남았다.

### 17.5 `fetch-results`가 세는 순서를 바꿨다

계획은 결과를 가져온 뒤 총량 상한을 검사했지만, 그러면 넘는 조합에서도 무거운 조회가
먼저 나간다. `availableSources`를 위해 어차피 세고 있으므로, 그 숫자로 **읽기 전에**
판정한다. 받은 공유가 없는 스페이스에서는 이 조회 자체를 건너뛴다 — 단독 지도의 왕복
횟수가 예전 그대로여야 하고, 한 스페이스는 정원이 200명이라 상한에 닿을 수가 없다.

### 17.6 함께보기 목록을 `availableSources`로 좁히는 시점

계획대로 "허락된 것만 남긴다"를 `availableSources` 기준으로 계산하면, 첫 조회가
돌아오기 전에는 그게 비어 있어서 **주소로 연 함께보기가 스스로를 지운다.** 서버가
`deniedSourceIds`로 실제로 거절했을 때만 뺀다.

### 17.7 관리 화면이 해시 변경을 다시 읽는다

"관리 링크가 필요합니다"를 보다가 링크를 붙여넣으면 주소는 `#m=`만 늘어난다. 브라우저는
문서를 다시 읽지 않으므로(same-document 이동) 화면이 그대로 멈춰 있었다. `hashchange`를
듣고 토큰을 다시 확인한다.

> 같은 함정이 초대 링크(`#k=`)에도 있다. 비밀번호 게이트를 보다가 초대 링크를 붙여넣으면
> 게이트가 그대로 남는다. 이번 변경 전부터 있던 동작이라 손대지 않았다 — 후속 과제.

### 17.8 확인한 것과 확인하지 못한 것

- **DB**: 빈 Postgres에 0→7을 걸고, `set role anon`으로 직접 조회를 막았는지, 제약이
  self-grant와 "수락 없는 공개 범위"를 막는지, cascade가 도는지 실제로 확인했다.
- **화면**: Vite + Playwright로 함께보기 선택·필터·라벨·권한 종료 축소·참가 고지를 몰아봤다.
- **Edge Function 자체는 로컬에서 돌리지 못했다.** 사내망이 컨테이너 레지스트리를 막아
  PostgREST를 띄울 수 없다. 권한 판정을 `_shared/view-grants.ts`의 순수 함수로 빼둔 게
  이 때문이기도 하다 — 그쪽은 테스트가 본다. 함수의 HTTP 계약은 검증용 Supabase
  프로젝트에 배포해 확인해야 한다 (§13.7의 통합 테스트).

확인 절차는 `.claude/skills/verify/SKILL.md`에 적어뒀다.

## 18. 뒤집힌 결정 (2026-07-17, 배포 전)

위 본문의 권한 모델은 아래로 대체됐다. 마이그레이션 `8_mutual_shares`가 그 차이다.
본문을 지우지 않는 건, 왜 이런 결정에 이르렀는지가 남아야 다음 사람이 같은 논의를
처음부터 하지 않기 때문이다.

### 18.1 공유는 양방향이다 (§5.1·5.2 대체)

한쪽이 제안하고 다른 쪽이 수락하면 **서로를 본다.** `A → B`와 `B → A`를 따로 맺지
않는다.

- 수락은 곧 맞교환이다. 수락 버튼 옆에 그 말을 적어둔다 — 한 번 누르면 자기 결과도
  상대에게 넘어간다는 걸 모르고 누르면 안 된다.
- **비전이성은 그대로다.** A–B와 B–C가 있어도 A는 C를 못 본다.
- 방향이 없으니 두 스페이스 사이의 공유는 하나뿐이어야 한다. 사전순 정렬쌍
  (`space_a < space_b`)으로 저장하고 그 쌍을 기본키로 삼아, (A,B)와 (B,A)가 동시에
  생기는 일을 DB가 구조적으로 막는다. 제안자는 `requested_by`에 남는다.
- `visible_from` 하나가 양쪽에 똑같이 걸린다 — A가 B에게 보이기 시작하는 순간과
  B가 A에게 보이기 시작하는 순간이 같다.

### 18.2 스페이스 비밀번호가 관리 권한이다 (§6.1·§7.1 폐기)

`manage_token_hash`와 `/{spaceId}/manage` 화면을 통째로 걷어냈다. 공유를 제안·수락·
해제할 때 **스페이스 비밀번호**를 묻는다.

> ⚠ 본문 §6.1은 "비밀번호는 생성자 권한이 아니다"라며 관리 토큰을 만든 근거였다.
> 그 지적 자체는 여전히 맞다 — **비밀번호를 아는 참가자는 누구나 이 스페이스의 결과를
> 남에게 공유할 수 있다.** 초대 링크(`#k=`)로 들어온 사람은 비밀번호를 모르니 못 하지만,
> 홈에서 비밀번호를 치고 들어온 참가자는 할 수 있다. 워크숍 도구로서 감수하기로 한
> 의도된 선택이다.

덤으로 얻은 것: 기존 스페이스가 즉시 동작한다. 관리 링크를 발급받을 필요가 없어져
본문 §6.1의 전환 문제가 통째로 사라졌다.

비밀번호는 브라우저에 영구 저장하지 않는다. 공유를 다루는 동안만 `sessionStorage`에
머문다 — 프로젝터에 띄워둔 브라우저의 `localStorage`에 남으면 그 자체가 유출이다.

### 18.3 공유 UI가 지도 아래로 들어왔다 (§9.2 대체)

별도 진행자 화면이 없다. 지도 맨 아래에:

- **공유하기 버튼** → 비밀번호 확인 → 검색 가능한 스페이스 목록
- 목록의 각 줄은 상태에 따라 버튼이 다르다: 없음 → `공유하기`, 내가 제안 →
  `제안 취소`, 상대가 제안 → `수락`/`거절`, 활성 → `해제`
- **받은 제안은 서랍을 열지 않아도** 지도 아래에 뜬다. 안 그러면 아무도 모른 채 지나간다.
  누르면 그때 비밀번호를 묻는다.

### 18.4 공유 대상 목록은 비밀번호 있는 전체다 (새 노출)

비밀번호가 설정된 모든 스페이스가 목록에 뜬다 — 홈에 안 뜨던 조용한 스페이스도
**이름과 입장 코드가** 실린다. 비밀번호를 확인한 사람에게만 주지만, 그 사람이 곧
참가자 전원일 수 있다. 의도된 선택이다.

비밀번호 없는 열린 방은 목록에 없다. 코드만 알면 누구나 들어오는 방과 공유하면 사실상
전체 공개라서, 서버가 `PARTNER_OPEN`으로 거절한다.

### 18.5 공유해도 남의 스페이스에 발자국을 찍을 수는 없다

공유가 넘기는 건 **merge map에 뜰 결과**뿐이다. 상대 스페이스의 설문에 참가하거나
닉네임을 만들어 결과를 제출할 수는 없다 — 그러려면 그 스페이스의 초대 링크나
비밀번호가 있어야 하고, 공유는 그 둘 중 어느 것도 주지 않는다.

- 결과를 쓰는 유일한 문은 `spaces.save-result`이고, 그 스페이스의 **출입증만** 연다.
- `space-views`는 `results`에 쓰지 않는다. 응답에 상대의 출입증도 싣지 않는다.
- 이 계약은 `scripts/navigation.test.mjs`가 지킨다.

### 18.6 판정 함수는 혼자서도 옳아야 한다 (구현 중 잡은 버그)

`partnerOf(share, me)`는 내가 낀 공유를 전제로 한다. B–C 공유를 A로 물으면 "상대는 B"
라고 답하는데, 그 값을 권한 판정이 믿으면 **A가 B를 볼 수 있다고 착각한다.** 서버는
내가 낀 공유만 읽어오므로 실제로 새지는 않았지만, 보안 함수가 호출자의 조심성에
기대면 안 된다. `involves()`로 먼저 거르도록 고쳤고 테스트로 못박았다.

### 18.8 `visible_from` 게이트 폐기 — 공유하면 전부 보인다 (§7.3 폐기)

`9_share_all_results`. 위 18.1의 "수락 이후 결과만"이 뒤집혔다.

**왜:** 써보니 기존 스페이스 둘을 연결하면 **지도가 텅 비었다.** 어제 세미나와 오늘
세미나를 한 지도에서 보자는 게 이 기능인데, 어제 것이 안 보이면 볼 게 없다. 게이트가
지키려던 것보다 기능을 통째로 못 쓰게 만드는 비용이 컸다.

**무엇을 맞바꿨나:** 이건 **소급 노출**이다. 공유를 맺는 순간, 그 전에 제출한 사람들의
닉네임과 강아지 유형이 상대 스페이스에 보인다. 그 사람들은 낼 때 이 공유를 몰랐다.
본문 §7.3이 막으려던 게 정확히 이것이고, 이제 막지 않는다.

**그래서 고지가 이 결정의 전부다.** 무게가 통째로 참가 화면으로 옮겨갔다:

- 공유가 걸린 스페이스 → 상대 이름을 대고, **"이미 제출된 결과도 함께"** 보인다고 밝힌다.
- **공유가 없는 스페이스도** 조용히 알린다: "진행자가 나중에 다른 스페이스와 함께보기를
  맺으면, 지금 내는 결과도 그쪽 지도에 보입니다." — 소급되므로 오늘 공유가 없다는 게
  안전을 뜻하지 않는다. 이 문구가 없으면 아무도 경고받지 못한 채 노출된다.
- 공유 화면도 두 가지를 함께 말한다: 맞교환이라는 것과, 기존 참가자까지 넘어간다는 것.

이 문구들은 `scripts/view-grants.test.mjs`가 지킨다. 지우면 테스트가 깨진다.

`visible_from` 컬럼과 그 CHECK는 함께 지웠다. 게이트가 없으면 그 값은 `accepted_at`의
복사본일 뿐이고, 남겨두면 읽는 사람이 "이게 뭘 막고 있지?"를 묻게 된다.

부수 효과: 해제 → 재수락에 되돌리는 힘이 없어졌다. 해제는 "지금부터 안 보임"일 뿐이다
— 애초에 브라우저가 이미 받아간 것을 없던 일로 만들 수는 없었다 (§10의 DRM 아님과 같은 이야기).

### 18.7 남은 배포 상태

프로덕션에는 마이그레이션 4·5와 **옛 모델의 함수**가 이미 올라가 있다 (2026-07-17).
`8_mutual_shares`가 그 위에 4의 컬럼을 지우고 5의 테이블을 갈아엎는다. 아직 아무도
쓰지 않는 기능이라 데이터 손실은 없다.

⚠ 마이그레이션 8과 함수 재배포는 한 묶음이다. 8만 적용하면 배포된 옛 `spaces.enter`가
없어진 `space_view_grants`를 찾다가 실패하고, 그러면 **입장이 막힌다**.
