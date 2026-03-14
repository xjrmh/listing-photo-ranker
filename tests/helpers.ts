import { Jimp } from "jimp";
import type { GalleryFeedback, PhotoCriteria, PhotoImprovementAction } from "@listing-photo-ranker/core";

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

export function createTestPhotoCriteria(overrides: Partial<PhotoCriteria> = {}): PhotoCriteria {
  return {
    lighting_exposure: overrides.lighting_exposure ?? 0.82,
    sharpness_clarity: overrides.sharpness_clarity ?? 0.84,
    perspective_straightness: overrides.perspective_straightness ?? 0.8,
    composition_framing: overrides.composition_framing ?? 0.79,
    space_representation: overrides.space_representation ?? 0.81,
    declutter_staging: overrides.declutter_staging ?? 0.78,
    feature_highlighting: overrides.feature_highlighting ?? 0.8,
    hero_potential: overrides.hero_potential ?? 0.83
  };
}

export function createTestImprovementActions(overrides: Partial<PhotoImprovementAction>[] = []): PhotoImprovementAction[] {
  if (overrides.length === 0) {
    return [];
  }

  return overrides.map((override) => ({
    issue: override.issue ?? "low_contrast",
    priority: override.priority ?? "medium",
    action: override.action ?? "Open blinds and rebalance the light before retaking this angle."
  }));
}

export function createTestGalleryFeedback(overrides: Partial<GalleryFeedback> = {}): GalleryFeedback {
  return {
    summary: overrides.summary ?? "The gallery has a usable lead image and a short action list for improvement.",
    strengths: overrides.strengths ?? ["Front exterior coverage reads clearly."],
    weaknesses: overrides.weaknesses ?? ["A few images could use cleaner composition."],
    actionable_items: overrides.actionable_items ?? []
  };
}
