import {dogFace} from '../../assets/data.ts';
import type {TypeCode} from '../../assets/data.ts';

interface DogFaceProps {
  type: TypeCode;
  size?: number;
  className?: string;
}

export function DogFace({type, size = 100, className = ''}: DogFaceProps) {
  return (
    <span
      className={`dog-face-host ${className}`.trim()}
      dangerouslySetInnerHTML={{__html: dogFace(type, {size})}}
    />
  );
}

export function SvgDogFace({type, size = 100}: {type: TypeCode; size?: number}) {
  return <g dangerouslySetInnerHTML={{__html: dogFace(type, {size})}} />;
}
