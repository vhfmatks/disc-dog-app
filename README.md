# 🐶 강아지 유형 세미나 도구

60문항에 답하면 네 마리 강아지 중 하나로 판정하고, **같은 스페이스 참가자들의 관계도를
실시간으로 대형 화면에 그려주는** 웹앱입니다.

**스페이스**는 한 번의 세미나·모임 단위입니다. 누구나 이름과 비밀번호만으로 만들 수 있고,
초대 링크를 받은 사람은 비밀번호 없이 바로 참여합니다.

| | |
|---|---|
| 만들기 | `/new` — 이름 + 비밀번호, 로그인 불필요 |
| 참가자 | `/<code>` — 폰 (초대 링크로 진입) |
| 진행자 | `/<code>/map` — 데스크톱 + 프로젝터 |
| 프로필 | `/profile` — 이 브라우저에 남은 내 응답 (이어하기·삭제) |
| 관리자 | `/admin` — 전체 스페이스 목록·참가자 데이터 조회·삭제 (운영용) |
| 백엔드 | Supabase (Postgres + RLS + Edge Functions + Realtime) |
| 호스팅 | GitHub Pages |
| 프런트엔드 | Vite + React + TypeScript |

한 개의 React 앱이 URL을 보고 화면을 나눕니다. 결과는 스페이스별로 저장·조회·Realtime 구독이
분리됩니다. 예전 `index.html?r=...`, `map.html?r=...`, `#/?r=...` 링크도 계속 열립니다.

---

## 스페이스에 들어가는 두 가지 길

```
초대 링크  /hazel-corgi-427#k=<토큰>   →  비밀번호 없이 바로 입장
입장 코드  /hazel-corgi-427            →  비밀번호를 물어봄
```

- **입장 코드**(`hazel-corgi-427`)는 비밀이 아닙니다. 진행자 화면에 계속 떠 있고, 프로젝터에서
  읽어 옮겨 적으라고 만든 값입니다. 코드만으로는 들어갈 수 없습니다.
- **토큰**은 출입증입니다. 그래서 URL 프래그먼트(`#k=`)에만 싣습니다 — 프래그먼트는 서버로
  전송되지 않아 접속 로그·Referer에 남지 않습니다. 앱은 토큰을 받는 즉시 `localStorage`로
  옮기고 **주소창에서 지웁니다**. 세미나 중 화면 공유로 새는 걸 막기 위해서입니다.
- 비밀번호를 맞히면 서버가 토큰을 내려주므로, 그 뒤로는 다시 묻지 않습니다.
- 스페이스를 만들면 초대 링크가 **QR로도** 뜹니다. 같은 자리에 있는 사람은 폰 카메라로
  찍으면 비밀번호 없이 들어옵니다.

> **QR은 브라우저 안에서만 만듭니다.** 초대 링크에 출입증이 들어 있어서, 외부 QR 생성
> API(`api.qrserver.com` 등)에 URL을 넘기면 그 서버가 스페이스에 들어올 수 있게 됩니다.
> 같은 이유로 QR을 아무나 보는 곳에 띄워두면 안 됩니다 — 찍으면 그대로 입장입니다.

### 무엇을 지키고 무엇을 지키지 않나

지킵니다:

- 비밀번호는 **PBKDF2-SHA256 (210k회)** 로 해싱해 저장합니다. 원문은 어디에도 남지 않습니다.
- 검증은 전부 Edge Function(service role)에서 합니다. `spaces` 테이블은 **RLS 정책이 하나도
  없어** anon 키로는 조회 자체가 불가능합니다 — 스페이스 목록을 훑거나, 남의 토큰을 읽거나,
  이름을 엿볼 수 없습니다.
- 비밀번호 대입은 **(스페이스, IP) 당 10분에 10회**, 스페이스 생성은 **IP당 시간당 10개**로
  제한됩니다. 원본 IP는 저장하지 않고 해시만 씁니다.

지키지 않습니다 — **알고 쓰세요**:

- `results` 테이블은 예전과 같습니다. 스페이스 게이트는 *화면 접근*을 막을 뿐이고, anon 키로
  API를 직접 두드리면 만료 전 결과는 읽힙니다. 담기는 건 닉네임과 강아지 유형뿐이고 24시간 뒤
  사라지므로 이 정도를 의도된 수준으로 봅니다.
- 제대로 막으려면 결과 조회에도 토큰이 필요한데, 그러면 Realtime(`postgres_changes`)이 같이
  죽습니다. 실시간 지도가 이 도구의 핵심이라 택하지 않았습니다.
- **`ADMIN_PASSWORD`는 모든 스페이스의 마스터 키입니다.** 이 값을 아는 사람은 `/admin`에서
  스페이스 비밀번호를 하나도 모른 채 모든 스페이스·관계도·참가자 데이터를 봅니다. 원래부터
  그랬습니다 — 목록이 스페이스마다 초대 링크의 출입증(`share_token`)을 내려주기 때문입니다.
  스페이스 비밀번호는 참가자끼리 방을 나누는 칸막이지, 운영자에 대한 방벽이 아닙니다.
- **민감한 정보를 넣는 용도가 아닙니다.** 워크숍 도구입니다.

---

## 빠른 시작

```bash
git clone <이 저장소> && cd dogtype

cp .env.example .env      # 값을 채우세요 (아래 참조)
npm install
npm run dev               # http://localhost:8080
```

- 스페이스 만들기 → http://localhost:8080/new
- 참가자 화면 → http://localhost:8080/demo
- 진행자 화면 → http://localhost:8080/demo/map
- 관리자 화면 → http://localhost:8080/admin

`demo` 스페이스는 첫 마이그레이션이 넣어주는 기본 스페이스이며 **비밀번호가 없어** 코드만 알면
바로 열립니다.

프로덕션 번들은 `npm run build`로 `dist/`에 생성되며, `npm run preview`로 확인할 수 있습니다.
`build`는 설정 생성 → 문항 검증 → 타입 검사 → Vite 빌드 순으로 돌기 때문에 타입 오류가 있으면
번들이 만들어지지 않습니다. 타입만 따로 보려면 `npm run typecheck`, 단위 테스트는 `npm test`
(라우팅·초대 링크 파싱·비밀번호 해시).

---

## 설정 (`.env`)

```bash
SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
ADMIN_PASSWORD=충분히-긴-관리자-비밀번호
```

Supabase → **Project Settings → Data API** 에서 `Project URL` 과 `anon public` 키를 복사합니다.

`.env` 와 빌드 전에 생성되는 `src/config.ts` 는 **커밋되지 않습니다**(`.gitignore`).
`npm run dev`와 `npm run build`가 설정 생성과 문항 검증을 자동으로 수행합니다.

`ADMIN_PASSWORD`는 프런트엔드 번들에 넣지 않습니다. `/admin`에서 입력한 값은 HTTPS로
`admin-spaces` Edge Function에 전달되고 서버의 secret과 비교됩니다. 따라서 `.env`에 쓴 것과
같은 값을 Supabase **Edge Functions → Secrets**에도 `ADMIN_PASSWORD` 이름으로 등록해야 합니다.

이건 **관리자 비밀번호**이며, 참가자가 입력하는 **스페이스 비밀번호**와 다릅니다.
스페이스 비밀번호는 만든 사람이 정하고 DB에 해시로만 저장됩니다.

> **anon 키가 브라우저에 노출되는 것은 정상입니다.** 숨기려 하지 마세요. RLS가 방어선입니다.
> `service_role` 키는 절대 넣지 마세요 — `gen-config.mjs` 가 감지하면 실행을 거부합니다.

---

## Supabase 셋업

1. 프로젝트 생성 — 리전은 **Northeast Asia (Seoul)**
2. **Database → Extensions** 에서 `pg_cron` 검색 후 켜기
   - 안 켜도 마이그레이션은 **성공합니다**. 만료 행 정리 작업만 건너뛰고 경고를 남깁니다.
     RLS가 만료된 행을 숨기므로 세미나 진행에는 지장이 없습니다. 다만 행이 실제로 삭제되진 않습니다.
3. **Project Settings → Database → Connection string → Session pooler** 탭의 문자열을 복사
   → `.env`의 `DATABASE_URL`
   - 기본으로 보이는 **Direct connection은 쓰지 마세요.** IPv6 전용이라 사내망이나
     GitHub Actions(둘 다 IPv4)에서 `P1001`로 죽습니다. 자세한 건 `.env.example`.
4. 스키마 적용

   ```bash
   npm run db:migrate         # 새 프로젝트라면 이거 하나로 끝
   ```

   이미 테이블이 있는 DB라면 아래 **기존 DB 넘겨받기**를 먼저 하세요.
5. **Project Settings → Data API** 에서 URL / anon 키를 복사 → `.env`
6. **Edge Functions → Secrets** 에 `.env`와 동일한 `ADMIN_PASSWORD` 등록
7. 함수 **두 개**를 배포

   ```bash
   npx supabase functions deploy spaces       --project-ref YOUR-PROJECT-REF
   npx supabase functions deploy admin-spaces --project-ref YOUR-PROJECT-REF
   ```

   `spaces` 없이는 아무도 스페이스를 만들거나 들어갈 수 없습니다. 둘 다 배포하세요.

비밀번호를 바꾸면 로컬 `.env`와 Edge Function secret을 모두 바꾸세요. secret 변경은 함수 재배포
없이 즉시 적용됩니다.

### 기존 DB 넘겨받기 (baselining)

Prisma는 테이블이 이미 있는 DB에 `migrate deploy`를 거부합니다(P3005). 예전 `schema.sql`이나
`groups` 시절 스키마로 돌아가던 DB는 **한 번만** 아래를 실행하세요.

```bash
npm run db:baseline
```

`0_init` 마이그레이션 SQL을 직접 실행한 뒤 Prisma에 "이미 적용됨"으로 표시합니다. 이 SQL은
멱등이라 어떤 상태에서 실행해도 같은 곳으로 수렴합니다 — `groups`를 `spaces`로 rename하고,
기존 스페이스마다 새 공유 토큰을 채우고, 이미 최신이면 아무것도 바꾸지 않습니다.
그 뒤로는 `npm run db:migrate`만 쓰면 됩니다.

기존 스페이스는 비밀번호가 없어(`password_hash is null`) 예전처럼 코드만 알면 열립니다 —
옛 참가 링크가 끊기지 않습니다.

> **groups 시절에서 올라온다면** 예전 `admin-groups` 함수도 지우세요.
> `npx supabase functions delete admin-groups --project-ref YOUR-PROJECT-REF`

### 만들어지는 것

- `public.spaces` 테이블 (`password_hash`, `share_token`, 전역 unique 이름 포함) — **RLS 정책 없음 = anon 전면 거부**.
  service role을 쓰는 Edge Function만 읽고 씁니다. 비밀 컬럼은 컬럼 단위 GRANT로도 한 번 더 막습니다.
- `public.results` 테이블 + 스페이스 외래키 + 인덱스 2개 + 스페이스 범위 unique 닉네임
- RLS: **SELECT**(만료 전만) / **INSERT**(24시간 초과 금지) 만 허용. UPDATE·DELETE는 정책 없음 = 전면 거부
- `public.space_attempts` + `note_space_attempt()` — 비밀번호 대입·생성 남용 제한 (service role 전용)
- `spaces` Edge Function: 이름 중복 확인 + 스페이스 생성 + 입장(비밀번호/토큰 검증)
- `admin-spaces` Edge Function: 관리자 비밀번호 검증 + 목록·이름 수정·삭제·참가자 데이터 조회
- 방당 200명 상한 트리거
- Realtime publication
- 매시 17분 만료된 결과·시도 기록 삭제 (`pg_cron`)

---

## 배포 (GitHub Pages) + 자동 마이그레이션

저장소 **Settings → Secrets and variables → Actions** 에 등록:

| Secret | 값 |
|---|---|
| `SUPABASE_URL` | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | anon public 키 |
| `DATABASE_URL` | `postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres` |

**Settings → Pages → Source** 를 **GitHub Actions** 로 바꾼 뒤 `main` 에 push 하면
`.github/workflows/deploy.yml` 이 이렇게 돕니다.

```
push to main
     ↓
 [마이그레이션]  prisma migrate deploy → Supabase
     ↓  실패하면 여기서 중단 (배포하지 않음)
 [빌드]         설정 생성 · 문항 검증 · 타입 검사 · Vite
     ↓
 [배포]         dist/ → GitHub Pages
```

마이그레이션이 빌드보다 **먼저** 도는 게 핵심입니다. 스키마보다 앞서나간 프런트가 배포돼서
앱이 깨지는 것보다, 배포를 안 하는 편이 낫습니다.

> `DATABASE_URL`은 로컬 `.env`와 **같은 값**입니다 — Session pooler, 포트 5432.
> `db.<ref>.supabase.co` 직접 연결은 IPv6 전용이라 Actions 러너(IPv4)에서 못 붙고,
> transaction mode(6543)로는 마이그레이션이 돌지 않습니다. `<region>`은 프로젝트마다
> 다르니 대시보드 값을 그대로 쓰세요.
>
> 이 secret은 **DB 전체 쓰기 권한**입니다. 프런트엔드 번들에는 절대 들어가지 않지만
> (`gen-config.mjs`는 `SUPABASE_URL`/`SUPABASE_ANON_KEY`만 읽습니다), 저장소 협업자
> 범위를 한 번 생각해보세요.

---

## DB 스키마 바꾸기

`prisma/schema.prisma`가 **테이블 구조의 source of truth**입니다. 앱 런타임은 여전히
supabase-js를 쓰며 Prisma Client는 아예 없습니다 — Prisma는 스키마와 마이그레이션 도구일 뿐입니다.

```bash
# 1. 로컬 Postgres를 띄운다 (Prisma가 shadow DB를 만들었다 지우므로 운영 DB를 쓰면 안 된다)
docker run -d --name dogtype-pg -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:15
#    .env 의 DATABASE_URL 을 postgresql://postgres:pw@localhost:55432/postgres 로

# 2. prisma/schema.prisma 를 고친 뒤 마이그레이션 SQL을 생성 (적용은 안 함)
npm run db:migrate:new -- --name add_something

# 3. 생성된 prisma/migrations/*/migration.sql 을 열어본다.
#    RLS 정책·GRANT·함수·트리거가 같이 바뀌어야 하면 여기에 손으로 적는다.

# 4. 로컬에 적용해보고
npm run db:migrate
npm run db:status

# 5. 커밋 → push → CI가 운영에 적용
```

### Prisma가 모르는 것들

`schema.prisma`에 담기는 건 **테이블 3개 · 인덱스 2개 · FK 1개**뿐입니다. 이 앱의 방어선은
대부분 Prisma 문법으로 표현할 수 없어 마이그레이션 SQL에 손으로 들어 있습니다.

| | 어디에 |
|---|---|
| 테이블·컬럼·인덱스·FK | `prisma/schema.prisma` |
| RLS 정책, 컬럼 단위 GRANT | 마이그레이션 SQL |
| `security definer` 함수, 트리거 | 마이그레이션 SQL |
| CHECK 제약 | 마이그레이션 SQL |
| Realtime publication, pg_cron | 마이그레이션 SQL |

Prisma는 자기가 모르는 것을 건드리지 않으므로 마이그레이션을 거듭해도 정책은 살아남습니다.
**다만 정책이 따라 바뀌어야 하는 변경은 Prisma가 대신 써주지 않습니다** — 3번 단계에서
사람이 챙겨야 합니다.

`0_init/migration.sql`은 Supabase 밖(로컬 Postgres, Prisma의 shadow DB)에서도 돌도록
`anon` 롤 생성을 감싸두었고, `pg_cron`과 Realtime publication은 없으면 경고만 남기고
넘어갑니다.

---

## 프로젝트 구조

```text
index.html                 React 진입점
public/404.html            GitHub Pages clean URL 복구
src/main.tsx               라우팅 + 스페이스 만들기 + 비밀번호 게이트
src/AdminApp.tsx           관리자 로그인 + 스페이스 목록·수정·삭제
src/ParticipantApp.tsx     인트로 → 60문항 → 결과 → 저장
src/MapApp.tsx             Supabase 조회·Realtime → 관계도
src/ProfileApp.tsx         이 브라우저에 남은 응답 보기·삭제
src/components/            강아지, 차트, 궁합, 링크 복사, 앱 헤더, 초대 QR
src/lib/qr-path.ts         QR 모듈 행렬 → SVG path (lazy 청크로 분리됨)
src/lib/router.ts          경로 파싱과 URL 생성 (초대 링크 포함)
src/lib/access.ts          공유 토큰 보관 (localStorage) + 주소창 청소
src/lib/answer-store.ts    이어하기 draft 1벌 + 완료 응답 10벌 (localStorage)
src/lib/db.ts              Supabase 접근 계층 + Edge Function 호출
assets/data.ts             문항·채점·유형·관계 규칙
assets/style.css           모든 화면의 공용 스타일
prisma/schema.prisma       테이블 구조의 source of truth (Prisma가 아는 전부)
prisma/migrations/         버전 관리되는 SQL — RLS·함수·트리거·cron도 여기 손으로
prisma.config.ts           Prisma 7 설정 (마이그레이션용 DATABASE_URL)
supabase/functions/_shared 비밀번호 해시·코드 규칙 (두 함수 공용)
supabase/functions/spaces        공개 API — 만들기·입장
supabase/functions/admin-spaces  관리자 API
scripts/*.test.mjs         단위 테스트 (npm test)
tsconfig.json              TypeScript 설정 (strict)
```

---

## 스페이스 URL

```
/new                      이름·비밀번호로 스페이스 만들기 (누구나)
/hazel-corgi-427          참가자 설문 — 비밀번호를 물어봄
/hazel-corgi-427#k=<토큰> 초대 링크 — 바로 입장
/hazel-corgi-427/map      해당 스페이스 닉네임·결과 관계도
/admin                    전체 목록·이름 수정·삭제·참가자 데이터 조회 (운영용)
```

입장 코드는 `[a-z0-9-]{3,24}` 형식이며 `admin`, `map`, `new`, `profile`은 예약어입니다. `/new`로 만들면
`hazel-corgi-427` 같은 코드가 자동으로 붙습니다. 원하는 코드를 직접 정해야 하면(고정 링크 등)
`/admin`에서 만들 수 있고, 거기서는 비밀번호를 비워 **공개 스페이스**로 열 수도 있습니다.

스페이스를 삭제하면 그 스페이스의 결과도 함께 삭제됩니다. 코드가 다르면 닉네임, 결과 조회,
Realtime 채널, 진행 중인 브라우저 응답이 서로 섞이지 않습니다.

---

## 세미나 당일 체크리스트

- [ ] **진행자 노트북에서 `github.io` 가 열리는가** ← 제일 흔한 사고. 안 열리면 폰 테더링.
- [ ] 참가자 LTE로도 열리는가
- [ ] `/new`에서 이번 세미나 스페이스를 만들었는가
- [ ] 참가자에게 **초대 링크**를 전달했는가 (코드만 주면 비밀번호를 물어봅니다)
- [ ] 스페이스 비밀번호를 기억하는가 — 늦게 온 사람이 코드로 들어올 때 필요합니다
- [ ] 프로젝터 뒷자리에서 닉네임 글씨가 읽히는가

진행 흐름: `/<code>/map` 을 띄우고 → 초대 링크 전달/QR 촬영 유도 → 강아지가 튀어나오는 걸 같이
보다가 → 2명 이상 모이면 나타나는 **"이 지도를 읽는 법"** 카드를 대본 삼아 토론.

진행자 화면 오른쪽 위에는 **입장 코드**가 계속 떠 있습니다. 링크를 못 받고 온 사람은 그 코드와
비밀번호로 들어올 수 있습니다.

### 즉시 삭제

`/admin`의 스페이스 카드에서 **삭제**하면 스페이스와 해당 결과가 모두 삭제됩니다.
SQL로 결과만 비우려면:

```sql
delete from public.results where room = 'hazel-corgi-427';
```

> anon 키로는 DELETE가 막혀 있습니다. Supabase SQL Editor에서 실행하세요.

---

## 개발 중 랜덤 채우기

`npm run dev` 로 띄우면 화면 아래에 **DEV 바**가 뜹니다. 60문항을 손으로 클릭할 필요가 없습니다.

| 버튼 | 하는 일 |
|---|---|
| 🎲 랜덤 | 현재 닉네임·페이지를 유지하고 60문항만 무작위로 채움 (결과로 이동하지 않음) |
| `D` `I` `S` `C` | 그 유형이 1위로 나오게 채우고 결과로 이동 (유형별 결과 화면 확인용) |
| 📄 | 지금 페이지의 미응답 10문항만 채움 (페이지 넘김 테스트용) |
| ↺ | 응답을 지우고 인트로부터 다시 |
| ✕ | 숨기기 (새로고침하면 다시 나옴) |

지도를 빠르게 테스트하려면 `D` `I` `S` `C` 버튼을 사용하세요. 매번 다른 닉네임으로 저장되어 노드가 쌓입니다.
기본 제공되는 `/demo` 스페이스를 쓰거나, `/admin`에서 비밀번호 없이 `devtest`를 만들어 `/devtest`를
쓰면 실제 세미나 스페이스와 섞이지 않습니다.

> DEV 바는 `import.meta.env.DEV`가 참인 Vite 개발 서버에서만 렌더링됩니다.
> 프로덕션 빌드에서는 조건이 제거되므로 세미나 참가자에게 노출되지 않습니다.

## 문항 수정

`assets/data.ts` 의 `Q` 배열을 고친 뒤 **반드시** 검증하세요.

```bash
npm run verify
```

유형당 **매력 10 / 짖음 5** 균형이 깨지면 점수 스케일이 왜곡됩니다.
검증 스크립트는 4개 매력 버킷(`D+ I+ S+ C+`) 각 10개와 4개 짖음 버킷
(`D- I- S- C-`) 각 5개, 중복 0, 총 60,
페이지별 유형 편중, 문항 텍스트의 검사명 노출까지 확인합니다.
Actions도 배포 전에 같은 검증을 돌립니다.

- 매력 원점수: 10~50
- 짖음 원점수: 5~25
- 성향 강도: 15~75
- 매력과 짖음의 차이: 문항 수가 다르므로 각각의 1~5점 평균끼리 비교

기존 Supabase 테이블을 사용 중이라면 매력 점수 상한을 50으로 넓히기 위해
배포 전에 `npm run db:migrate`(또는 최초 1회는 `npm run db:baseline`)를 실행해야 합니다.

리터럴 형태(`{t:'D',p: 1,x:'...'}`)는 정규식으로 파싱되므로 유지해야 합니다.

---

## 브라우저에 남는 것 — 완료 10벌 + 진행 중 1벌

세미나는 여러 번 열리고, 같은 사람이 다음 스페이스에 또 들어옵니다. 그래서 응답을
`localStorage`(`dogtype:answers:v1`)에 들고 있습니다. **서버로는 가지 않습니다.**

| 칸 | 무엇 | 언제 사라지나 |
|---|---|---|
| draft × 1 | 진행 중인 한 벌 (60문항 응답 + 페이지 + 닉네임). **done 10벌과 별도 칸이다** | 그 스페이스를 다 풀면 done으로 옮겨감 · `/profile`에서 삭제 · 다른 스페이스에서 **새로 시작하면** 대체 (묻고 나서) |
| done × 10 | 끝낸 응답 (60문항 응답 + 그때 받은 결과) | 11번째 새 스페이스 응답이 들어오면 **가장 오래된 것부터** · `/profile`에서 삭제 |

- **이어하기** — 새로고침하거나 창을 닫아도 답한 데까지 그대로 열립니다. draft는
  **스페이스마다 따라가지 않습니다** — `hazel-corgi-427`에서 풀던 걸 `ax0716`에 이어붙이면
  안 되니까요. 진행 중인 한 벌은 언제나 하나입니다.
- **다시 쓰기** — 닉네임을 넣고 **시작하기**를 누르면, 끝낸 응답이 있는 사람에게만 갈림길이
  한 번 나옵니다: 최근 10벌 중에 고르거나(→ 60문항을 건너뛰고 바로 결과) 새로 답하거나.
  저장된 게 없으면 이 화면은 아예 나오지 않고 곧장 설문으로 갑니다 —
  처음 온 참가자에게는 세미나 흐름이 예전과 똑같습니다.
  같은 스페이스를 다시 하면 새 응답이 예전 것을 대신하므로, 한 스페이스가 저장 칸을 두 번 먹지 않습니다.
  10벌이 모두 찬 뒤 새 스페이스 응답을 저장하면 가장 오래된 응답이 **이 브라우저의
  `/profile`에서만** 사라집니다. 해당 스페이스에서 탈퇴되는 것은 아니며, 지도와 스페이스
  자체에는 영향을 주지 않습니다.
- **되돌릴 수 없는 일은 묻고 합니다.** 되돌릴 수 없는 지점이 세 군데인데 전부 한 번 더 묻습니다.

  | 무엇을 누르면 | 무엇이 사라지거나 올라가나 |
  |---|---|
  | 재사용 목록의 한 벌 | 지도에 **바로 발행** — anon 키로는 DELETE가 막혀 있어 직접 못 지웁니다 |
  | 다른 스페이스에서 **시작하기** | 저쪽에서 풀던 draft |
  | `/profile`의 **삭제** | 그 응답 (복구 불가) |

  draft가 밀려나는 건 **새로 시작할 때뿐**입니다. 다른 스페이스에서 결과를 내거나 재사용을
  제출해도 저쪽 draft는 그대로 남습니다 — B를 끝냈다고 A에서 답해둔 30문항이 사라질 이유가
  없으니까요.
- **점수는 언제나 다시 계산합니다.** 저장된 결과(`code`)는 목록에 보여줄 표지일 뿐이고,
  재사용할 때는 저장된 60문항 응답을 `score()`에 다시 넣습니다. 채점 규칙이 바뀌어도
  옛 점수가 되살아나지 않습니다.
- 서버에 저장된 결과와는 별개입니다. `/profile`에서 지워도 **지도에 올라간 결과는 남습니다**
  — 그건 24시간 뒤 자동으로 사라집니다.

`/profile`의 삭제는 되돌릴 수 없습니다. 이 브라우저에만 있는 데이터라 복구할 곳이 없습니다.

---

## 수집하지 않는 것

실명 · 부서 · 사번 · 이메일 · IP · User-Agent. **입력칸 자체가 없습니다.**

"이름 또는 닉네임"이 아니라 **"닉네임"** 입니다.
실명을 유도하면 사람들이 단점 문항에 솔직하게 답하지 않습니다.

모든 응답은 24시간 뒤 자동 삭제됩니다.

---

## 카피 원칙

이 프로젝트의 카피는 기능입니다. 무심코 바꾸면 도구가 망가집니다.

- **"단점" → "짖음(Bark)"**, **"장점" → "매력(Charm)"**, **"총점" → "성향 강도"**
  "단점 19점"은 상처고 "짖음 19"는 웃음입니다. 같은 숫자인데 받아들이는 게 완전히 다릅니다.
- **짖음은 결함이 아니라 매력이 과할 때 나는 소리**입니다.
- **"안 맞는다" ≠ "싫어한다"** — 관계를 진단하는 게 아니라 번역기를 주는 겁니다.
- **조언은 실행 가능해야 합니다.** "이해하려 노력하세요"(❌) / "통보하지 말고 예고해라"(⭕)
- UI 안내문은 존댓말, `HOW` 대응 가이드만 명령형 반말.
- **점수가 높다 = 좋다가 아닙니다.** "진하다"입니다.
- 견종을 바꾸지 마세요. 전부 강아지인 이유는 D에 사자·독수리를 놓으면
  "D = 우월한 유형"으로 소비되기 때문입니다. 같은 종 안의 품종 차이로 가면 서열이 안 생깁니다.

내부적으로는 DISC 검사지만 **검사가 끝날 때까지 "DISC"라는 단어가 화면 어디에도 나오면 안 됩니다.**
알고 나서 답하면 결과가 오염됩니다. 결과 화면에서만 유형 코드(D/I/S/C)를 노출합니다.

---

## 면책

DISC는 학술적 타당성에 대한 비판이 있습니다.
**채용·평가·배치에 쓰지 마세요.** 자기 이해와 팀 커뮤니케이션 워크숍 용도 한정입니다.
