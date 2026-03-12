import { z } from "zod";

export const VIEW_TYPES = [
  "front_exterior",
  "rear_exterior",
  "street_view",
  "living_room",
  "family_room",
  "kitchen",
  "dining_room",
  "primary_bedroom",
  "bedroom",
  "bathroom",
  "office",
  "laundry",
  "garden",
  "yard",
  "patio_deck",
  "pool",
  "view",
  "garage",
  "floorplan",
  "amenity",
  "community",
  "other"
] as const;

export type ViewType = (typeof VIEW_TYPES)[number];

export const ViewTypeSchema = z.enum(VIEW_TYPES);

const NORMALIZATION_MAP: Record<string, ViewType> = {
  amenity: "amenity",
  aerial: "view",
  balcony_view: "view",
  backyard: "yard",
  balcony: "patio_deck",
  bath: "bathroom",
  bathroom: "bathroom",
  bedroom: "bedroom",
  clubhouse: "amenity",
  bonus_room: "family_room",
  community: "community",
  condo_view: "view",
  curb: "front_exterior",
  courtyard: "garden",
  deck: "patio_deck",
  den: "family_room",
  dining: "dining_room",
  dining_room: "dining_room",
  dock: "view",
  drone: "view",
  driveway: "front_exterior",
  ensuite: "bathroom",
  entrance: "front_exterior",
  exterior: "front_exterior",
  facade: "front_exterior",
  family: "family_room",
  family_room: "family_room",
  fireplace: "living_room",
  floor_plan: "floorplan",
  floorplan: "floorplan",
  front: "front_exterior",
  front_exterior: "front_exterior",
  garage: "garage",
  garden: "garden",
  great_room: "living_room",
  guest_room: "bedroom",
  gym: "amenity",
  kitchen: "kitchen",
  laundry: "laundry",
  living: "living_room",
  living_room: "living_room",
  loft: "family_room",
  lounge: "living_room",
  master_bedroom: "primary_bedroom",
  office: "office",
  patio: "patio_deck",
  plan: "floorplan",
  pool: "pool",
  porch: "patio_deck",
  powder_room: "bathroom",
  primary: "primary_bedroom",
  primary_bedroom: "primary_bedroom",
  rear: "rear_exterior",
  rear_exterior: "rear_exterior",
  roofdeck: "patio_deck",
  skyline: "view",
  spa: "amenity",
  stair: "other",
  street: "street_view",
  street_view: "street_view",
  study: "office",
  sunroom: "family_room",
  terrace: "patio_deck",
  twilight: "front_exterior",
  utility: "laundry",
  view: "view",
  walkthrough: "other",
  water_view: "view",
  waterfront: "view",
  yard: "yard"
};

const VIEW_SYNONYM_PATTERNS: Array<{ pattern: RegExp; value: ViewType }> = [
  { pattern: /\b(front|facade|curb|entry|entrance|driveway|twilight)\b/, value: "front_exterior" },
  { pattern: /\b(rear|back|backyard facade|back exterior)\b/, value: "rear_exterior" },
  { pattern: /\b(street|road|block)\b/, value: "street_view" },
  { pattern: /\b(living|great room|lounge|fireplace)\b/, value: "living_room" },
  { pattern: /\b(family|den|media room|bonus room|sunroom)\b/, value: "family_room" },
  { pattern: /\b(kitchen|island|chef)\b/, value: "kitchen" },
  { pattern: /\b(dining|breakfast nook)\b/, value: "dining_room" },
  { pattern: /\b(primary|master suite)\b/, value: "primary_bedroom" },
  { pattern: /\b(guest room|bedroom|bed)\b/, value: "bedroom" },
  { pattern: /\b(bath|vanity|shower|tub|powder room|ensuite)\b/, value: "bathroom" },
  { pattern: /\b(office|study|workspace)\b/, value: "office" },
  { pattern: /\b(laundry|washer|dryer|mudroom)\b/, value: "laundry" },
  { pattern: /\b(garden|courtyard|greenhouse)\b/, value: "garden" },
  { pattern: /\b(yard|lawn)\b/, value: "yard" },
  { pattern: /\b(patio|deck|terrace|porch|balcony|roof deck)\b/, value: "patio_deck" },
  { pattern: /\b(pool|spa)\b/, value: "pool" },
  { pattern: /\b(view|skyline|waterfront|ocean|mountain|city|aerial|drone|dock)\b/, value: "view" },
  { pattern: /\b(garage|carport)\b/, value: "garage" },
  { pattern: /\b(floor ?plan|blueprint)\b/, value: "floorplan" },
  { pattern: /\b(amenity|gym|clubhouse|lobby|fitness|concierge)\b/, value: "amenity" },
  { pattern: /\b(community|playground|common area)\b/, value: "community" }
];

export function normalizeViewTags(tags: string[] = []): string[] {
  const normalized = tags
    .map((tag) =>
      tag
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
    )
    .filter(Boolean);

  return [...new Set(normalized)].slice(0, 5);
}

export function normalizeViewType(rawLabel?: string | null, tags: string[] = []): ViewType {
  const candidates = [rawLabel ?? "", ...tags].join(" ").trim().toLowerCase();
  if (!candidates) {
    return "other";
  }

  const cleaned = candidates.replace(/[^a-z0-9\s_]+/g, " ");
  const exactTokens = cleaned.split(/\s+/).map((token) => token.trim()).filter(Boolean);

  for (const token of exactTokens) {
    if (NORMALIZATION_MAP[token]) {
      return NORMALIZATION_MAP[token];
    }
  }

  for (const entry of VIEW_SYNONYM_PATTERNS) {
    if (entry.pattern.test(cleaned)) {
      return entry.value;
    }
  }

  return "other";
}

export function describeViewType(viewType: ViewType): string {
  return viewType.replace(/_/g, " ");
}
