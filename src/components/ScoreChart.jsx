import {ORDER, SCORE, TYPES} from '../../assets/data.js';

const WIDTH = 560;
const HEIGHT = 292;
const PLOT = {left: 46, right: 20, top: 24, bottom: 218};
const TICKS = [0, 15, 30, 45, 60, 75];

export function ScoreChart({result}) {
  const chartWidth = WIDTH - PLOT.left - PLOT.right;
  const chartHeight = PLOT.bottom - PLOT.top;
  const x = index => PLOT.left + (chartWidth * index / (ORDER.length - 1));
  const y = value => PLOT.bottom - (chartHeight * value / SCORE.totalMax);
  const path = values => values
    .map((value, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(value).toFixed(1)}`)
    .join(' ');

  const series = [
    {key: 'total', label: '성향 강도', values: ORDER.map(type => result.totals[type])},
    {key: 'weakness', label: '짖음', values: ORDER.map(type => result.bark[type])},
    {key: 'strength', label: '매력', values: ORDER.map(type => result.charm[type])}
  ];

  const description = ORDER.map(type => (
    `${TYPES[type].name}: 매력 ${result.charm[type]}점, 짖음 ${result.bark[type]}점, 성향 강도 ${result.totals[type]}점`
  )).join('. ');

  return (
    <div className="score-chart card">
      <div className="chart-legend" aria-hidden="true">
        <span className="strength"><i />매력</span>
        <span className="weakness"><i />짖음</span>
        <span className="total"><i />성향 강도</span>
      </div>
      <div className="chart-scroll">
        <svg
          className="line-chart"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-labelledby="score-chart-title score-chart-desc"
        >
          <title id="score-chart-title">유형별 매력, 짖음, 성향 강도 점수 꺾은선 그래프</title>
          <desc id="score-chart-desc">{description}</desc>

          {TICKS.map(tick => (
            <g className="chart-y-tick" key={tick}>
              <line x1={PLOT.left} y1={y(tick)} x2={WIDTH - PLOT.right} y2={y(tick)} />
              <text x={PLOT.left - 12} y={y(tick) + 4} textAnchor="end">{tick}</text>
            </g>
          ))}

          {ORDER.map((type, index) => (
            <g className="chart-category" key={type}>
              <line x1={x(index)} y1={PLOT.top} x2={x(index)} y2={PLOT.bottom} />
              <text className="chart-x-label" x={x(index)} y="246" textAnchor="middle">
                <tspan x={x(index)}>{TYPES[type].name}</tspan>
                <tspan className="chart-x-breed" x={x(index)} dy="18">{TYPES[type].breed}</tspan>
              </text>
            </g>
          ))}

          {series.map(item => (
            <path className={`chart-line ${item.key}`} d={path(item.values)} key={item.key} />
          ))}

          {series.flatMap(item => item.values.map((value, index) => {
            const other = item.key === 'strength'
              ? result.bark[ORDER[index]]
              : result.charm[ORDER[index]];
            const close = item.key !== 'total' && Math.abs(value - other) < 3;
            const labelY = close ? y(value) + (item.key === 'strength' ? -7 : 15) : y(value) - 10;
            return (
              <g className={`chart-point ${item.key}`} key={`${item.key}-${ORDER[index]}`}>
                <title>{TYPES[ORDER[index]].name} {item.label} {value}점</title>
                <circle cx={x(index)} cy={y(value)} r="5" />
                <text x={x(index)} y={labelY} textAnchor="middle">{value}</text>
              </g>
            );
          }))}
        </svg>
      </div>
    </div>
  );
}

