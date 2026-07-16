const ROOM_RE = /[^a-z0-9-]/g;

export function parseRoom(search = window.location.search) {
  const params = new URLSearchParams(search);
  const raw = params.get('r') || params.get('room') || '';
  const room = raw.toLowerCase().replace(ROOM_RE, '').slice(0, 24);
  return room.length >= 3 ? room : 'demo';
}

function siblingUrl(file, room) {
  const base = new URL('.', window.location.href);
  const url = new URL(file, base);
  url.searchParams.set('r', room);
  return url.href;
}

export const participantUrl = room => siblingUrl('index.html', room);
export const mapUrl = room => siblingUrl('map.html', room);

