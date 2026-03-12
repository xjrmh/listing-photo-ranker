import type { ProviderAssessment } from "./providers";
import type { ListingContext, PropertyType, RankingMethod, RankingPolicy, RankedPhoto, RankingResult } from "./schemas";
import { clamp, hammingDistance } from "./utils";
import type { ViewType } from "./view-types";

const LEAD_QUALITY_FLOOR = 0.55;
const UTILITY_VIEWS = new Set<ViewType>(["garage", "laundry", "floorplan"]);
const MAIN_LIVING_VIEWS = new Set<ViewType>(["living_room", "family_room"]);
const OUTDOOR_VALUE_VIEWS = new Set<ViewType>([
  "front_exterior",
  "rear_exterior",
  "street_view",
  "garden",
  "yard",
  "patio_deck",
  "pool",
  "view",
  "amenity",
  "community"
]);

const HERO_PRIORITY_BY_PROPERTY: Record<PropertyType, ViewType[]> = {
  single_family: ["front_exterior", "rear_exterior", "view", "living_room", "kitchen"],
  townhouse: ["front_exterior", "living_room", "kitchen", "primary_bedroom", "patio_deck"],
  condo: ["view", "living_room", "kitchen", "amenity", "front_exterior"],
  multi_family: ["front_exterior", "living_room", "kitchen", "view", "amenity"],
  other: ["front_exterior", "view", "living_room", "kitchen", "primary_bedroom"]
};

const POSITION_PRIORS_BY_PROPERTY: Record<PropertyType, Partial<Record<ViewType, number>>> = {
  single_family: {
    front_exterior: 0.24,
    rear_exterior: 0.12,
    living_room: 0.19,
    family_room: 0.14,
    kitchen: 0.2,
    primary_bedroom: 0.14,
    bathroom: 0.06,
    view: 0.16,
    patio_deck: 0.12,
    garden: 0.1,
    yard: 0.11,
    pool: 0.15,
    office: 0.04,
    amenity: 0.04,
    community: 0.02,
    garage: -0.12,
    laundry: -0.18,
    floorplan: -0.22
  },
  townhouse: {
    front_exterior: 0.18,
    living_room: 0.2,
    kitchen: 0.2,
    primary_bedroom: 0.14,
    bathroom: 0.06,
    patio_deck: 0.14,
    view: 0.1,
    family_room: 0.1,
    office: 0.05,
    garage: -0.1,
    laundry: -0.16,
    floorplan: -0.22
  },
  condo: {
    view: 0.24,
    living_room: 0.22,
    kitchen: 0.18,
    amenity: 0.16,
    community: 0.12,
    primary_bedroom: 0.13,
    bathroom: 0.08,
    patio_deck: 0.11,
    street_view: 0.06,
    front_exterior: 0.05,
    rear_exterior: -0.02,
    garage: -0.14,
    laundry: -0.18,
    floorplan: -0.22
  },
  multi_family: {
    front_exterior: 0.2,
    living_room: 0.18,
    kitchen: 0.18,
    view: 0.14,
    amenity: 0.12,
    community: 0.1,
    primary_bedroom: 0.12,
    bathroom: 0.07,
    garage: -0.1,
    laundry: -0.15,
    floorplan: -0.2
  },
  other: {
    front_exterior: 0.18,
    living_room: 0.17,
    kitchen: 0.18,
    view: 0.14,
    primary_bedroom: 0.11,
    bathroom: 0.05,
    amenity: 0.08,
    garage: -0.08,
    laundry: -0.12,
    floorplan: -0.18
  }
};

const COVERAGE_EXPECTATIONS_BY_PROPERTY: Record<PropertyType, ViewType[]> = {
  single_family: ["front_exterior", "living_room", "kitchen", "primary_bedroom", "bathroom"],
  townhouse: ["front_exterior", "living_room", "kitchen", "primary_bedroom", "bathroom"],
  condo: ["living_room", "kitchen", "primary_bedroom", "bathroom", "view"],
  multi_family: ["front_exterior", "living_room", "kitchen", "primary_bedroom", "bathroom"],
  other: ["front_exterior", "living_room", "kitchen", "primary_bedroom", "bathroom"]
};

const CORE_SEQUENCE_GROUPS = ["main_living", "kitchen", "primary_bedroom", "outdoor_value"] as const;

type SequenceGroup = (typeof CORE_SEQUENCE_GROUPS)[number] | "bathroom" | "secondary_bedroom" | "dining" | "office" | "utility" | "other";

function assessmentScore(assessment: ProviderAssessment): number {
  return assessment.overallScore + assessment.technicalQualityScore * 0.18 + assessment.heroScore * 0.18 + assessment.sceneConfidence * 0.08;
}

function getPositionPrior(propertyType: PropertyType, viewType: ViewType): number {
  return POSITION_PRIORS_BY_PROPERTY[propertyType][viewType] ?? POSITION_PRIORS_BY_PROPERTY.other[viewType] ?? 0;
}

function getSequenceGroups(viewType: ViewType): SequenceGroup[] {
  if (MAIN_LIVING_VIEWS.has(viewType)) return ["main_living"];
  if (viewType === "kitchen") return ["kitchen"];
  if (viewType === "primary_bedroom") return ["primary_bedroom"];
  if (OUTDOOR_VALUE_VIEWS.has(viewType)) return ["outdoor_value"];
  if (viewType === "bathroom") return ["bathroom"];
  if (viewType === "bedroom") return ["secondary_bedroom"];
  if (viewType === "dining_room") return ["dining"];
  if (viewType === "office") return ["office"];
  if (UTILITY_VIEWS.has(viewType)) return ["utility"];
  return ["other"];
}

function getPrimarySequenceGroup(viewType: ViewType): SequenceGroup {
  return getSequenceGroups(viewType)[0] ?? "other";
}

function buildDuplicateClusterLookup(assessments: ProviderAssessment[]): {
  duplicateGroups: string[][];
  clusterIdByAsset: Map<string, string>;
} {
  const duplicateGroups = buildDuplicateGroups(assessments);
  const clusterIdByAsset = new Map<string, string>();

  for (const group of duplicateGroups) {
    const clusterId = [...group].sort()[0] ?? group[0];
    for (const assetId of group) {
      clusterIdByAsset.set(assetId, clusterId);
    }
  }

  return { duplicateGroups, clusterIdByAsset };
}

function collapseDuplicateRepresentatives(assessments: ProviderAssessment[], clusterIdByAsset: Map<string, string>): ProviderAssessment[] {
  const groups = new Map<string, ProviderAssessment[]>();

  for (const assessment of assessments) {
    const clusterId = clusterIdByAsset.get(assessment.assetId) ?? assessment.assetId;
    const group = groups.get(clusterId) ?? [];
    group.push(assessment);
    groups.set(clusterId, group);
  }

  return [...groups.values()].map((group) =>
    [...group].sort((left, right) => assessmentScore(right) - assessmentScore(left))[0]!
  );
}

function getSurfacedPositions(targetCount: number): Set<number> {
  if (targetCount < 5) {
    return new Set(Array.from({ length: targetCount }, (_, index) => index + 1));
  }

  return new Set([1, Math.ceil(targetCount / 4), Math.ceil((2 * targetCount) / 5), Math.ceil((3 * targetCount) / 5), Math.ceil((3 * targetCount) / 4)]);
}

function fulfillsCoverageExpectation(expected: ViewType, viewType: ViewType): boolean {
  if (expected === "living_room") {
    return MAIN_LIVING_VIEWS.has(viewType);
  }
  return expected === viewType;
}

function getMissingCoverage(ordered: ProviderAssessment[], propertyType: PropertyType): ViewType[] {
  return COVERAGE_EXPECTATIONS_BY_PROPERTY[propertyType].filter(
    (expected) => !ordered.some((assessment) => fulfillsCoverageExpectation(expected, assessment.predictedViewType))
  );
}

function getAvailableCoreGroups(assessments: ProviderAssessment[]): Set<SequenceGroup> {
  const available = new Set<SequenceGroup>();
  for (const assessment of assessments) {
    for (const group of getSequenceGroups(assessment.predictedViewType)) {
      if (CORE_SEQUENCE_GROUPS.includes(group as (typeof CORE_SEQUENCE_GROUPS)[number])) {
        available.add(group);
      }
    }
  }
  return available;
}

function getMissingCoreGroups(ordered: ProviderAssessment[], candidatePool: ProviderAssessment[]): Set<SequenceGroup> {
  const present = new Set<SequenceGroup>();
  for (const assessment of ordered) {
    for (const group of getSequenceGroups(assessment.predictedViewType)) {
      if (CORE_SEQUENCE_GROUPS.includes(group as (typeof CORE_SEQUENCE_GROUPS)[number])) {
        present.add(group);
      }
    }
  }

  const available = getAvailableCoreGroups([...ordered, ...candidatePool]);
  const missing = new Set<SequenceGroup>();
  for (const group of CORE_SEQUENCE_GROUPS) {
    if (available.has(group) && !present.has(group)) {
      missing.add(group);
    }
  }
  return missing;
}

function chooseLeadCandidate(
  assessments: ProviderAssessment[],
  policy: RankingPolicy,
  propertyType: PropertyType
): ProviderAssessment | undefined {
  const eligible = assessments.filter((assessment) => assessment.technicalQualityScore >= LEAD_QUALITY_FLOOR);
  const pool = eligible.length > 0 ? eligible : assessments;
  const heroPriority = HERO_PRIORITY_BY_PROPERTY[propertyType];

  return [...pool].sort((left, right) => {
    const leftPriorityIndex = heroPriority.indexOf(left.predictedViewType);
    const rightPriorityIndex = heroPriority.indexOf(right.predictedViewType);

    const leftPriorityBoost =
      policy.prefer_exterior_hero && leftPriorityIndex >= 0 ? 0.34 - leftPriorityIndex * 0.06 : policy.prefer_exterior_hero ? -0.05 : 0;
    const rightPriorityBoost =
      policy.prefer_exterior_hero && rightPriorityIndex >= 0 ? 0.34 - rightPriorityIndex * 0.06 : policy.prefer_exterior_hero ? -0.05 : 0;

    const leftScore =
      assessmentScore(left) +
      left.heroScore * 0.45 +
      left.sceneConfidence * 0.08 +
      (left.technicalQualityScore >= LEAD_QUALITY_FLOOR ? 0.15 : -0.2) +
      leftPriorityBoost;
    const rightScore =
      assessmentScore(right) +
      right.heroScore * 0.45 +
      right.sceneConfidence * 0.08 +
      (right.technicalQualityScore >= LEAD_QUALITY_FLOOR ? 0.15 : -0.2) +
      rightPriorityBoost;

    return rightScore - leftScore;
  })[0];
}

function scoreForPosition(input: {
  candidate: ProviderAssessment;
  position: number;
  ordered: ProviderAssessment[];
  candidatePool: ProviderAssessment[];
  listingContext: ListingContext;
  policy: RankingPolicy;
  targetCount: number;
  surfacedPositions: Set<number>;
  clusterIdByAsset: Map<string, string>;
  seenClusters: Set<string>;
}): number {
  const { candidate, ordered, candidatePool, policy, surfacedPositions, clusterIdByAsset, seenClusters, listingContext } = input;
  const propertyType = listingContext.property_type;
  const positionNumber = input.position + 1;
  const previous = ordered.at(-1);
  const candidateGroup = getPrimarySequenceGroup(candidate.predictedViewType);
  const missingCoreGroups = getMissingCoreGroups(ordered, candidatePool);
  const missingCoverage = getMissingCoverage(ordered, propertyType);
  const slotsLeftThroughFive = Math.max(5 - input.position, 0);
  const sameViewCount = ordered.filter((assessment) => assessment.predictedViewType === candidate.predictedViewType).length;
  const sameGroupCount = ordered.filter((assessment) => getPrimarySequenceGroup(assessment.predictedViewType) === candidateGroup).length;
  const candidateAddsMissingCore = getSequenceGroups(candidate.predictedViewType).some((group) => missingCoreGroups.has(group));
  const candidateAddsCoverage = missingCoverage.some((expected) => fulfillsCoverageExpectation(expected, candidate.predictedViewType));
  const candidateCluster = clusterIdByAsset.get(candidate.assetId);
  const surfacedGroups = new Set(
    ordered
      .filter((_, index) => surfacedPositions.has(index + 1))
      .map((assessment) => getPrimarySequenceGroup(assessment.predictedViewType))
  );

  let score = assessmentScore(candidate);
  score += candidate.heroScore * (positionNumber <= 5 ? 0.18 : 0.08);
  score += getPositionPrior(propertyType, candidate.predictedViewType) * (positionNumber <= 5 ? 1 : positionNumber <= 8 ? 0.7 : 0.45);

  if (positionNumber <= 5 && candidate.technicalQualityScore < LEAD_QUALITY_FLOOR) {
    score -= 0.12;
  }

  if (policy.require_room_diversity) {
    score -= sameViewCount * (positionNumber <= 5 ? 0.16 : 0.08);
    score -= sameGroupCount * (positionNumber <= 5 ? 0.08 : 0.04);
  }

  if (previous?.predictedViewType === candidate.predictedViewType) {
    score -= 0.28;
  }

  if (previous && getPrimarySequenceGroup(previous.predictedViewType) === candidateGroup && candidateGroup !== "other") {
    score -= 0.18;
  }

  if (positionNumber <= 5) {
    if (candidateAddsMissingCore) {
      score += 0.24;
    }

    if (missingCoreGroups.size >= slotsLeftThroughFive && missingCoreGroups.size > 0) {
      score += candidateAddsMissingCore ? 0.18 : -0.3;
    }

    if (positionNumber <= 3 && MAIN_LIVING_VIEWS.has(candidate.predictedViewType) && !ordered.some((assessment) => MAIN_LIVING_VIEWS.has(assessment.predictedViewType))) {
      score += 0.12;
    }
  }

  if (candidateAddsCoverage) {
    score += positionNumber <= 5 ? 0.16 : 0.08;
  }

  if (UTILITY_VIEWS.has(candidate.predictedViewType) && positionNumber <= 6) {
    const hasNonUtilityAlternative = candidatePool.some(
      (assessment) => assessment.assetId !== candidate.assetId && !UTILITY_VIEWS.has(assessment.predictedViewType)
    );
    if (hasNonUtilityAlternative || missingCoreGroups.size > 0) {
      score -= 0.55;
    }
  }

  if (candidateCluster && seenClusters.has(candidateCluster)) {
    score -= positionNumber <= 5 ? 1.2 : 0.22;
  }

  if (previous && candidateCluster && clusterIdByAsset.get(previous.assetId) === candidateCluster) {
    score -= 1.5;
  }

  if (surfacedPositions.has(positionNumber)) {
    score += surfacedGroups.has(candidateGroup) ? -0.12 : 0.14;
  }

  if (candidate.sceneConfidence < 0.4 && positionNumber <= 5) {
    score -= 0.08;
  }

  return score;
}

export function buildDuplicateGroups(assessments: ProviderAssessment[]): string[][] {
  const groups: string[][] = [];
  const visited = new Set<string>();

  for (const assessment of assessments) {
    if (visited.has(assessment.assetId)) {
      continue;
    }

    const group = [assessment.assetId];
    visited.add(assessment.assetId);

    for (const candidate of assessments) {
      if (candidate.assetId === assessment.assetId || visited.has(candidate.assetId)) {
        continue;
      }

      if (hammingDistance(assessment.perceptualHash, candidate.perceptualHash) <= 6) {
        group.push(candidate.assetId);
        visited.add(candidate.assetId);
      }
    }

    if (group.length > 1) {
      groups.push(group);
    }
  }

  return groups;
}

export function buildRankingResult(input: {
  assessments: ProviderAssessment[];
  method: RankingMethod;
  listingContext: ListingContext;
  policy: RankingPolicy;
  targetCount: number;
  providerName: string;
  modelVersion: string;
}): RankingResult {
  const { duplicateGroups, clusterIdByAsset } = buildDuplicateClusterLookup(input.assessments);
  const surfacedPositions = getSurfacedPositions(input.targetCount);
  let candidatePool = input.policy.dedupe
    ? collapseDuplicateRepresentatives(input.assessments, clusterIdByAsset)
    : [...input.assessments];

  const ordered: ProviderAssessment[] = [];
  const seenClusters = new Set<string>();
  const lead = chooseLeadCandidate(candidatePool, input.policy, input.listingContext.property_type);

  if (lead) {
    ordered.push(lead);
    const leadCluster = clusterIdByAsset.get(lead.assetId);
    if (leadCluster) {
      seenClusters.add(leadCluster);
    }
    candidatePool = candidatePool.filter((assessment) => assessment.assetId !== lead.assetId);
  }

  while (candidatePool.length > 0 && ordered.length < input.targetCount) {
    const rankedCandidates = [...candidatePool].sort((left, right) => {
      const leftScore = scoreForPosition({
        candidate: left,
        position: ordered.length,
        ordered,
        candidatePool,
        listingContext: input.listingContext,
        policy: input.policy,
        targetCount: input.targetCount,
        surfacedPositions,
        clusterIdByAsset,
        seenClusters
      });
      const rightScore = scoreForPosition({
        candidate: right,
        position: ordered.length,
        ordered,
        candidatePool,
        listingContext: input.listingContext,
        policy: input.policy,
        targetCount: input.targetCount,
        surfacedPositions,
        clusterIdByAsset,
        seenClusters
      });

      return rightScore - leftScore;
    });

    const next = rankedCandidates[0];
    if (!next) {
      break;
    }

    ordered.push(next);
    const clusterId = clusterIdByAsset.get(next.assetId);
    if (clusterId) {
      seenClusters.add(clusterId);
    }
    candidatePool = candidatePool.filter((assessment) => assessment.assetId !== next.assetId);
  }

  const orderedImages: RankedPhoto[] = ordered.slice(0, input.targetCount).map((assessment, index) => ({
    image_id: assessment.assetId,
    position: index + 1,
    file_name: assessment.fileName,
    overall_score: clamp(assessment.overallScore),
    hero_score: clamp(assessment.heroScore),
    technical_quality_score: clamp(assessment.technicalQualityScore),
    predicted_view_type: assessment.predictedViewType,
    view_tags: assessment.viewTags,
    issues: assessment.issues,
    confidence: clamp(assessment.confidence),
    rationale: assessment.rationale
  }));

  const missingCoverage = COVERAGE_EXPECTATIONS_BY_PROPERTY[input.listingContext.property_type].filter(
    (viewType) => !ordered.some((assessment) => fulfillsCoverageExpectation(viewType, assessment.predictedViewType))
  );

  return {
    ordered_images: orderedImages,
    diagnostics: {
      duplicate_groups: duplicateGroups,
      missing_coverage: missingCoverage,
      source_asset_count: input.assessments.length,
      selected_asset_count: orderedImages.length
    },
    method: input.method,
    provider_name: input.providerName,
    model_version: input.modelVersion,
    feedback_allowed: true
  };
}
