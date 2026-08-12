export const ROOM_CODE_LENGTH = 6;

export function formatRoomCodeInput(value) {
  return value
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, ROOM_CODE_LENGTH);
}

export function isCompleteRoomCode(value) {
  return value.length === ROOM_CODE_LENGTH;
}
