import {SCORE, TYPES, blendNote} from '../../assets/data.ts';
import type {Result as ScoreResult} from '../../assets/data.ts';
import {Compatibility} from './Compatibility.tsx';
import {DogFace} from './DogFace.tsx';
import {ScoreChart} from './ScoreChart.tsx';

/** 설문 직후 화면과 프로필의 다시 보기에서 공유하는 개인 결과 본문. */
export function PersonalResult({result}: {result: ScoreResult}) {
  const type = TYPES[result.primary];
  const blend = blendNote(result.code);

  return (
    <div className="personal-result">
      <div className="dogcard fadeup" style={{background: type.hex}}>
        <div style={{position: 'relative', zIndex: 1}}>
          <DogFace type={result.primary} size={116} />
          <div style={{marginTop: 6}}><span className="code">{result.code}</span></div>
          <h1>{type.name}</h1>
          <div className="breed">{type.breed}</div>
          <p className="tagline">{type.tagline}</p>
          {blend && <p className="blend">{blend}</p>}
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">네 가지 성향의 강도</h2>
        <ScoreChart result={result} />
        <p className="small muted center" style={{marginTop: 8}}>
          높다고 좋은 게 아니라 <b>진하다</b>는 뜻입니다.
        </p>
      </section>

      <section className="section">
        <h2 className="section-title">매력과 짖음</h2>
        <div className="minis">
          <div className="mini">
            <div className="k">매력 Charm</div>
            <div className="v">{result.charmScore}<small> / {SCORE.charmMax}</small></div>
            <div className="kw">{type.charm.join(' · ')}</div>
          </div>
          <div className="mini">
            <div className="k">짖음 Bark</div>
            <div className="v">{result.barkScore}<small> / {SCORE.barkMax}</small></div>
            <div className="kw">{type.bark.join(' · ')}</div>
          </div>
          <div className="mini wide">
            <div className="k">성향 강도</div>
            <div className="v">{result.intensity}<small> / {SCORE.totalMax}</small></div>
            <div className="kw">
              문항 평균 · 매력 {result.charmAvg.toFixed(1)} / 짖음 {result.barkAvg.toFixed(1)} · 차이 {result.gap > 0 ? '+' : ''}{result.gap}
            </div>
            <p className="note">{result.gapNote}</p>
          </div>
        </div>
        <p className="small muted" style={{marginTop: 10}}>
          짖음은 결함이 아니라 <b>매력이 과할 때 나는 소리</b>예요. 낮을수록 좋은 점수가 아닙니다.
        </p>
      </section>

      <Compatibility primary={result.primary} />
    </div>
  );
}
