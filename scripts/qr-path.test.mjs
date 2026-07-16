import assert from 'node:assert/strict';
import test from 'node:test';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import {PNG} from 'pngjs';
import {QUIET_ZONE, qrPath} from '../src/lib/qr-path.ts';

/**
 * qrPath가 뱉은 path를 진짜로 다시 읽어본다.
 *
 * 눈으로 보면 QR은 다 그럴듯해서, 행/열을 뒤집거나 여백을 빠뜨려도 리뷰로는 안 걸린다.
 * 그리는 대로 픽셀을 찍고 검사한다.
 *
 * ⚠ 디코딩만으로는 부족하다. jsQR은 거울상 QR도 읽어주기 때문에, 행/열을 뒤집어도
 *   디코드 테스트는 그냥 통과한다 (직접 확인함). 그런데 폰 기본 카메라 대부분은
 *   거울상을 읽지 못한다. 그래서 라이브러리가 직접 그린 PNG를 정답지로 놓고
 *   모듈 하나하나를 대조하는 테스트를 따로 둔다.
 */

const SCALE = 4;   // 모듈당 4px — 디코더가 안정적으로 읽을 만큼

/** path의 d를 파싱해 어두운 모듈 좌표를 되찾는다. QrCode.tsx가 그리는 것과 같은 값이다. */
function darkModules(path) {
  return [...path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map(m => [Number(m[1]), Number(m[2])]);
}

/** 모듈 좌표 → RGBA 비트맵. jsQR이 카메라 프레임 대신 받을 것. */
function rasterize({path, span}) {
  const side = span * SCALE;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);   // 흰 바탕

  for (const [column, row] of darkModules(path)) {
    for (let y = row * SCALE; y < (row + 1) * SCALE; y += 1) {
      for (let x = column * SCALE; x < (column + 1) * SCALE; x += 1) {
        const at = (y * side + x) * 4;
        data[at] = data[at + 1] = data[at + 2] = 0;
      }
    }
  }
  return {data, width: side, height: side};
}

const decode = value => {
  const image = rasterize(qrPath(value));
  return jsQR(image.data, image.width, image.height)?.data;
};

test('그린 QR을 디코더가 읽으면 원래 초대 링크가 그대로 나온다', () => {
  const url = 'https://saab.github.io/disc-dog-app/jolly-collie-778#k=ca2a143110ec4d7992a378488c968f98';
  assert.equal(decode(url), url);
});

test('토큰이 다르면 QR도 다른 링크로 읽힌다', () => {
  const a = 'https://x.io/app/hazel-corgi-427#k=' + 'a'.repeat(32);
  const b = 'https://x.io/app/hazel-corgi-427#k=' + 'b'.repeat(32);
  assert.equal(decode(a), a);
  assert.equal(decode(b), b);
  assert.notEqual(qrPath(a).path, qrPath(b).path);
});

test('길이가 제각각인 링크도 전부 읽힌다', () => {
  for (const url of [
    'https://x.io/a#k=' + '0'.repeat(32),
    'https://team.example.co.kr/workshop/dogtype/mellow-samoyed-100#k=' + 'f'.repeat(32),
    'http://localhost:8080/zippy-pug-999#k=' + '9'.repeat(32)
  ]) {
    assert.equal(decode(url), url, `못 읽음: ${url}`);
  }
});

test('라이브러리가 직접 그린 QR과 모듈 하나까지 똑같다 (전치·거울상 방지)', async () => {
  const url = 'https://saab.github.io/disc-dog-app/jolly-collie-778#k=ca2a143110ec4d7992a378488c968f98';

  // 같은 입력으로 라이브러리에게 직접 그리게 한 PNG를 정답지로 쓴다.
  // scale 1이면 픽셀 1개가 모듈 1개라 좌표가 그대로 맞는다.
  //
  // margin은 QUIET_ZONE이 아니라 규격 최소치 4를 그대로 박는다. 상수를 양쪽에 쓰면
  // QUIET_ZONE을 0으로 바꿔도 정답지가 같이 0이 되어 테스트가 통과해버린다.
  const dataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M', margin: 4, scale: 1
  });
  const reference = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'));
  const isDark = (x, y) => reference.data[(y * reference.width + x) * 4] < 128;

  const {path, span} = qrPath(url);
  assert.equal(span, reference.width, '한 변의 모듈 수가 정답지와 다름');

  const mine = new Set(darkModules(path).map(([x, y]) => `${x},${y}`));
  let checked = 0;
  for (let y = 0; y < span; y += 1) {
    for (let x = 0; x < span; x += 1) {
      assert.equal(mine.has(`${x},${y}`), isDark(x, y), `모듈 (${x},${y})이 정답지와 다름`);
      checked += 1;
    }
  }
  assert.equal(checked, span * span);
});

test('여백(quiet zone)만큼 밀려 있고 밖으로 삐져나가지 않는다', () => {
  const {path, span} = qrPath('https://x.io/app/hazel-corgi-427#k=' + 'c'.repeat(32));
  const modules = darkModules(path);

  const xs = modules.map(m => m[0]);
  const ys = modules.map(m => m[1]);
  // 여백이 없으면 스캐너가 코드 경계를 못 찾는다.
  assert.ok(Math.min(...xs) >= QUIET_ZONE, '왼쪽 여백 침범');
  assert.ok(Math.min(...ys) >= QUIET_ZONE, '위쪽 여백 침범');
  assert.ok(Math.max(...xs) <= span - QUIET_ZONE - 1, '오른쪽 여백 침범');
  assert.ok(Math.max(...ys) <= span - QUIET_ZONE - 1, '아래쪽 여백 침범');

  // 좌상단 파인더 패턴은 여백 바로 다음에서 시작한다. 전치되면 여기가 어긋난다.
  assert.ok(modules.some(([x, y]) => x === QUIET_ZONE && y === QUIET_ZONE), '파인더 패턴 위치 이상');
});
