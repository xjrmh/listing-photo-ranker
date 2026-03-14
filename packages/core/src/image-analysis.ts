import sharp from "sharp";

import { clamp } from "./utils";

export type ImageAnalysis = {
  width: number;
  height: number;
  brightness: number;
  contrast: number;
  sharpness: number;
  perspectiveRisk: number;
  landscapeBonus: number;
  exposureBalance: number;
  highlightClipping: number;
  shadowClipping: number;
  clippingBalance: number;
  colorfulness: number;
  dominantHue: "green" | "blue" | "neutral";
  perceptualHash: string;
};

type DecodedImage = {
  width: number;
  height: number;
  channels: number;
  data: Buffer;
};

function computeLuminance(red: number, green: number, blue: number): number {
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

async function decodeImage(buffer: Buffer): Promise<DecodedImage> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  return {
    width: info.width,
    height: info.height,
    channels: info.channels,
    data
  };
}

async function buildDHash(buffer: Buffer): Promise<string> {
  const { data, info } = await sharp(buffer)
    .greyscale()
    .resize({ width: 9, height: 8, fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let output = "";

  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const leftIndex = (y * info.width + x) * info.channels;
      const rightIndex = (y * info.width + x + 1) * info.channels;
      output += data[leftIndex] > data[rightIndex] ? "1" : "0";
    }
  }

  return output;
}

export async function analyzeImageBuffer(buffer: Buffer): Promise<ImageAnalysis> {
  const [image, perceptualHash] = await Promise.all([decodeImage(buffer), buildDHash(buffer)]);
  const { width, height, data, channels } = image;

  const totalPixels = width * height;
  let luminanceSum = 0;
  let luminanceSquaredSum = 0;
  let greenPixels = 0;
  let bluePixels = 0;
  let highlightPixels = 0;
  let shadowPixels = 0;
  let rgSum = 0;
  let ybSum = 0;
  let rgSquaredSum = 0;
  let ybSquaredSum = 0;
  const grayscale = new Float32Array(totalPixels);

  for (let pixelIndex = 0; pixelIndex < totalPixels; pixelIndex += 1) {
    const byteIndex = pixelIndex * channels;
    const red = data[byteIndex] ?? 0;
    const green = data[byteIndex + 1] ?? 0;
    const blue = data[byteIndex + 2] ?? 0;
    const luminance = computeLuminance(red, green, blue);

    grayscale[pixelIndex] = luminance;
    luminanceSum += luminance;
    luminanceSquaredSum += luminance * luminance;
    if (luminance >= 0.97) highlightPixels += 1;
    if (luminance <= 0.03) shadowPixels += 1;

    if (green > red * 1.15 && green > blue * 1.15) {
      greenPixels += 1;
    }
    if (blue > red * 1.1 && blue > green * 1.05) {
      bluePixels += 1;
    }

    const rg = Math.abs(red - green);
    const yb = Math.abs((red + green) * 0.5 - blue);
    rgSum += rg;
    ybSum += yb;
    rgSquaredSum += rg * rg;
    ybSquaredSum += yb * yb;
  }

  const brightness = luminanceSum / totalPixels;
  const contrast = Math.sqrt(Math.max(luminanceSquaredSum / totalPixels - brightness * brightness, 0));

  let edgeMagnitude = 0;
  let verticalImbalance = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const gx = grayscale[index + 1] - grayscale[index - 1];
      const gy = grayscale[index + width] - grayscale[index - width];
      edgeMagnitude += Math.abs(gx) + Math.abs(gy);

      if (x < width / 2) {
        verticalImbalance += Math.abs(gx);
      } else {
        verticalImbalance -= Math.abs(gx);
      }
    }
  }

  const sharpness = clamp(edgeMagnitude / Math.max(totalPixels, 1) * 1.2);
  const perspectiveRisk = clamp(Math.abs(verticalImbalance) / Math.max(edgeMagnitude, 1) * 3);
  const highlightClipping = highlightPixels / totalPixels;
  const shadowClipping = shadowPixels / totalPixels;
  const exposureBalance = clamp(1 - Math.abs(brightness - 0.62) / 0.32);
  const clippingBalance = clamp(1 - Math.min((highlightClipping + shadowClipping) * 5, 1));
  const aspectRatio = width / Math.max(height, 1);
  const landscapeBonus = clamp(aspectRatio >= 1 ? 0.4 + Math.min((aspectRatio - 1) / 0.8, 0.6) : aspectRatio * 0.35);
  const greenRatio = greenPixels / totalPixels;
  const blueRatio = bluePixels / totalPixels;
  const rgMean = rgSum / totalPixels;
  const ybMean = ybSum / totalPixels;
  const rgStd = Math.sqrt(Math.max(rgSquaredSum / totalPixels - rgMean * rgMean, 0));
  const ybStd = Math.sqrt(Math.max(ybSquaredSum / totalPixels - ybMean * ybMean, 0));
  const colorfulness = clamp((Math.sqrt(rgStd * rgStd + ybStd * ybStd) + 0.3 * Math.sqrt(rgMean * rgMean + ybMean * ybMean)) / 180);
  const dominantHue = greenRatio > 0.25 ? "green" : blueRatio > 0.2 ? "blue" : "neutral";

  return {
    width,
    height,
    brightness: clamp(brightness),
    contrast: clamp(contrast * 2.5),
    sharpness,
    perspectiveRisk,
    landscapeBonus,
    exposureBalance,
    highlightClipping: clamp(highlightClipping),
    shadowClipping: clamp(shadowClipping),
    clippingBalance,
    colorfulness,
    dominantHue,
    perceptualHash
  };
}
