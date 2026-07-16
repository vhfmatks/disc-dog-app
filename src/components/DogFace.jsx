import {dogFace} from '../../assets/data.js';

export function DogFace({type, size = 100, className = ''}) {
  return (
    <span
      className={`dog-face-host ${className}`.trim()}
      dangerouslySetInnerHTML={{__html: dogFace(type, {size})}}
    />
  );
}

export function SvgDogFace({type, size = 100}) {
  return <g dangerouslySetInnerHTML={{__html: dogFace(type, {size})}} />;
}

