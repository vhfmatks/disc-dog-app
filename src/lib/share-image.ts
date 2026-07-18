// SVG 문자열을 PNG로 래스터화하고 저장·공유하는 공통 유틸. 개성(DISC)·MSC 결과 카드가
// 함께 쓴다. blob URL에서 그린 SVG는 canvas를 오염시키지 않아 toBlob이 그대로 되므로
// html2canvas 같은 외부 의존성이 필요 없다.

export type ShareOutcome = 'shared' | 'copied' | 'downloaded' | 'cancelled';

export function svgToPngBlob(svg: string, w: number, h: number, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], {type: 'image/svg+xml;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('canvas 컨텍스트를 만들지 못했습니다')); return; }
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('PNG 변환에 실패했습니다'))), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 그리지 못했습니다')); };
    img.src = url;
  });
}

export async function downloadPng(svg: string, w: number, h: number, filename: string): Promise<void> {
  const blob = await svgToPngBlob(svg, w, h);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function sharePngImage(
  svg: string, w: number, h: number, filename: string, text: string
): Promise<ShareOutcome> {
  const nav = navigator as Navigator & {
    canShare?: (data?: {files?: File[]}) => boolean;
    share?: (data: {title?: string; text?: string; files?: File[]}) => Promise<void>;
  };
  try {
    const blob = await svgToPngBlob(svg, w, h);
    const file = new File([blob], filename, {type: 'image/png'});
    if (nav.canShare?.({files: [file]}) && nav.share) {
      await nav.share({title: text, text, files: [file]});
      return 'shared';
    }
    if (nav.share) {
      await nav.share({title: text, text});
      return 'shared';
    }
    // 공유 API가 없으면 이미지를 내려받는 것으로 대신한다.
    await downloadPng(svg, w, h, filename);
    return 'downloaded';
  } catch (error) {
    if ((error as Error).name === 'AbortError') return 'cancelled';
    // 최후 수단: 텍스트라도 클립보드에.
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      throw error;
    }
  }
}
