# listing-photo-ranker

`listing-photo-ranker` is a utility-first API with CLI support and a minimal front-end for ranking residential listing photos by attractiveness and real-estate merchandising quality.

The core job is not just image quality scoring. It should output an ordered photo sequence that balances:

- visual attractiveness
- likely buyer engagement
- standard real-estate hero-photo conventions
- room diversity and narrative flow across the gallery

## Product Summary

The user flow is intentionally simple:

1. Choose how many photos to rank.
2. Upload listing photos.
3. Select a ranking methodology: `llm_judge`, `cv`, or `ensemble`.
4. Receive:
   - recommended photo order
   - per-image scores
   - room/scene classification
   - confidence and rationale
   - warnings such as duplicates, blur, dark exposure, or weak hero candidates

This should feel like infrastructure, not a design-heavy application. The API and CLI are first-class; the web UI is only a thin operator layer.

## What The System Should Return

Each ranked image should include structured output such as:

```json
{
  "image_id": "img_004",
  "position": 1,
  "overall_score": 0.91,
  "hero_score": 0.95,
  "attractiveness_score": 0.88,
  "technical_quality_score": 0.86,
  "scene_type": "front_exterior",
  "issues": ["slight_perspective_distortion"],
  "confidence": 0.84,
  "rationale": "Strong curb appeal and clear full-home framing make this a high-confidence hero image."
}
```

At the ranking level, the system should also return:

- a full ordered list
- a shortlist of top `N` hero candidates
- duplicate/near-duplicate groups
- coverage diagnostics by room type
- method metadata and model version

## Ranking Logic

The ranking problem is best treated as a constrained ranking pipeline:

1. Score each image independently.
2. Classify scene/room type.
3. Detect technical defects and near-duplicates.
4. Apply ranking logic with real-estate sequencing priors.
5. Re-rank to maximize gallery-level quality, not just single-image quality.

Example ranking priors:

- Prefer a strong exterior hero image first when available.
- If no strong exterior exists, allow kitchen, living room, or exceptional view shots to lead.
- Avoid putting two nearly identical photos back-to-back.
- Surface variety early: exterior, living area, kitchen, primary spaces.
- Down-rank weak utility shots unless the listing lacks coverage.

## Ordering Methodologies

### 1. LLM As Judge

Use a vision-capable LLM to score and compare listing photos against an explicit rubric.

Recommended approach:

- scene classification prompt: identify room type, angle, and salient selling features
- pointwise scoring prompt: attractiveness, technical quality, merchandising value, hero suitability
- pairwise or tournament comparisons: decide which of two images should appear earlier in the listing
- constrained finalizer: produce a full ranking that respects business rules and diversity

Suggested rubric dimensions:

- curb appeal / emotional pull
- clarity, brightness, composition, and straightness
- sense of space
- feature salience: kitchen quality, view, yard, renovated finishes
- hero-photo suitability
- redundancy penalty

Strengths:

- fast to prototype
- strong zero-shot reasoning
- flexible explanations
- useful where scene understanding and merchandising nuance matter

Weaknesses:

- higher latency and cost
- ranking instability unless prompts and structured schemas are tight
- harder to calibrate at scale without a labeled benchmark

Implementation note:

Prefer structured JSON outputs and bracket the LLM with deterministic pre/post-processing. Do not let the model directly invent the final order without duplicate detection, scene labels, and business-rule checks around it.

### 2. CV

Use a traditional computer-vision pipeline or multimodal embedding stack to score images with explicit models.

Recommended components:

- scene classifier: `front_exterior`, `rear_exterior`, `kitchen`, `living_room`, `primary_bedroom`, `bathroom`, `view`, `floorplan`, `amenity`, `other`
- technical quality model: blur, exposure, skew, dynamic range, distortion, watermark/logo detection
- aesthetic model: composition and attractiveness
- similarity model: near-duplicate detection
- learning-to-rank layer: combine signals into ordered output

Possible formulations:

- heuristic scorer with hand-tuned weights
- gradient boosted trees over engineered features
- pairwise ranking model
- multimodal embedding model fine-tuned on realtor/editor preference data

Strengths:

- lower serving cost
- better consistency
- easier to benchmark and monitor
- easier to deploy in bulk workflows

Weaknesses:

- requires labeled data or carefully tuned heuristics
- weaker than LLMs on subtle merchandising context unless trained well

### Recommended Product Positioning

Expose three runtime modes:

- `llm_judge`: highest-quality reasoning, best for low volume and editorial workflows
- `cv`: lowest-cost high-throughput mode, best for production batch use
- `ensemble`: use CV for base scores and constraints, then ask the LLM to resolve borderline ordering decisions and explain the final order

The ensemble mode will likely be the best long-term default.

## API Shape

### Core Endpoints

`POST /v1/rankings`

- upload or reference images
- specify methodology and ranking policy
- return a synchronous ranking for small jobs

`POST /v1/jobs`

- create an async batch job for larger uploads

`GET /v1/jobs/{job_id}`

- fetch job status and result metadata

`GET /v1/rankings/{ranking_id}`

- fetch the final ordered result

`POST /v1/feedback`

- capture user overrides, accepted order, and editorial corrections

### Example Request

```json
{
  "listing_id": "listing_123",
  "method": "ensemble",
  "target_count": 20,
  "images": [
    {"image_id": "img_1", "url": "https://.../1.jpg"},
    {"image_id": "img_2", "url": "https://.../2.jpg"}
  ],
  "policy": {
    "prefer_exterior_hero": true,
    "dedupe": true,
    "require_room_diversity": true
  }
}
```

### Example Response

```json
{
  "ranking_id": "rank_123",
  "method": "ensemble",
  "ordered_images": [
    {"image_id": "img_2", "position": 1},
    {"image_id": "img_7", "position": 2},
    {"image_id": "img_1", "position": 3}
  ],
  "hero_candidates": ["img_2", "img_7"],
  "diagnostics": {
    "duplicate_groups": [["img_4", "img_9"]],
    "missing_coverage": ["bathroom"],
    "confidence": 0.82
  }
}
```

## CLI Shape

The CLI should be optimized for operators and batch workflows.

Example commands:

```bash
listing-photo-ranker rank photos/*.jpg --method ensemble --out ranking.json
listing-photo-ranker rank ./listing-42 --method llm_judge --top 15
listing-photo-ranker feedback ranking.json --accepted-order accepted.json
listing-photo-ranker benchmark ./datasets/editor-labeled --method cv
```

Useful CLI flags:

- `--method`
- `--top`
- `--format json|table`
- `--async`
- `--webhook-url`
- `--policy-file`
- `--explain`

## Minimal Front-End

The front-end only needs three screens:

1. Upload page
2. Ranking results page
3. Side-by-side override/reorder page

Key UI elements:

- drag-and-drop upload
- methodology selector
- ranked gallery with per-image badges
- confidence and issue markers
- manual reorder before export

Anything beyond that should stay out of the MVP.

## Suggested Internal Architecture

### Packages

- `apps/api`: HTTP API and job orchestration
- `apps/web`: minimal upload/results UI
- `packages/cli`: operator-facing CLI
- `packages/core`: ranking interfaces, schemas, policies
- `packages/models`: LLM prompts, CV models, feature extractors
- `packages/eval`: offline benchmarks and experiment analysis

### Pipeline

1. Ingest image set
2. Normalize metadata and image dimensions
3. Run scene classification
4. Run quality and defect detection
5. Run methodology-specific scoring
6. Apply ranking constraints and re-ranking
7. Persist result and diagnostics
8. Collect user feedback for learning

## Data And Feedback Loop

The most valuable proprietary asset will be labeled ranking data.

Capture:

- editor-accepted final orders
- user overrides to model output
- pairwise preference labels
- listing outcomes after publication

This enables:

- supervised re-ranking
- prompt tuning and judge calibration
- confidence calibration
- causal analysis of whether improved ordering changes downstream performance

## MVP Scope

Phase 1:

- image upload
- scene classification
- duplicate detection
- `llm_judge` ranking
- simple `cv` baseline
- JSON API and CLI
- minimal web review UI

Phase 2:

- ensemble ranker
- user feedback ingestion
- benchmark suite with editor-labeled dataset
- listing-policy profiles by property type

Phase 3:

- learned ranking model
- customer-specific fine-tuning
- online experimentation and policy optimization

## Success Metrics

Offline:

- agreement with expert order
- hero-image top-1 accuracy
- NDCG / Kendall tau / pairwise win rate
- duplicate suppression precision

Online:

- click-through rate on listing cards
- detail-page engagement
- save/share/contact rate
- time to publish for listing operators
- override rate by human editors

## Core Product Thesis

The product is strongest if it is framed as a ranking system, not an image scorer. Real-estate photo quality is contextual: the best first image depends on property type, coverage gaps, and gallery composition. The differentiator is the combination of merchandising priors, multimodal scoring, and measurable downstream business impact.

## Related Doc

For measurement and experimentation guidance, see [docs/causal-inference-framework.md](/Users/lizheng/Downloads/listing-photo-ranker/docs/causal-inference-framework.md).
