# Causal Inference And Experimentation Framework

This document defines how `listing-photo-ranker` should prove that better photo ordering creates business value instead of only producing outputs that look reasonable to humans.

## 1. Objective

Primary causal question:

> Does a better photo order increase listing engagement and conversion outcomes relative to the current manual or chronological ordering process?

Recommended primary hypothesis:

- listings shown with model-ranked photos outperform control listings on engagement and lead-generation metrics

Secondary hypotheses:

- LLM ranking beats baseline CV ranking on editorial agreement
- ensemble ranking beats either single method alone
- better ordering reduces manual override work for listing operators

## 2. Unit Of Randomization

Preferred unit:

- `listing_id` for marketplace-facing experiments where each listing receives one ordering treatment

Alternative units:

- `session_id` if the same listing can safely be shown in different orders to different users
- `agent_id` or `office_id` for rollouts where operational constraints require clustered treatment

Recommendation:

Use `listing_id` randomization first. It avoids within-listing interference and makes the treatment easy to define.

## 3. Treatments

Recommended initial experiment arms:

- control: existing human/default ordering
- treatment A: `cv`
- treatment B: `llm_judge`
- treatment C: `ensemble`

If traffic is limited, start with:

- control
- best current model candidate

Do not launch a 4-arm test unless traffic is large enough to maintain statistical power.

## 4. Outcome Metrics

### Primary Metrics

Choose one primary decision metric before launch.

Best candidates:

- lead submit rate
- save/favorite rate
- contact-agent rate
- qualified click-through rate from search results to listing detail

### Secondary Metrics

- time spent on listing detail page
- gallery interaction depth
- scroll depth
- share rate
- showing-request rate

### Operational Metrics

- editor override rate
- time to accept/publish photo order
- fraction of jobs requiring manual correction

### Guardrails

- page latency
- error rate
- image rendering failures
- customer complaints
- suspicious drops in diversity or coverage

## 5. Offline Evaluation Before Any Online Test

An online experiment should not be the first validation layer.

Build an editorial benchmark with:

- expert-ordered listing galleries
- pairwise photo preference labels
- hero-image labels
- room/scene labels

Recommended offline metrics:

- top-1 hero accuracy
- top-k overlap with expert sequence
- NDCG
- Kendall tau or Spearman rank correlation
- pairwise accuracy
- duplicate suppression precision/recall

This benchmark should gate promotions between model versions.

## 6. Recommended Experiment Design

### Stage 1: Editorial Acceptance Test

Population:

- internal editors or operations staff

Treatment:

- compare model-generated order vs current manual/default order

Primary metric:

- acceptance rate without edits

Why this stage matters:

- it validates ranking quality cheaply before exposing end users

### Stage 2: Marketplace A/B Test

Population:

- live listings eligible for experimentation

Treatment assignment:

- randomize at `listing_id`

Primary metric:

- one marketplace conversion metric chosen up front

Analysis:

- intention-to-treat
- cluster-robust standard errors if randomization is clustered above listing level

### Stage 3: Policy Learning

After baseline value is proven:

- segment by property type, price band, geography, and listing quality
- estimate heterogeneous treatment effects
- adapt ranking policy by segment

## 7. Logging Requirements

The system cannot support causal analysis without good event logging.

Minimum entities:

- `ranking_job`
- `ranking_result`
- `photo_score`
- `listing_exposure`
- `listing_engagement_event`
- `operator_feedback`

Minimum fields:

- experiment id
- variant assignment
- listing id
- session id if applicable
- timestamp
- model method and version
- ordered image ids
- whether manual override occurred
- downstream outcome events

## 8. Analysis Strategy

### Primary Online Estimator

Use simple randomized A/B estimation first:

- difference in means for binary or rate outcomes
- logistic or linear regression with pre-specified covariates for precision gains

Recommended regression form:

```text
outcome ~ treatment + property_type + price_band + geography + listing_quality_proxy
```

Covariates should improve precision, not replace randomization.

### Heterogeneity

After the primary readout:

- stratify by luxury vs non-luxury
- condo vs single-family
- professional photography vs low-quality photography
- high-photo-count vs low-photo-count listings

This matters because hero-photo conventions differ across inventory.

## 9. If Randomization Is Not Feasible

Use quasi-experimental methods only as second-best options.

Recommended fallback designs:

- switchback by day or hour if rankings are applied platform-wide
- difference-in-differences for phased rollout across offices or regions
- propensity weighting or doubly robust estimation for observational adoption analyses

Important warning:

Observational comparisons between users who choose the tool and those who do not will be heavily confounded by listing quality, agent sophistication, and photography budget.

## 10. Threats To Validity

Key risks:

- interference if the same listing is seen in multiple treatments
- treatment leakage if operators copy ranked outputs across variants
- sample ratio mismatch
- novelty effects immediately after launch
- model updates during the experiment window
- seasonality in real-estate demand

Mitigations:

- freeze model versions during the test
- log exact ranking payloads
- monitor assignment balance daily
- pre-register the primary metric and readout date

## 11. Power And MDE Guidance

Use the smallest test that can still answer a business question.

Before launch, define:

- baseline conversion rate
- minimum detectable effect worth shipping
- traffic available per week
- experiment duration cap

For low-base-rate metrics such as lead submissions, expect much larger sample needs than for clicks or saves. In practice, it is often better to use:

- click or save as the primary early metric
- lead metrics as confirmatory secondary metrics

## 12. Decision Rules

Ship if:

- the primary metric improves with statistical confidence
- no guardrail materially regresses
- editorial override rate is flat or better

Iterate if:

- overall lift is neutral but strong positive lift appears in clear subsegments
- offline quality improves but online effect is noisy

Kill or roll back if:

- the primary metric regresses
- override burden increases materially
- the model creates repeated sequencing failures such as weak hero-image selection

## 13. Practical Recommendation For This Product

The cleanest path is:

1. Build a labeled editorial benchmark.
2. Launch `cv` and `llm_judge` offline against that benchmark.
3. Promote the stronger candidate, or an ensemble, into an editor acceptance test.
4. Run a listing-level A/B test against current ordering.
5. Use the resulting logs to train a better ranker and estimate heterogeneous effects.

That sequence keeps the product grounded in both human judgment and causal business impact.
