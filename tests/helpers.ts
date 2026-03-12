import { Jimp } from "jimp";

function rgbaToInt(red: number, green: number, blue: number, alpha: number): number {
  return (((red & 0xff) << 24) | ((green & 0xff) << 16) | ((blue & 0xff) << 8) | (alpha & 0xff)) >>> 0;
}

export async function createSolidImageBuffer(
  color: { r: number; g: number; b: number },
  options: { width?: number; height?: number; striped?: boolean } = {}
): Promise<Buffer> {
  const width = options.width ?? 96;
  const height = options.height ?? 72;
  const image = new Jimp({ width, height, color: 0xffffffff });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const modifier = options.striped && (x + y) % 8 < 4 ? 0.82 : 1;
      const hex = rgbaToInt(
        Math.round(color.r * modifier),
        Math.round(color.g * modifier),
        Math.round(color.b * modifier),
        255
      );
      image.setPixelColor(hex, x, y);
    }
  }

  return Buffer.from(await image.getBuffer("image/png"));
}

export async function waitFor(check: () => Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error("Condition was not met before timeout.");
}
