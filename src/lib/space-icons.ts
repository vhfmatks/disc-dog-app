export const SPACE_ICONS = [
  {id: 'corgi', label: '웰시 코기'},
  {id: 'dachshund', label: '닥스훈트'},
  {id: 'husky', label: '시베리안 허스키'},
  {id: 'pug', label: '퍼그'},
  {id: 'poodle', label: '푸들'},
  {id: 'beagle', label: '비글'},
  {id: 'dalmatian', label: '달마시안'},
  {id: 'bulldog', label: '잉글리시 불도그'},
  {id: 'chihuahua', label: '치와와'},
  {id: 'maltese', label: '말티즈'},
  {id: 'samoyed', label: '사모예드'},
  {id: 'schnauzer', label: '슈나우저'},
  {id: 'papillon', label: '파피용'},
  {id: 'yorkshire-terrier', label: '요크셔 테리어'},
  {id: 'pomeranian', label: '포메라니안'},
  {id: 'doberman', label: '도베르만'},
  {id: 'boxer', label: '복서'},
  {id: 'great-dane', label: '그레이트 데인'},
  {id: 'shih-tzu', label: '시추'},
  {id: 'old-english-sheepdog', label: '올드 잉글리시 쉽독'},
] as const;

export type SpaceIconId = (typeof SPACE_ICONS)[number]['id'];

export const DEFAULT_SPACE_ICON_ID: SpaceIconId = 'corgi';

const SPACE_ICON_ID_SET: ReadonlySet<string> = new Set(
  SPACE_ICONS.map(({id}) => id),
);

export function isSpaceIconId(value: string): value is SpaceIconId {
  return SPACE_ICON_ID_SET.has(value);
}
