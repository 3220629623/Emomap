export const CELL_SIZE = 1024;
export const MIN_NOTE_DISTANCE = 80;
export const WRITE_PRICE_CENTS = 1;
export const WRITE_CREDITS_PER_PAYMENT = 1;
export const MAX_NOTE_TEXT_LENGTH = 500;
export const MAX_IMAGES_PER_NOTE = 6;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getCellCoord(value: number) {
  return Math.floor(value / CELL_SIZE);
}
