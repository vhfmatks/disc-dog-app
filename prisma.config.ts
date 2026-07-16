// Prisma 7 설정. 접속 URL은 더 이상 schema.prisma에 쓸 수 없어 여기로 왔습니다.
//
// Prisma 7은 .env를 자동으로 읽지 않습니다. 아래 dotenv import가 그 일을 합니다.
// GitHub Actions에는 .env 파일이 없고 DATABASE_URL이 환경변수로 직접 주입되는데,
// dotenv는 이미 있는 환경변수를 덮어쓰지 않으므로 양쪽 다 그대로 동작합니다.

import 'dotenv/config';
import {defineConfig} from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations'
  },
  datasource: {
    // 마이그레이션 전용입니다. 앱 런타임은 supabase-js를 쓰며 이 URL을 모릅니다.
    //
    // Supabase에 붙일 때는 반드시 session mode(5432)나 direct 연결을 쓰세요.
    // transaction mode(6543)로는 마이그레이션이 돌지 않습니다. 자세한 건 .env.example.
    url: process.env['DATABASE_URL']
  }
});
