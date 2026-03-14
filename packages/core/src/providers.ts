import sharp from "sharp";
import { z } from "zod";

import { analyzeImageBuffer, type ImageAnalysis } from "./image-analysis";
import type { AssetRecord, ListingContext, RankingMethod } from "./schemas";
import {
  ActionPrioritySchema,
  GalleryFeedbackSchema,
  IssueSchema,
  PhotoCriteriaSchema,
  PhotoImprovementActionSchema,
  type GalleryFeedback,
  type Issue,
  type PhotoCriteria,
  type PhotoImprovementAction
} from "./schemas";
import { clamp, unique } from "./utils";
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
  criteria: PhotoCriteria;
  sceneConfidence: number;
  issues: Issue[];
  improvementActions: PhotoImprovementAction[];
  confidence: number;
  rationale: string;
  perceptualHash: string;
};

export type ProviderAnalysisResult = {
  assessments: ProviderAssessment[];
  galleryFeedback?: GalleryFeedback;
};

export interface RankingProvider {
  readonly providerName: string;
  readonly modelVersion: string;
  analyze(assets: ProviderAssetInput[], context: { listingContext: ListingContext }): Promise<ProviderAnalysisResult>;
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

const OPENAI_IMAGE_MAX_DIMENSION = 1600;
const OPENAI_IMAGE_QUALITY = 75;
const OPENAI_MAX_PARSE_ATTEMPTS = 2;

const ISSUE_NORMALIZATION_MAP: Record<string, Issue> = {
  underexposed: "underexposed",
  dark: "underexposed",
  too_dark: "underexposed",
  overexposed: "overexposed",
  blown_highlights: "overexposed",
  blown_windows: "overexposed",
  blurry: "blurry",
  blur: "blurry",
  soft_focus: "blurry",
  possible_perspective_distortion: "possible_perspective_distortion",
  perspective_distortion: "possible_perspective_distortion",
  tilted_verticals: "possible_perspective_distortion",
  wide_angle_distortion: "possible_perspective_distortion",
  low_contrast: "low_contrast",
  flat_lighting: "low_contrast",
  duplicate_candidate: "duplicate_candidate",
  duplicate: "duplicate_candidate",
  cropped_room_or_feature: "cropped_room_or_feature",
  cropped_feature: "cropped_room_or_feature",
  cropped_room: "cropped_room_or_feature",
  clutter_or_personal_items: "clutter_or_personal_items",
  clutter: "clutter_or_personal_items",
  personal_items: "clutter_or_personal_items",
  mirror_or_reflection_distraction: "mirror_or_reflection_distraction",
  reflection: "mirror_or_reflection_distraction",
  mirror: "mirror_or_reflection_distraction",
  screen_or_ceiling_fan_distraction: "screen_or_ceiling_fan_distraction",
  tv: "screen_or_ceiling_fan_distraction",
  tv_or_ceiling_fan: "screen_or_ceiling_fan_distraction",
  screen_distraction: "screen_or_ceiling_fan_distraction",
  bathroom_prep_issue: "bathroom_prep_issue",
  toilet_seat_up: "bathroom_prep_issue",
  bathroom_clutter: "bathroom_prep_issue",
  people_or_pets: "people_or_pets",
  people: "people_or_pets",
  pets: "people_or_pets",
  watermark_or_text_overlay: "watermark_or_text_overlay",
  text_overlay: "watermark_or_text_overlay",
  watermark: "watermark_or_text_overlay",
  overedited: "overedited",
  over_processed: "overedited",
  oversaturated: "overedited",
  hdr_artifacts: "overedited",
  redundant_angle: "redundant_angle",
  redundant: "redundant_angle"
};

const ISSUE_PRIORITIES: Record<Issue, z.infer<typeof ActionPrioritySchema>> = {
  underexposed: "high",
  overexposed: "high",
  blurry: "high",
  possible_perspective_distortion: "high",
  low_contrast: "medium",
  duplicate_candidate: "medium",
  cropped_room_or_feature: "high",
  clutter_or_personal_items: "high",
  mirror_or_reflection_distraction: "medium",
  screen_or_ceiling_fan_distraction: "medium",
  bathroom_prep_issue: "medium",
  people_or_pets: "high",
  watermark_or_text_overlay: "high",
  overedited: "medium",
  redundant_angle: "medium"
};

const ISSUE_ACTIONS: Record<Issue, string> = {
  underexposed: "Retake with blinds open, lights on, and a brighter exposure that still preserves window detail.",
  overexposed: "Retake with a darker exposure or bracketed HDR that keeps the room bright without blown windows.",
  blurry: "Retake from a stable position with better light and a sharper focal point before moving to the next room.",
  possible_perspective_distortion: "Retake from chest height with the camera kept level so walls and door frames stay straight.",
  low_contrast: "Retake in cleaner daylight and adjust lighting so the room has more shape and separation.",
  duplicate_candidate: "Keep only the strongest angle and replace the rest with a materially different room view.",
  cropped_room_or_feature: "Retake from a doorway or corner so the full room or selling feature reads in one frame.",
  clutter_or_personal_items: "Clear counters, cords, bins, and personal items before retaking this angle.",
  mirror_or_reflection_distraction: "Change the angle or step aside so mirrors and reflective surfaces do not show the photographer.",
  screen_or_ceiling_fan_distraction: "Turn off TVs and ceiling fans before retaking so the room feels calmer and less busy.",
  bathroom_prep_issue: "Close toilet lids, remove toiletries, and simplify the vanity before retaking this bathroom shot.",
  people_or_pets: "Retake after removing people and pets so the listing feels clean and compliant.",
  watermark_or_text_overlay: "Use the original image without logos, watermarks, or text overlays.",
  overedited: "Dial back HDR, saturation, and sharpening so finishes look realistic instead of processed.",
  redundant_angle: "Replace this angle with a clearly different room view, perspective, or feature shot."
};

type LocalAssetAnalysis = {
  asset: AssetRecord;
  bytes: Buffer;
  image: ImageAnalysis;
};

type OpenAiResponsesRequest = {
  model: string;
  input: Array<{
    role: "user";
    content: Array<
      | { type: "input_text"; text: string }
      | { type: "input_image"; image_url: string; detail: "low" | "high" | "auto" }
    >;
  }>;
  text: {
    format: {
      type: "json_schema";
      name: string;
      strict: boolean;
      schema: Record<string, unknown>;
    };
  };
};

type OpenAiResponsesResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

export interface OpenAiResponsesClient {
  createResponse(request: OpenAiResponsesRequest): Promise<OpenAiResponsesResponse>;
}

type LlmPhotoResult = {
  asset_id: string;
  predicted_view_type: string;
  view_tags: string[];
  scene_confidence: number;
  overall_score: number;
  hero_score: number;
  technical_quality_score: number;
  criteria: PhotoCriteria;
  issues: string[];
  improvement_actions: Array<{
    issue: string;
    priority: z.infer<typeof ActionPrioritySchema>;
    action: string;
  }>;
  rationale: string;
};

type LlmGalleryFeedback = {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  actionable_items: Array<{
    title: string;
    priority: z.infer<typeof ActionPrioritySchema>;
    why: string;
    how_to_fix: string;
    affected_image_ids: string[];
  }>;
};

type LlmJudgeOutput = {
  photos: LlmPhotoResult[];
  gallery_feedback: LlmGalleryFeedback;
};

const LLM_JUDGE_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["photos", "gallery_feedback"],
  properties: {
    photos: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "asset_id",
          "predicted_view_type",
          "view_tags",
          "scene_confidence",
          "overall_score",
          "hero_score",
          "technical_quality_score",
          "criteria",
          "issues",
          "improvement_actions",
          "rationale"
        ],
        properties: {
          asset_id: { type: "string" },
          predicted_view_type: { type: "string" },
          view_tags: { type: "array", items: { type: "string" }, maxItems: 5 },
          scene_confidence: { type: "number", minimum: 0, maximum: 1 },
          overall_score: { type: "number", minimum: 0, maximum: 1 },
          hero_score: { type: "number", minimum: 0, maximum: 1 },
          technical_quality_score: { type: "number", minimum: 0, maximum: 1 },
          criteria: {
            type: "object",
            additionalProperties: false,
            required: [
              "lighting_exposure",
              "sharpness_clarity",
              "perspective_straightness",
              "composition_framing",
              "space_representation",
              "declutter_staging",
              "feature_highlighting",
              "hero_potential"
            ],
            properties: {
              lighting_exposure: { type: "number", minimum: 0, maximum: 1 },
              sharpness_clarity: { type: "number", minimum: 0, maximum: 1 },
              perspective_straightness: { type: "number", minimum: 0, maximum: 1 },
              composition_framing: { type: "number", minimum: 0, maximum: 1 },
              space_representation: { type: "number", minimum: 0, maximum: 1 },
              declutter_staging: { type: "number", minimum: 0, maximum: 1 },
              feature_highlighting: { type: "number", minimum: 0, maximum: 1 },
              hero_potential: { type: "number", minimum: 0, maximum: 1 }
            }
          },
          issues: { type: "array", items: { type: "string" }, maxItems: 10 },
          improvement_actions: {
            type: "array",
            maxItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["issue", "priority", "action"],
              properties: {
                issue: { type: "string" },
                priority: { type: "string", enum: ["high", "medium", "low"] },
                action: { type: "string" }
              }
            }
          },
          rationale: { type: "string" }
        }
      }
    },
    gallery_feedback: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "strengths", "weaknesses", "actionable_items"],
      properties: {
        summary: { type: "string" },
        strengths: { type: "array", items: { type: "string" }, maxItems: 6 },
        weaknesses: { type: "array", items: { type: "string" }, maxItems: 6 },
        actionable_items: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "priority", "why", "how_to_fix", "affected_image_ids"],
            properties: {
              title: { type: "string" },
              priority: { type: "string", enum: ["high", "medium", "low"] },
              why: { type: "string" },
              how_to_fix: { type: "string" },
              affected_image_ids: { type: "array", items: { type: "string" }, maxItems: 50 }
            }
          }
        }
      }
    }
  }
};

const LLM_JUDGE_PROMPT = [
  "You are an editorial real-estate photo judge scoring residential listing photos for sale listings.",
  "Evaluate only what is visible in the images. Do not infer features that are not shown.",
  "Good listing photos are bright, sharp, level, spacious, decluttered, and honest. They should highlight selling features, avoid heavy distortion, and feel ready for a real-estate gallery.",
  "Common problems to flag include dark exposure, blown highlights, blur, tilted verticals, wide-angle distortion, cropped rooms, clutter, mirrors or reflections, TVs or ceiling fans drawing attention, bathroom prep issues, people or pets, watermarks or text, over-editing, and redundant angles.",
  "Rate each image on these criteria from 0 to 1: lighting_exposure, sharpness_clarity, perspective_straightness, composition_framing, space_representation, declutter_staging, feature_highlighting, hero_potential.",
  "Return normalized issue names using the provided schema. Prefer direct, actionable coaching that tells the photographer what to change on the retake.",
  "Keep rationales concise. Action items should be specific enough to use on the next shoot."
].join("\n");

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

function buildTechnicalIssues(input: {
  brightness: number;
  contrast: number;
  sharpness: number;
  perspectiveRisk: number;
  highlightClipping: number;
  shadowClipping: number;
}): Issue[] {
  const issues: Issue[] = [];
  if (input.brightness < 0.32 || input.shadowClipping > 0.12) issues.push("underexposed");
  if (input.brightness > 0.9 || input.highlightClipping > 0.08) issues.push("overexposed");
  if (input.contrast < 0.12) issues.push("low_contrast");
  if (input.sharpness < 0.2) issues.push("blurry");
  if (input.perspectiveRisk > 0.45) issues.push("possible_perspective_distortion");
  return issues;
}

function createRationale(viewType: ViewType, quality: number, heroScore: number, issues: Issue[], tone: "editorial" | "technical"): string {
  const viewLabel = describeViewType(viewType);
  const qualitySentence =
    quality >= 0.75
      ? "The image reads cleanly and should hold attention well."
      : quality >= 0.55
        ? "The image is usable but has some technical or merchandising limitations."
        : "The image is likely to underperform because of weak technical quality or composition.";

  const heroSentence =
    heroScore >= 0.8
      ? `It is a strong hero candidate because ${viewLabel} shots usually anchor the gallery well.`
      : heroScore >= 0.6
        ? `It can support the early gallery sequence as a ${viewLabel} photo.`
        : "It fits better deeper in the sequence than as a lead image.";

  const issueSentence = issues.length > 0 ? `Flagged issues: ${issues.join(", ")}.` : "No major technical issues were detected.";

  if (tone === "technical") {
    return `${qualitySentence} ${issueSentence} Predicted scene type: ${viewLabel}.`;
  }

  return `${heroSentence} ${qualitySentence} ${issueSentence}`;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function buildLocalCriteria(image: ImageAnalysis, heroPotential: number, featureHighlighting: number, declutterStaging: number): PhotoCriteria {
  return PhotoCriteriaSchema.parse({
    lighting_exposure: clamp(image.exposureBalance * 0.75 + image.clippingBalance * 0.25),
    sharpness_clarity: clamp(image.sharpness),
    perspective_straightness: clamp(1 - image.perspectiveRisk),
    composition_framing: clamp(image.landscapeBonus * 0.58 + image.contrast * 0.2 + image.clippingBalance * 0.12 + image.colorfulness * 0.1),
    space_representation: clamp(image.landscapeBonus * 0.72 + (1 - image.perspectiveRisk) * 0.28),
    declutter_staging: clamp(declutterStaging),
    feature_highlighting: clamp(featureHighlighting),
    hero_potential: clamp(heroPotential)
  });
}

function clampCriteriaWithLocalSignals(criteria: PhotoCriteria, image: ImageAnalysis): PhotoCriteria {
  const local = buildLocalCriteria(image, criteria.hero_potential, criteria.feature_highlighting, criteria.declutter_staging);
  return PhotoCriteriaSchema.parse({
    lighting_exposure: Math.min(criteria.lighting_exposure, clamp(local.lighting_exposure + 0.12)),
    sharpness_clarity: Math.min(criteria.sharpness_clarity, clamp(local.sharpness_clarity + 0.08)),
    perspective_straightness: Math.min(criteria.perspective_straightness, clamp(local.perspective_straightness + 0.1)),
    composition_framing: criteria.composition_framing,
    space_representation: criteria.space_representation,
    declutter_staging: criteria.declutter_staging,
    feature_highlighting: criteria.feature_highlighting,
    hero_potential: criteria.hero_potential
  });
}

function normalizeIssue(raw: string): Issue | null {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return ISSUE_NORMALIZATION_MAP[normalized] ?? (IssueSchema.safeParse(normalized).success ? (normalized as Issue) : null);
}

function normalizeIssues(rawIssues: string[]): Issue[] {
  return unique(
    rawIssues
      .map((issue) => normalizeIssue(issue))
      .filter((issue): issue is Issue => Boolean(issue))
  );
}

function issueAction(issue: Issue): PhotoImprovementAction {
  return PhotoImprovementActionSchema.parse({
    issue,
    priority: ISSUE_PRIORITIES[issue],
    action: ISSUE_ACTIONS[issue]
  });
}

function buildImprovementActions(issues: Issue[], rawActions?: Array<{ issue: string; priority: z.infer<typeof ActionPrioritySchema>; action: string }>): PhotoImprovementAction[] {
  const normalizedActions = (rawActions ?? [])
    .map((item) => {
      const issue = normalizeIssue(item.issue);
      if (!issue) {
        return null;
      }
      return PhotoImprovementActionSchema.parse({
        issue,
        priority: ActionPrioritySchema.parse(item.priority),
        action: item.action.trim().slice(0, 240)
      });
    })
    .filter((item): item is PhotoImprovementAction => Boolean(item));

  const issuesWithActions = new Set(normalizedActions.map((action) => action.issue));
  const fallbackActions = issues.filter((issue) => !issuesWithActions.has(issue)).map(issueAction);
  return [...normalizedActions, ...fallbackActions].slice(0, 3);
}

function featureHighlightingScore(viewType: ViewType, sceneConfidence: number): number {
  const boost = HERO_PREFERENCE[viewType] ?? 0;
  return clamp(0.44 + Math.max(boost, 0) * 0.9 + sceneConfidence * 0.2);
}

function defaultDeclutterScore(issues: Issue[]): number {
  if (issues.includes("clutter_or_personal_items") || issues.includes("bathroom_prep_issue")) {
    return 0.28;
  }
  if (issues.includes("screen_or_ceiling_fan_distraction") || issues.includes("mirror_or_reflection_distraction")) {
    return 0.42;
  }
  return 0.68;
}

function buildHeuristicCriteria(viewType: ViewType, image: ImageAnalysis, sceneConfidence: number, issues: Issue[], heroScore: number): PhotoCriteria {
  return buildLocalCriteria(
    image,
    heroScore,
    featureHighlightingScore(viewType, sceneConfidence),
    defaultDeclutterScore(issues)
  );
}

function defaultConfidence(sceneConfidence: number, issues: Issue[], sharpness: number, contrast: number, extraLift = 0): number {
  return clamp(0.45 + sceneConfidence * 0.22 + sharpness * 0.12 + contrast * 0.08 + extraLift - issues.length * 0.03);
}

function summarizeGalleryFromAssessments(assessments: ProviderAssessment[]): GalleryFeedback {
  const strongest = [...assessments]
    .sort((left, right) => right.overallScore - left.overallScore)
    .slice(0, 3)
    .map((assessment) => `${describeViewType(assessment.predictedViewType)} coverage is carrying the gallery`);
  const weaknesses = unique(
    assessments
      .flatMap((assessment) => assessment.issues)
      .filter((issue) => issue !== "duplicate_candidate")
      .slice(0, 4)
      .map((issue) => issue.replace(/_/g, " "))
  );

  return GalleryFeedbackSchema.parse({
    summary: "The gallery has baseline scoring data, but the strongest coaching will come after ordering and coverage checks.",
    strengths: strongest.length > 0 ? strongest : ["At least one viable lead image is available."],
    weaknesses: weaknesses.length > 0 ? weaknesses : ["No obvious gallery-wide weaknesses were detected."],
    actionable_items: []
  });
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
    issues: Issue[];
  }): { overallScore: number; heroScore: number; confidence: number };

  async analyze(assets: ProviderAssetInput[], _context: { listingContext: ListingContext }): Promise<ProviderAnalysisResult> {
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

      const issues = buildTechnicalIssues({
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
      const criteria = buildHeuristicCriteria(predictedViewType, image, inferredView.confidence, issues, scores.heroScore);

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
        criteria,
        sceneConfidence: inferredView.confidence,
        issues,
        improvementActions: buildImprovementActions(issues),
        confidence: scores.confidence,
        rationale: createRationale(predictedViewType, qualityScore, scores.heroScore, issues, this.method === "llm_judge" ? "editorial" : "technical"),
        perceptualHash: image.perceptualHash
      });
    }

    return {
      assessments,
      galleryFeedback: summarizeGalleryFromAssessments(assessments)
    };
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
    issues: Issue[];
  }): { overallScore: number; heroScore: number; confidence: number } {
    const viewBonus = (HERO_PREFERENCE[input.viewType] ?? 0) * (0.3 + input.sceneConfidence * 0.7);
    const heroScore = clamp(input.qualityScore * 0.55 + 0.25 + viewBonus);
    const overallScore = clamp(input.qualityScore * 0.62 + heroScore * 0.23 + Math.max(viewBonus, -0.03) * 0.45);
    const confidence = defaultConfidence(input.sceneConfidence, input.issues, input.sharpness, input.contrast);
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
    issues: Issue[];
  }): { overallScore: number; heroScore: number; confidence: number } {
    const viewBonus = (HERO_PREFERENCE[input.viewType] ?? 0) * (0.25 + input.sceneConfidence * 0.75);
    const storytellingLift =
      input.viewType === "front_exterior" || input.viewType === "kitchen" || input.viewType === "living_room" || input.viewType === "view"
        ? 0.08 * (0.6 + input.sceneConfidence * 0.4)
        : 0;
    const heroScore = clamp(input.qualityScore * 0.48 + 0.28 + viewBonus + storytellingLift);
    const overallScore = clamp(input.qualityScore * 0.5 + heroScore * 0.28 + storytellingLift + Math.max(viewBonus, -0.02) * 0.35);
    const confidence = defaultConfidence(input.sceneConfidence, input.issues, input.sharpness, input.contrast, storytellingLift);
    return { overallScore, heroScore, confidence };
  }
}

class DefaultOpenAiResponsesClient implements OpenAiResponsesClient {
  constructor(private readonly apiKey?: string, private readonly endpoint = "https://api.openai.com/v1/responses") {}

  async createResponse(request: OpenAiResponsesRequest): Promise<OpenAiResponsesResponse> {
    if (!this.apiKey) {
      throw new Error("API_KEY is required when LLM_JUDGE_PROVIDER=openai.");
    }

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      let message = `OpenAI request failed with status ${response.status}.`;
      try {
        const payload = (await response.json()) as { error?: { message?: string } };
        if (payload.error?.message) {
          message = payload.error.message;
        }
      } catch {
        // Ignore JSON parse failures and use the status-based message.
      }
      throw new Error(message);
    }

    return (await response.json()) as OpenAiResponsesResponse;
  }
}

function extractOutputText(response: OpenAiResponsesResponse): string | null {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const parts = response.output
    ?.flatMap((output) => output.content ?? [])
    .map((content) => content.text?.trim() ?? "")
    .filter(Boolean);

  if (parts && parts.length > 0) {
    return parts.join("\n");
  }

  return null;
}

async function preprocessImageForOpenAi(buffer: Buffer): Promise<string> {
  const output = await sharp(buffer)
    .rotate()
    .resize({
      width: OPENAI_IMAGE_MAX_DIMENSION,
      height: OPENAI_IMAGE_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true
    })
    .jpeg({ quality: OPENAI_IMAGE_QUALITY, mozjpeg: true })
    .toBuffer();

  return `data:image/jpeg;base64,${output.toString("base64")}`;
}

function buildOpenAiRequest(assets: Array<LocalAssetAnalysis & { imageUrl: string }>, listingContext: ListingContext, modelVersion: string): OpenAiResponsesRequest {
  return {
    model: modelVersion,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              LLM_JUDGE_PROMPT,
              `Property type: ${listingContext.property_type}. Listing intent: ${listingContext.listing_intent}.`,
              "Return one result for every asset_id exactly once."
            ].join("\n")
          },
          ...assets.flatMap((asset) => [
            {
              type: "input_text" as const,
              text: `Asset ${asset.asset.asset_id}. Original filename: ${asset.asset.file_name}. Evaluate this exact image.`
            },
            {
              type: "input_image" as const,
              image_url: asset.imageUrl,
              detail: "low" as const
            }
          ])
        ]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "listing_photo_gallery_judgment",
        strict: true,
        schema: LLM_JUDGE_OUTPUT_SCHEMA
      }
    }
  };
}

function parseLlmJudgeOutput(rawText: string): LlmJudgeOutput {
  const parsed = JSON.parse(rawText) as LlmJudgeOutput;
  return {
    photos: parsed.photos.map((photo) => ({
      ...photo,
      criteria: PhotoCriteriaSchema.parse(photo.criteria),
      issues: photo.issues,
      improvement_actions: photo.improvement_actions.map((action) => ({
        issue: action.issue,
        priority: ActionPrioritySchema.parse(action.priority),
        action: action.action
      }))
    })),
    gallery_feedback: {
      summary: parsed.gallery_feedback.summary,
      strengths: parsed.gallery_feedback.strengths,
      weaknesses: parsed.gallery_feedback.weaknesses,
      actionable_items: parsed.gallery_feedback.actionable_items.map((item) => ({
        title: item.title,
        priority: ActionPrioritySchema.parse(item.priority),
        why: item.why,
        how_to_fix: item.how_to_fix,
        affected_image_ids: item.affected_image_ids
      }))
    }
  };
}

function ensureCompletePhotoCoverage(inputAssets: ProviderAssetInput[], photos: LlmPhotoResult[]): Map<string, LlmPhotoResult> {
  const byAssetId = new Map(photos.map((photo) => [photo.asset_id, photo]));
  for (const asset of inputAssets) {
    if (!byAssetId.has(asset.asset.asset_id)) {
      throw new Error(`LLM judge did not return a result for ${asset.asset.asset_id}.`);
    }
  }
  return byAssetId;
}

function normalizeGalleryFeedback(feedback: LlmGalleryFeedback, assetIds: Set<string>): GalleryFeedback {
  return GalleryFeedbackSchema.parse({
    summary: feedback.summary.trim().slice(0, 500),
    strengths: feedback.strengths.map((item) => item.trim()).filter(Boolean).slice(0, 6),
    weaknesses: feedback.weaknesses.map((item) => item.trim()).filter(Boolean).slice(0, 6),
    actionable_items: feedback.actionable_items
      .map((item) => ({
        title: item.title.trim().slice(0, 120),
        priority: ActionPrioritySchema.parse(item.priority),
        why: item.why.trim().slice(0, 300),
        how_to_fix: item.how_to_fix.trim().slice(0, 400),
        affected_image_ids: item.affected_image_ids.filter((imageId) => assetIds.has(imageId)).slice(0, 50)
      }))
      .slice(0, 6)
  });
}

export class OpenAiLlmJudgeProvider implements RankingProvider {
  readonly providerName: string;
  readonly modelVersion: string;
  private readonly client: OpenAiResponsesClient;

  constructor(options?: {
    providerName?: string;
    modelVersion?: string;
    apiKey?: string;
    endpoint?: string;
    client?: OpenAiResponsesClient;
  }) {
    this.providerName = options?.providerName ?? "openai-llm-judge";
    this.modelVersion = options?.modelVersion ?? "gpt-5.4";
    this.client =
      options?.client ??
      new DefaultOpenAiResponsesClient(
        options?.apiKey ?? process.env.API_KEY ?? process.env.OPENAI_API_KEY,
        options?.endpoint
      );
  }

  async analyze(assets: ProviderAssetInput[], context: { listingContext: ListingContext }): Promise<ProviderAnalysisResult> {
    const localAssets = await Promise.all(
      assets.map(async (input) => ({
        asset: input.asset,
        bytes: input.bytes,
        image: await analyzeImageBuffer(input.bytes),
        imageUrl: await preprocessImageForOpenAi(input.bytes)
      }))
    );

    let parsedOutput: LlmJudgeOutput | null = null;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < OPENAI_MAX_PARSE_ATTEMPTS; attempt += 1) {
      try {
        const response = await this.client.createResponse(buildOpenAiRequest(localAssets, context.listingContext, this.modelVersion));
        const outputText = extractOutputText(response);
        if (!outputText) {
          throw new Error("OpenAI response did not contain any output text.");
        }
        parsedOutput = parseLlmJudgeOutput(outputText);
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown OpenAI parsing failure.");
      }
    }

    if (!parsedOutput) {
      throw lastError ?? new Error("Unable to parse OpenAI LLM judge output.");
    }

    const photoByAssetId = ensureCompletePhotoCoverage(assets, parsedOutput.photos);
    const assessments = localAssets.map((input) => {
      const llmPhoto = photoByAssetId.get(input.asset.asset_id)!;
      const predictedViewType = normalizeViewType(llmPhoto.predicted_view_type, llmPhoto.view_tags);
      const localIssues = buildTechnicalIssues({
        brightness: input.image.brightness,
        contrast: input.image.contrast,
        sharpness: input.image.sharpness,
        perspectiveRisk: input.image.perspectiveRisk,
        highlightClipping: input.image.highlightClipping,
        shadowClipping: input.image.shadowClipping
      });
      const issues = normalizeIssues([...llmPhoto.issues, ...localIssues]);
      const criteria = clampCriteriaWithLocalSignals(PhotoCriteriaSchema.parse(llmPhoto.criteria), input.image);
      const heroScore = clamp((clamp(llmPhoto.hero_score) + criteria.hero_potential) / 2);
      const technicalQualityScore = clamp(
        average([
          clamp(llmPhoto.technical_quality_score),
          criteria.lighting_exposure,
          criteria.sharpness_clarity,
          criteria.perspective_straightness,
          criteria.composition_framing
        ])
      );
      const overallScore = clamp(0.65 * clamp(llmPhoto.overall_score) + 0.2 * technicalQualityScore + 0.15 * heroScore);
      const confidence = defaultConfidence(
        clamp(llmPhoto.scene_confidence),
        issues,
        input.image.sharpness,
        input.image.contrast,
        0.08
      );

      return {
        assetId: input.asset.asset_id,
        fileName: input.asset.file_name,
        method: "llm_judge" as const,
        providerName: this.providerName,
        modelVersion: this.modelVersion,
        overallScore,
        heroScore,
        technicalQualityScore,
        predictedViewType,
        viewTags: normalizeViewTags(llmPhoto.view_tags),
        criteria,
        sceneConfidence: clamp(llmPhoto.scene_confidence),
        issues,
        improvementActions: buildImprovementActions(issues, llmPhoto.improvement_actions),
        confidence,
        rationale: llmPhoto.rationale.trim().slice(0, 500) || createRationale(predictedViewType, technicalQualityScore, heroScore, issues, "editorial"),
        perceptualHash: input.image.perceptualHash
      } satisfies ProviderAssessment;
    });

    return {
      assessments,
      galleryFeedback: normalizeGalleryFeedback(
        parsedOutput.gallery_feedback,
        new Set(assets.map((asset) => asset.asset.asset_id))
      )
    };
  }
}

export function addDuplicateIssue(assessments: ProviderAssessment[], duplicateGroups: string[][]): ProviderAssessment[] {
  const duplicateIds = new Set(duplicateGroups.flat());
  return assessments.map((assessment) => {
    const issues = duplicateIds.has(assessment.assetId)
      ? normalizeIssues([...assessment.issues, "duplicate_candidate"])
      : assessment.issues;
    return {
      ...assessment,
      issues,
      improvementActions: buildImprovementActions(issues, assessment.improvementActions)
    };
  });
}
