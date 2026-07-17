---
name: verify
description: 이 저장소의 변경을 실제로 돌려서 확인하는 법. 로컬 Postgres에 마이그레이션을 걸고, 브라우저로 화면을 몰아본다. Supabase 이미지를 못 받는 사내망 우회 포함.
---

# 개성 — 변경 확인하기

`npm test`는 CI가 돌립니다. 여기서는 **앱을 실제로 띄워서 봅니다.**

이 앱은 세 층이고, 층마다 확인하는 법이 다릅니다.

| 층 | 어떻게 돌리나 |
| --- | --- |
| DB (마이그레이션·RLS·트리거) | 로컬 Postgres 컨테이너 + `prisma migrate deploy` |
| Edge Function | ⚠ 로컬에서 못 돌립니다 (아래) |
| 화면 (React) | Vite dev server + Playwright |

## ⚠ 먼저 알아야 할 것: `npx supabase start`는 안 됩니다

사내망이 컨테이너 레지스트리(`public.ecr.aws`, Docker Hub)를 막습니다. `supabase start`는
이미지를 받다가 조용히 멈춥니다 — 오류도 안 냅니다. 20분 기다리지 마세요.

그래서 **PostgREST를 띄울 수 없고, Edge Function도 로컬에서 돌릴 수 없습니다**
(함수는 supabase-js로 PostgREST에 말합니다). 함수 로직은 `_shared/`의 순수 함수로
빼두었으니 `npm test`가 봅니다. 함수의 HTTP 계약 자체를 확인하려면 검증용 Supabase
프로젝트에 배포하는 수밖에 없습니다.

## DB 층 — 마이그레이션이 진짜 도는지

가장 값어치 있는 확인입니다. 여기서 실제로 버그를 잡은 적이 있습니다.

```bash
docker rm -f dogtype-verify-db 2>/dev/null
docker run -d --name dogtype-verify-db -e POSTGRES_PASSWORD=postgres \
  -p 54399:5432 postgres:17.2-alpine
until docker exec dogtype-verify-db pg_isready -U postgres; do sleep 1; done

DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54399/postgres" \
  npx prisma migrate deploy
```

**적용됐다고 끝이 아닙니다. 반드시 INSERT까지 해보세요:**

```bash
docker exec -i dogtype-verify-db psql -U postgres -q <<'SQL'
insert into public.spaces (id,name,password_hash) values ('a-space','테스트','x');
insert into public.results (room,nickname,code,primary_type,totals,charm,bark,x,y)
  values ('a-space','보리','D','D','{}',20,10,-0.5,0.5);
SQL
```

이유: PostgreSQL은 컬럼을 지울 때 **plpgsql 함수 본문을 검사하지 않습니다.** 지워진
컬럼을 읽는 트리거가 남아 있어도 마이그레이션은 조용히 성공하고, 그 다음 INSERT부터
전부 죽습니다. `7_persist_results`가 `expires_at`을 지울 때 실제로 이 일이 있었습니다
(`results_release_expired_nickname` 트리거). 컬럼을 지우는 마이그레이션을 쓴다면
`grep -rn "<컬럼>" prisma/migrations/`로 그 컬럼을 읽는 객체를 **전수로** 찾으세요.

RLS·GRANT를 확인할 때는 `set role anon`이 유일하게 정직한 방법입니다:

```bash
docker exec -i dogtype-verify-db psql -U postgres -q -c \
  "set role anon; select count(*) from public.results;"     # → permission denied 여야 정상
```

## 화면 층 — 브라우저로 몰기

Edge Function을 못 띄우므로, 함수 자리에 **대역(stand-in)** 을 세우고 `src/config.ts`를
거기로 돌립니다. 권한 판정은 대역이 지어내지 않고 `_shared/view-grants.ts`를 그대로
import해서 씁니다.

```bash
cp src/config.ts /tmp/config.bak            # 끝나고 반드시 되돌리세요
# src/config.ts의 url을 대역 주소로 바꾼 뒤
npx vite --port 5199 --strictPort
```

Playwright는 이 저장소 의존성이 아니라 npx 캐시에 있습니다. ESM에서 쓰려면:

```js
import pw from '/Users/saab/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js';
const {chromium} = pw;   // named export가 안 됩니다 (CJS)
```

**꼭 몰아볼 흐름:**

- `/{B}/map` → 단독 지도. `/{B}/map?with=a-space,c-space` → 함께보기 복원
- 권한 없는 코드를 `?with=`에 끼워넣기 → `.map-notice`가 뜨고 주소가 정리되는지
- 지도 맨 아래 `.share-open-btn` → 비밀번호 게이트 → 목록. 틀린 비밀번호가 거절되는지
- 목록에서 `공유하기` → `수락 대기`, `수락` → `함께보는 중`, `해제` → 지도가 줄어드는지
- 받은 제안(`.share-offers`)이 서랍을 열지 않아도 지도 아래에 뜨는지
- 공유가 걸린 스페이스의 참가 화면 → `.shared-notice`가 닉네임 칸 **위**에 뜨는지
- 새 브라우저 컨텍스트(= 비밀번호를 모르는 참가자)로 서랍을 열면 게이트에 막히는지

**함정:** 해시만 바뀌는 `page.goto`는 문서를 다시 읽지 않습니다(same-document 이동).
초대 링크 `#k=`를 새로 여는 흐름을 보려면 사이에 `page.goto('about:blank')`를 넣으세요.

## 끝나고

```bash
cp /tmp/config.bak src/config.ts && git diff --stat src/config.ts   # 비어 있어야 정상
docker rm -f dogtype-verify-db
```
