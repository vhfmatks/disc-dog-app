import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// 엔트리는 index.html 하나이고 화면은 경로로 갈린다(src/lib/router.ts).
// base가 상대경로여도 되는 이유: GitHub Pages는 /<groupId> 를 404로 떨구고,
// public/404.html이 프로젝트 루트로 되돌린 뒤 주소를 복원한다. 그래서 index.html은
// 언제나 프로젝트 루트에서 로드되고 asset 상대경로가 깨지지 않는다.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 8080,
    strictPort: true
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true
  }
});
