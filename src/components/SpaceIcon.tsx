import {SPACE_ICONS} from '../lib/space-icons.ts';
import type {SpaceIconId} from '../lib/space-icons.ts';

export interface SpaceIconProps {
  iconId: SpaceIconId;
  size?: number;
  className?: string;
  decorative?: boolean;
}

const INK = '#332923';
const EYE = '#201B18';

function DogArtwork({iconId}: {iconId: SpaceIconId}) {
  switch (iconId) {
    case 'corgi':
      return (
        <>
          <path fill="#C87532" d="M18 27 14 8q12 4 16 14M46 27 50 8Q38 12 34 22" />
          <path fill="#F2A65A" d="M17 30q2-14 15-14t15 14v13q-3 12-15 12T17 43Z" />
          <path fill="#FFF5E7" d="m27 18 5 8 5-8-1 20q7 3 4 10-3 7-8 7t-8-7q-3-7 4-10Z" />
          <circle fill={EYE} cx="25" cy="34" r="2" />
          <circle fill={EYE} cx="39" cy="34" r="2" />
          <path fill={INK} d="M28 43q4-4 8 0-1 5-4 5t-4-5" />
        </>
      );
    case 'dachshund':
      return (
        <>
          <path fill="#6F3A24" d="M18 25Q6 27 9 46q2 9 11 3l5-19M46 25q12 2 9 21-2 9-11 3l-5-19" />
          <path fill="#A95F32" d="M19 31q0-15 13-15t13 15v12q0 12-13 12T19 43Z" />
          <path fill="#D98A4F" d="M25 44q7-8 14 0v5q-2 6-7 6t-7-6Z" />
          <circle fill={EYE} cx="25" cy="34" r="2" />
          <circle fill={EYE} cx="39" cy="34" r="2" />
          <ellipse fill={INK} cx="32" cy="45" rx="4" ry="3" />
        </>
      );
    case 'husky':
      return (
        <>
          <path fill="#596778" d="m17 27 2-19 13 12L45 8l2 19-3 20H20Z" />
          <path fill="#F6F7F4" d="m32 19-7 8-5 2 4 17q2 9 8 9t8-9l4-17-5-2Zm-9 10 7 2-5 6Zm18 0-7 2 5 6Z" />
          <path fill="#8DA9BE" d="m23 31 7 2-5 4Zm18 0-7 2 5 4Z" />
          <circle fill={EYE} cx="26" cy="34" r="1.4" />
          <circle fill={EYE} cx="38" cy="34" r="1.4" />
          <path fill={INK} d="m28 44 4-3 4 3-1 4h-6Z" />
        </>
      );
    case 'pug':
      return (
        <>
          <path fill="#3D302A" d="M20 25Q9 17 13 34l8 4M44 25q11-8 7 9l-8 4" />
          <path fill="#CFA873" d="M17 31q1-15 15-15t15 15v12q-2 12-15 12T17 43Z" />
          <path fill="none" d="M25 24q7 4 14 0M24 29q8 4 16 0" />
          <path fill="#55433A" d="M23 40q0-9 9-9t9 9v8q-3 7-9 7t-9-7Z" />
          <circle fill={EYE} cx="24" cy="34" r="2.4" />
          <circle fill={EYE} cx="40" cy="34" r="2.4" />
          <ellipse fill="#171311" cx="32" cy="44" rx="4" ry="3" />
        </>
      );
    case 'poodle':
      return (
        <>
          <g fill="#9E6848">
            <circle cx="20" cy="25" r="9" /><circle cx="27" cy="19" r="9" />
            <circle cx="37" cy="19" r="9" /><circle cx="44" cy="25" r="9" />
            <circle cx="17" cy="36" r="8" /><circle cx="47" cy="36" r="8" />
            <circle cx="25" cy="31" r="10" /><circle cx="39" cy="31" r="10" />
          </g>
          <path fill="#BE825C" d="M21 34q0-9 11-9t11 9v11q-2 10-11 10T21 45Z" />
          <circle fill={EYE} cx="26" cy="36" r="2" />
          <circle fill={EYE} cx="38" cy="36" r="2" />
          <ellipse fill={INK} cx="32" cy="45" rx="3.5" ry="2.8" />
        </>
      );
    case 'beagle':
      return (
        <>
          <path fill="#6B3B26" d="M19 25Q7 23 9 43q1 12 12 8l5-19M45 25q12-2 10 18-1 12-12 8l-5-19" />
          <path fill="#F4F0DF" d="M19 30q1-14 13-14t13 14v14q-2 11-13 11T19 44Z" />
          <path fill="#9C552D" d="M19 31q0-15 13-15v15q-7-5-13 0m26 0q0-15-13-15v15q7-5 13 0" />
          <circle fill={EYE} cx="25" cy="35" r="2" />
          <circle fill={EYE} cx="39" cy="35" r="2" />
          <ellipse fill={INK} cx="32" cy="45" rx="4" ry="3" />
        </>
      );
    case 'dalmatian':
      return (
        <>
          <path fill="#F7F6F0" d="M19 27Q7 21 11 43q2 10 11 6M45 27q12-6 8 16-2 10-11 6" />
          <path fill="#FFFDF7" d="M18 31q0-15 14-15t14 15v12q-2 12-14 12T18 43Z" />
          <g fill="#2E2926">
            <circle cx="19" cy="26" r="3" /><circle cx="43" cy="22" r="3" />
            <circle cx="24" cy="42" r="2.3" /><circle cx="41" cy="46" r="2.3" />
            <circle cx="25" cy="34" r="2" /><circle cx="39" cy="34" r="2" />
            <ellipse cx="32" cy="45" rx="4" ry="3" />
          </g>
        </>
      );
    case 'bulldog':
      return (
        <>
          <path fill="#9B6A4D" d="m19 26-7-9 12 2m21 7 7-9-12 2" />
          <path fill="#C98E65" d="M14 33q2-17 18-17t18 17l-3 14q-4 8-15 8t-15-8Z" />
          <path fill="#F6E9D7" d="M18 38q6-7 14 0 8-7 14 0l1 9q-4 8-15 8t-15-8Z" />
          <path fill="none" d="M20 29q5-4 9 0m6 0q4-4 9 0" />
          <circle fill={EYE} cx="25" cy="34" r="2" />
          <circle fill={EYE} cx="39" cy="34" r="2" />
          <ellipse fill={INK} cx="32" cy="43" rx="4.5" ry="3.2" />
          <path fill="none" d="M25 49q7 4 14 0" />
        </>
      );
    case 'chihuahua':
      return (
        <>
          <path fill="#B97443" d="M23 26 9 9q-1 19 10 26m22-9L55 9q1 19-10 26" />
          <path fill="#D99A61" d="M19 31q1-14 13-14t13 14v12q-2 12-13 12T19 43Z" />
          <path fill="#F5D5A7" d="M24 43q8-8 16 0v5q-3 7-8 7t-8-7Z" />
          <circle fill={EYE} cx="24" cy="34" r="2.7" />
          <circle fill={EYE} cx="40" cy="34" r="2.7" />
          <path fill={INK} d="m29 44 3-2 3 2-1 3h-4Z" />
        </>
      );
    case 'maltese':
      return (
        <>
          <path fill="#FAFAF5" d="M16 30q0-13 10-13 6-7 12 0 10 0 10 13l-3 18q-4 7-13 7t-13-7Z" />
          <path fill="none" d="M25 19q-5 13-7 27m21-27q5 13 7 27M28 23l-5 10m13-10 5 10" />
          <path fill="#E8657A" d="m26 17-6-4v8Zm12 0 6-4v8Zm-12 0q6-4 12 0-6 4-12 0" stroke="none" />
          <circle fill={EYE} cx="25" cy="35" r="2" />
          <circle fill={EYE} cx="39" cy="35" r="2" />
          <ellipse fill={INK} cx="32" cy="44" rx="3.5" ry="2.7" />
        </>
      );
    case 'samoyed':
      return (
        <>
          <path fill="#F5F4EB" d="m19 25-2-15 10 9q5-5 10 0l10-9-2 15q7 6 3 18-3 12-16 12T16 43q-4-12 3-18" />
          <path fill="#FFFFFF" d="M21 31q11-11 22 0l-2 16q-4 8-9 8t-9-8Z" />
          <circle fill={EYE} cx="25" cy="35" r="2" />
          <circle fill={EYE} cx="39" cy="35" r="2" />
          <ellipse fill={INK} cx="32" cy="43" rx="3.5" ry="2.5" />
          <path fill="none" d="M25 48q7 7 14 0" />
        </>
      );
    case 'schnauzer':
      return (
        <>
          <path fill="#666B6C" d="m20 27-5-14 13 8m16 6 5-14-13 8" />
          <path fill="#8A8F8E" d="M18 31q1-15 14-15t14 15v10q-1 14-14 14T18 41Z" />
          <path fill="#D5D1C8" d="m20 30 10-4-3 8Zm24 0-10-4 3 8ZM23 40l9-5 9 5 3 11-7-2-5 8-5-8-7 2Z" />
          <circle fill={EYE} cx="25" cy="34" r="1.8" />
          <circle fill={EYE} cx="39" cy="34" r="1.8" />
          <ellipse fill={INK} cx="32" cy="43" rx="3.7" ry="2.8" />
        </>
      );
    case 'papillon':
      return (
        <>
          <path fill="#7A4B37" d="M23 28Q7 25 8 7q16 5 20 20m13 1Q57 25 56 7 40 12 36 27" />
          <path fill="#E8C5A5" d="M21 25Q12 20 12 12q11 5 14 16m17-3q9-5 9-13-11 5-14 16" />
          <path fill="#FFF8EC" d="M20 30q1-14 12-14t12 14v14q-2 11-12 11T20 44Z" />
          <path fill="#8D563B" d="M28 17q4-3 8 0l-4 18Z" />
          <circle fill={EYE} cx="25" cy="35" r="2" />
          <circle fill={EYE} cx="39" cy="35" r="2" />
          <ellipse fill={INK} cx="32" cy="45" rx="3.5" ry="2.7" />
        </>
      );
    case 'yorkshire-terrier':
      return (
        <>
          <path fill="#80523D" d="m20 28-3-17 12 10m15 7 3-17-12 10" />
          <path fill="#9B725A" d="M18 31q1-15 14-15t14 15v13q-2 11-14 11T18 44Z" />
          <path fill="#D9B066" d="m22 22 7 8-8 18 11 7 11-7-8-18 7-8-10 7Z" />
          <path fill="#E8657A" d="m27 17-6-4v8Zm10 0 6-4v8Zm-10 0q5-4 10 0-5 4-10 0" stroke="none" />
          <circle fill={EYE} cx="25" cy="35" r="2" />
          <circle fill={EYE} cx="39" cy="35" r="2" />
          <ellipse fill={INK} cx="32" cy="44" rx="3.5" ry="2.7" />
        </>
      );
    case 'pomeranian':
      return (
        <>
          <path fill="#C87832" d="m20 25-2-14 10 9h8l10-9-2 14q8 4 7 13l-5 3 3 6-7 1-2 7-8-3-8 3-2-7-7-1 3-6-5-3q-1-9 7-13" />
          <path fill="#E9A552" d="M21 31q2-13 11-13t11 13v13q-2 11-11 11T21 44Z" />
          <path fill="#F6D29C" d="M25 43q7-8 14 0v5q-2 7-7 7t-7-7Z" />
          <circle fill={EYE} cx="25" cy="34" r="2" />
          <circle fill={EYE} cx="39" cy="34" r="2" />
          <ellipse fill={INK} cx="32" cy="44" rx="3.5" ry="2.7" />
        </>
      );
    case 'doberman':
      return (
        <>
          <path fill="#282727" d="m20 28-4-19 14 12h4L48 9l-4 19 2 18q-3 9-14 9t-14-9Z" />
          <path fill="#A85B31" d="m20 29 8 2-4 8Zm24 0-8 2 4 8ZM24 44q8-7 16 0v6q-3 5-8 5t-8-5Z" />
          <circle fill={EYE} cx="25" cy="34" r="2" />
          <circle fill={EYE} cx="39" cy="34" r="2" />
          <ellipse fill="#121111" cx="32" cy="44" rx="4" ry="3" />
        </>
      );
    case 'boxer':
      return (
        <>
          <path fill="#6C4331" d="M20 25Q9 17 13 34l8 4m23-13q11-8 7 9l-8 4" />
          <path fill="#B66F43" d="M16 31q1-15 16-15t16 15l-2 15q-4 9-14 9t-14-9Z" />
          <path fill="#F2E3CE" d="m32 18-5 18q-7 4-5 12 4 7 10 7t10-7q2-8-5-12Z" />
          <path fill="#44352E" d="M23 40q9-8 18 0v9q-4 6-9 6t-9-6Z" />
          <circle fill={EYE} cx="24" cy="34" r="2" />
          <circle fill={EYE} cx="40" cy="34" r="2" />
          <ellipse fill="#171311" cx="32" cy="43" rx="4.5" ry="3" />
        </>
      );
    case 'great-dane':
      return (
        <>
          <path fill="#667482" d="M20 26Q9 18 13 36l7 4m24-14q11-8 7 10l-7 4" />
          <path fill="#8795A0" d="M18 29q2-13 14-13t14 13l-2 18q-3 8-12 8t-12-8Z" />
          <path fill="#AAB4BA" d="M25 39q7-6 14 0l2 11q-4 5-9 5t-9-5Z" />
          <circle fill={EYE} cx="25" cy="33" r="2" />
          <circle fill={EYE} cx="39" cy="33" r="2" />
          <ellipse fill={INK} cx="32" cy="45" rx="4.5" ry="3" />
        </>
      );
    case 'shih-tzu':
      return (
        <>
          <path fill="#8C6046" d="M16 28q0-12 10-12 6-7 12 0 10 0 10 12v18q-4 9-16 9t-16-9Z" />
          <path fill="#F4E8D3" d="M26 18q6-5 12 0l-3 17 8 13-11 7-11-7 8-13Z" />
          <path fill="#D07374" d="m27 15-6-4v8Zm10 0 6-4v8Zm-10 0q5-4 10 0-5 4-10 0" stroke="none" />
          <circle fill={EYE} cx="25" cy="35" r="2.3" />
          <circle fill={EYE} cx="39" cy="35" r="2.3" />
          <ellipse fill={INK} cx="32" cy="44" rx="3.5" ry="2.7" />
        </>
      );
    case 'old-english-sheepdog':
      return (
        <>
          <path fill="#8B9396" d="M15 31q0-11 9-12 3-7 10-3 8-4 11 4 8 2 4 12l1 12q-2 11-18 11T14 44Z" />
          <path fill="#F5F3EB" d="M18 25q7-9 13 0l-2 18-9 8q-5-9-2-26m28 0q-7-9-13 0l2 18 9 8q5-9 2-26" />
          <path fill="#D9DCDD" d="m23 20 5 17m13-17-5 17" />
          <circle fill={EYE} cx="25" cy="38" r="2" />
          <circle fill={EYE} cx="39" cy="38" r="2" />
          <ellipse fill={INK} cx="32" cy="46" rx="4" ry="3" />
        </>
      );
  }
}

export function SpaceIcon({
  iconId,
  size = 56,
  className,
  decorative = false,
}: SpaceIconProps) {
  const {label} = SPACE_ICONS.find(({id}) => id === iconId)!;

  return (
    <svg
      className={className}
      data-space-icon={iconId}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `${label} 스페이스 아이콘`}
      focusable="false"
      style={{display: 'block', flex: '0 0 auto'}}
    >
      {!decorative && <title>{label} 스페이스 아이콘</title>}
      <circle cx="32" cy="32" r="30" fill="#FFF4DF" stroke="#E9D6B5" strokeWidth="1.5" />
      <g stroke={INK} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <DogArtwork iconId={iconId} />
      </g>
    </svg>
  );
}
