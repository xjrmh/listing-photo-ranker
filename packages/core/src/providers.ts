import type { AssetRecord, RankingMethod } from "./schemas";
import { clamp, unique } from "./utils";
import { analyzeImageBuffer } from "./image-analysis";
import { describeViewType, normalizeViewTags, normalizeViewType, type ViewType } from "./view-types";

export type ProviderAssetInput = {
  asset: AssetRecord;
  bytes: Buffer;
};

export type ProviderAssessment = {
  assetId: string;
  fileName: string;
  method: RankingMethod;
  providerName: string;
  modelVersion: string;
  overallScore: number;
  heroScore: number;
  technicalQualityScore: number;
  predictedViewType: ViewType;
  viewTags: string[];
  sceneConfidence: number;
  issues: Array<
    | "underexposed"
    | "overexposed"
    | "blurry"
    | "possible_perspective_distortion"
    | "low_contrast"
    | "duplicate_candidate"
  >;
  confidence: number;
  rationale: string;
  perceptualHash: string;
};

export interface RankingProvider {
  readonly providerName: string;
  readonly modelVersion: string;
  analyze(assets: ProviderAssetInput[]): Promise<ProviderAssessment[]>;
}

const HERO_PREFERENCE: Partial<Record<ViewType, number>> = {
  front_exterior: 0.25,
  rear_exterior: 0.18,
  street_view: 0.07,
  living_room: 0.14,
  family_room: 0.12,
  kitchen: 0.16,
  dining_room: 0.08,
  primary_bedroom: 0.09,
  bedroom: 0.04,
  bathroom: 0.02,
  garden: 0.08,
  yard: 0.08,
  patio_deck: 0.08,
  pool: 0.18,
  view: 0.2,
  amenity: 0.07,
  community: 0.06,
  floorplan: -0.1,
  garage: -0.08,
  laundry: -0.12,
  office: 0.03,
  other: -0.04
};

const TAG_PATTERNS: Array<{ pattern: RegExp; tag: string }> = [
  { pattern: /\b(aerial|drone)\b/, tag: "aerial" },
  { pattern: /\b(staged|staging)\b/, tag: "staged" },
  { pattern: /\b(fireplace)\b/, tag: "fireplace" },
  { pattern: /\b(vaulted)\b/, tag: "vaulted_ceiling" },
  { pattern: /\b(island)\b/, tag: "kitchen_island" },
  { pattern: /\b(twilight)\b/, tag: "twilight" },
  { pattern: /\b(view|skyline|waterfront|ocean|mountain|city)\b/, tag: "scenic_view" },
  { pattern: /\b(pool|spa)\b/, tag: "outdoor_luxury" },
  { pattern: /\b(garden|yard|lawn)\b/, tag: "greenery" },
  { pattern: /\b(amenity|clubhouse|gym|fitness|lobby)\b/, tag: "amenity" }
];

function inferViewFromFileName(fileName: string): { viewType: ViewType; tags: string[]; confidence: number } {
  const normalizedName = fileName.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const tags = TAG_PATTERNS.filter((entry) => entry.pattern.test(normalizedName)).map((entry) => entry.tag);
  const viewType = normalizeViewType(normalizedName, tags);
  const exactLabel = viewType !== "other" && normalizedName.includes(viewType.replace(/_/g, " "));
  return {
    viewType,
    tags,
    confidence: viewType === "other" ? 0.28 : exactLabel ? 0.92 : 0.78
  };
}

function inferViewFromSignals(input: {
  inferredViewType: ViewType;
  inferredConfidence: number;
  hue: "green" | "blue" | "neutral";
  landscapeBonus: number;
  colorfulness: number;
}): { viewType: ViewType; confidence: number } {
  if (input.inferredViewType !== "other") {
    return {
      viewType: input.inferredViewType,
      confidence: input.inferredConfidence
    };
  }

  if (input.hue === "green" && input.landscapeBonus > 0.55) {
    return {
      viewType: input.colorfulness > 0.42 ? "yard" : "garden",
      confidence: 0.5
    };
  }

  if (input.hue === "blue") {
    return {
      viewType: input.landscapeBonus > 0.65 ? "view" : "pool",
      confidence: 0.48
    };
  }

  return {
    viewType: "other",
    confidence: 0.25
  };
}

function buildIssues(input: {
  brightness: number;
  contrast: number;
  sharpness: number;
  perspectiveRisk: number;
  highlightClipping: number;
  shadowClipping: number;
}): ProviderAssessment["issues"] {
  const issues: ProviderAssessment["issues"] = [];
  if (input.brightness < 0.32 || input.shadowClipping > 0.12) issues.push("underexposed");
  if (input.brightness > 0.9 || input.highlightClipping > 0.08) issues.push("overexposed");
  if (input.contrast < 0.12) issues.push("low_contrast");
  if (input.sharpness < 0.2) issues.push("blurry");
  if (input.perspectiveRisk > 0.45) issues.push("possible_perspective_distortion");
  return issues;
}

function createRationale(viewType: ViewType, quality: number, heroScore: number, issues: string[], tone: "editorial" | "technical"): string {
  const viewLabel = describeViewType(viewType);
  const qualitySentence =
    quality >= 0.75
      ? "The image reads cleanly and should hold attention well."
      : quality >= 0.55
        ? "The image is usable but has some technical or merchandising limitations."
        : "The image is likely to underperform because of weak technical quality or composition.";

  const heroSentence =
    heroScore >= 0.8
      ? `It is a strong hero candidate for the opening position because ${viewLabel} shots usually anchor the gallery well.`
      : heroScore >= 0.6
        ? `It can support the early gallery sequence as a ${viewLabel} photo.`
        : `It fits better deeper in the sequence than as a lead image.`;

  const issueSentence = issues.length > 0 ? `Flagged issues: ${issues.join(", ")}.` : "No major technical issues were detected.";

  if (tone === "technical") {
    return `${qualitySentence} ${issueSentence} Predicted scene type: ${viewLabel}.`;
  }

  return `${heroSentence} ${qualitySentence} ${issueSentence}`;
}

abstract class BaseHeuristicProvider implements RankingProvider {
  abstract readonly providerName: string;
  abstract readonly modelVersion: string;
  protected abstract readonly method: RankingMethod;
  protected abstract computeScores(input: {
    viewType: ViewType;
    qualityScore: number;
    sceneConfidence: number;
    brightness: number;
    contrast: number;
    sharpness: number;
    issues: string[];
  }): { overallScore: number; heroScore: number; confidence: number };

  async analyze(assets: ProviderAssetInput[]): Promise<ProviderAssessment[]> {
    const assessments: ProviderAssessment[] = [];

    for (const input of assets) {
      const image = await analyzeImageBuffer(input.bytes);
      const inferredFromName = inferViewFromFileName(input.asset.file_name);
      const inferredView = inferViewFromSignals({
        inferredViewType: inferredFromName.viewType,
        inferredConfidence: inferredFromName.confidence,
        hue: image.dominantHue,
        landscapeBonus: image.landscapeBonus,
        colorfulness: image.colorfulness
      });
      const predictedViewType = inferredView.viewType;
      const viewTags = normalizeViewTags([
        ...inferredFromName.tags,
        image.dominantHue === "green" ? "greenery" : "",
        image.dominantHue === "blue" ? "blue_tones" : "",
        image.width > image.height * 1.45 ? "wide_angle" : "",
        image.height > image.width ? "portrait_orientation" : ""
      ]);

      const issues = buildIssues({
        brightness: image.brightness,
        contrast: image.contrast,
        sharpness: image.sharpness,
        perspectiveRisk: image.perspectiveRisk,
        highlightClipping: image.highlightClipping,
        shadowClipping: image.shadowClipping
      });
      const qualityScore = clamp(
        image.sharpness * 0.25 +
          image.exposureBalance * 0.2 +
          image.contrast * 0.15 +
          (1 - image.perspectiveRisk) * 0.15 +
          image.landscapeBonus * 0.1 +
          image.clippingBalance * 0.1 +
          image.colorfulness * 0.05
      );

      const scores = this.computeScores({
        viewType: predictedViewType,
        qualityScore,
        sceneConfidence: inferredView.confidence,
        brightness: image.brightness,
        contrast: image.contrast,
        sharpness: image.sharpness,
        issues
      });

      assessments.push({
        assetId: input.asset.asset_id,
        fileName: input.asset.file_name,
        method: this.method,
        providerName: this.providerName,
        modelVersion: this.modelVersion,
        overallScore: scores.overallScore,
        heroScore: scores.heroScore,
        technicalQualityScore: qualityScore,
        predictedViewType,
        viewTags,
        sceneConfidence: inferredView.confidence,
        issues,
        confidence: scores.confidence,
        rationale: createRationale(predictedViewType, qualityScore, scores.heroScore, issues, this.method === "llm_judge" ? "editorial" : "technical"),
        perceptualHash: image.perceptualHash
      });
    }

    return assessments;
  }
}

export class HeuristicCvProvider extends BaseHeuristicProvider {
  readonly providerName = "heuristic-cv";
  readonly modelVersion = "cv-v1";
  protected readonly method: RankingMethod = "cv";

  protected computeScores(input: {
    viewType: ViewType;
    qualityScore: number;
    sceneConfidence: number;
    brightness: number;
    contrast: number;
    sharpness: number;
    issues: string[];
  }): { overallScore: number; heroScore: number; confidence: number } {
    const viewBonus = (HERO_PREFERENCE[input.viewType] ?? 0) * (0.3 + input.sceneConfidence * 0.7);
    const heroScore = clamp(input.qualityScore * 0.55 + 0.25 + viewBonus);
    const overallScore = clamp(input.qualityScore * 0.62 + heroScore * 0.23 + Math.max(viewBonus, -0.03) * 0.45);
    const confidence = clamp(0.45 + input.sceneConfidence * 0.25 + input.contrast * 0.12 + input.sharpness * 0.12 - input.issues.length * 0.04);
    return { overallScore, heroScore, confidence };
  }
}

export class HeuristicLlmJudgeProvider extends BaseHeuristicProvider {
  readonly providerName: string;
  readonly modelVersion: string;
  protected readonly method: RankingMethod = "llm_judge";

  constructor(options?: { providerName?: string; modelVersion?: string }) {
    super();
    this.providerName = options?.providerName ?? "heuristic-llm-judge";
    this.modelVersion = options?.modelVersion ?? "gpt-5.4";
  }

  protected computeScores(input: {
    viewType: ViewType;
    qualityScore: number;
    sceneConfidence: number;
    brightness: number;
    contrast: number;
    sharpness: number;
    issues: string[];
  }): { overallScore: number; heroScore: number; confidence: number } {
    const viewBonus = (HERO_PREFERENCE[input.viewType] ?? 0) * (0.25 + input.sceneConfidence * 0.75);
    const storytellingLift =
      input.viewType === "front_exterior" || input.viewType === "kitchen" || input.viewType === "living_room" || input.viewType === "view"
        ? 0.08 * (0.6 + input.sceneConfidence * 0.4)
        : 0;
    const heroScore = clamp(input.qualityScore * 0.48 + 0.28 + viewBonus + storytellingLift);
    const overallScore = clamp(input.qualityScore * 0.5 + heroScore * 0.28 + storytellingLift + Math.max(viewBonus, -0.02) * 0.35);
    const confidence = clamp(0.5 + input.sceneConfidence * 0.22 + input.sharpness * 0.1 + storytellingLift - input.issues.length * 0.03);
    return { overallScore, heroScore, confidence };
  }
}

export function addDuplicateIssue(assessments: ProviderAssessment[], duplicateGroups: string[][]): ProviderAssessment[] {
  const duplicateIds = new Set(duplicateGroups.flat());
  return assessments.map((assessment) => ({
    ...assessment,
    issues: duplicateIds.has(assessment.assetId) ? unique([...assessment.issues, "duplicate_candidate"]) : assessment.issues
  }));
}
