# 🐶 강아지 유형 세미나 도구

60문항에 답하면 네 마리 강아지 중 하나로 판정하고, **같은 방 참가자들의 관계도를
실시간으로 대형 화면에 그려주는** 사내 세미나용 웹앱입니다.

| | |
|---|---|
| 참가자 | `index.html` — 폰 (QR로 진입) |
| 진행자 | `map.html` — 데스크톱 + 프로젝터 |
| 백엔드 | Supabase (Postgres + RLS + Realtime) |
| 호스팅 | GitHub Pages |
| 프런트엔드 | Vite + React |

Vite 다중 페이지 빌드로 참가자 화면과 진행자 화면을 각각 생성합니다. 기존 주소인
`index.html?r=<방코드>`와 `map.html?r=<방코드>`는 그대로 유지됩니다.

---

## 빠른 시작

```bash
git clone <이 저장소> && cd dogtype

cp .env.example .env      # 값을 채우세요 (아래 참조)
npm install
npm run dev               # http://localhost:8080
```

- 참가자 화면 → http://localhost:8080/index.html?r=demo
- 진행자 화면 → http://localhost:8080/map.html?r=demo

프로덕션 번들은 `npm run build`로 `dist/`에 생성되며, `npm run preview`로 확인할 수 있습니다.

---

## 설정 (`.env`)

```bash
SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
```

Supabase → **Project Settings → Data API** 에서 `Project URL` 과 `anon public` 키를 복사합니다.

`.env` 와 빌드 전에 생성되는 `src/config.js` 는 **커밋되지 않습니다**(`.gitignore`).
`npm run dev`와 `npm run build`가 설정 생성과 문항 검증을 자동으로 수행합니다.

> **anon 키가 브라우저에 노출되는 것은 정상입니다.** 숨기려 하지 마세요. RLS가 방어선입니다.
> `service_role` 키는 절대 넣지 마세요 — `gen-config.mjs` 가 감지하면 실행을 거부합니다.

---

## Supabase 셋업

1. 프로젝트 생성 — 리전은 **Northeast Asia (Seoul)**
2. **Database → Extensions** 에서 `pg_cron` 검색 후 켜기
   - 안 켜면 `schema.sql` 마지막 블록만 실패합니다. 테이블·RLS·Realtime은 이미 적용된 상태이고,
     RLS가 만료된 행을 숨기므로 세미나 진행에는 지장이 없습니다. 다만 행이 실제로 삭제되진 않습니다.
3. **SQL Editor** 에 `schema.sql` 전체를 붙여넣고 Run (재실행해도 안전)
4. **Project Settings → Data API** 에서 URL / anon 키를 복사 → `.env`

### 만들어지는 것

- `public.results` 테이블 + 인덱스 2개
- RLS: **SELECT**(만료 전만) / **INSERT**(24시간 초과 금지) 만 허용. UPDATE·DELETE는 정책 없음 = 전면 거부
- 방당 200명 상한 트리거
- Realtime publication
- 매시 17분 만료 행 삭제 (`pg_cron`)

---

## 배포 (GitHub Pages)

저장소 **Settings → Secrets and variables → Actions** 에 등록:

| Secret | 값 |
|---|---|
| `SUPABASE_URL` | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | anon public 키 |

**Settings → Pages → Source** 를 **GitHub Actions** 로 바꾼 뒤 `main` 에 push 하면
`.github/workflows/deploy.yml` 이 의존성 설치 → 설정 생성·문항 검증·Vite 빌드 → `dist/` 배포까지 처리합니다.

---

## 프로젝트 구조

```text
index.html                 참가자 React 진입점
map.html                   진행자 React 진입점
src/ParticipantApp.jsx     인트로 → 60문항 → 결과 → 저장
src/MapApp.jsx             Supabase 조회·Realtime → 관계도
src/components/            강아지, 차트, 궁합 컴포넌트
src/lib/                   방 URL과 Supabase 접근 계층
assets/data.js             문항·채점·유형·관계 규칙
assets/style.css           두 화면의 공용 스타일
schema.sql                 Supabase 스키마와 60문항 마이그레이션
```

---

## 방 코드

```
?r=ax0716      [a-z0-9-]{3,24} · 미지정 시 demo
```

세미나마다 바꾸세요. 안 바꾸면 지난 회차 참가자와 섞입니다.

진행자가 `.../map.html?r=ax0716` 을 열면 QR이 참가자를 자동으로 같은 방에 넣습니다.

---

## 세미나 당일 체크리스트

- [ ] **진행자 노트북에서 `github.io` 가 열리는가** ← 제일 흔한 사고. 안 열리면 폰 테더링.
- [ ] 참가자 LTE로도 열리는가
- [ ] 방 코드를 이번 세미나용으로 바꿨는가
- [ ] 프로젝터 뒷자리에서 닉네임 글씨가 읽히는가

진행 흐름: `map.html?r=<방코드>` 를 띄우고 → QR 촬영 유도 → 강아지가 튀어나오는 걸 같이 보다가
→ 2명 이상 모이면 나타나는 **"이 지도를 읽는 법"** 카드를 대본 삼아 토론.

### 즉시 삭제

```sql
delete from public.results where room = 'ax0716';
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
`?r=devtest` 처럼 개발용 방을 쓰면 실제 세미나 방과 섞이지 않습니다.

> DEV 바는 `import.meta.env.DEV`가 참인 Vite 개발 서버에서만 렌더링됩니다.
> 프로덕션 빌드에서는 조건이 제거되므로 세미나 참가자에게 노출되지 않습니다.

## 문항 수정

`assets/data.js` 의 `Q` 배열을 고친 뒤 **반드시** 검증하세요.

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
배포 전에 `schema.sql`을 SQL Editor에서 한 번 다시 실행해야 합니다.

리터럴 형태(`{t:'D',p: 1,x:'...'}`)는 정규식으로 파싱되므로 유지해야 합니다.

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
