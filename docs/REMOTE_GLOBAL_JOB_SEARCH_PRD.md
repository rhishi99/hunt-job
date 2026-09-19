# Global Remote & Contract Job Search — Product Requirements

## Status

Proposed enhancement based on the career-search discussion.

## Problem

The current Hunt-Job documentation is strongly India-focused. The candidate also wants international opportunities that can be worked remotely from India, including permanent, contract and contract-to-hire roles, with preference for established companies and strong cloud/Kubernetes/platform engineering exposure.

## Goals

- Discover international remote roles open to candidates in India.
- Distinguish permanent, contractor, contract-to-hire and part-time work.
- Filter for genuine India eligibility rather than assuming any "remote" posting is accessible.
- Capture company maturity, role stability and learning value.
- Preserve a clear separation between search facts and user judgment.

## Non-Goals

- Automatically apply to jobs.
- Guess work authorization or sponsorship.
- Predict interview or hiring outcomes.
- Treat company age as a proxy for job quality.
- Replace human review of compensation, contract and legal terms.

## Functional Requirements

### FR1 — Employment Model
Normalize:
- full-time
- contract
- contract-to-hire
- part-time
- temporary
- internship

### FR2 — Remote Eligibility
Capture:
- India only
- India + named countries
- worldwide remote
- EOR
- contractor
- remote but time-zone restricted
- onsite / hybrid

A remote=true flag is insufficient by itself.

### FR3 — Company Maturity
Capture founding year and derived company age where data is available.

Default user preference:
- minimum 3 years
- preferred 5+ years

The filter must be configurable.

### FR4 — Technical Growth
Score or classify the role for exposure to:
- Kubernetes / EKS
- AWS
- Terraform
- GitOps
- Platform engineering
- SRE
- Observability
- CI/CD
- Containers
- Security
- FinOps

This should be a transparent sub-score with evidence from the job description.

### FR5 — Stability Information
Show observable facts such as:
- permanent employment
- contract duration
- contract-to-hire
- named platform/product
- employment type
- benefits
- on-call expectations

Do not create unsupported claims such as "stable company".

### FR6 — Compensation
Support:
- INR / USD / EUR / GBP and other currencies
- base
- variable
- equity
- hourly/day rate
- contract period
- benefits

Unknown fields remain unknown.

### FR7 — Source Quality
Track source type:
- company career page / ATS
- remote-job board
- aggregator
- search-discovered job URL

Prefer canonical company or ATS URLs for evaluation and application.

## Suggested Search Workflow

discover -> eligibility filter -> company maturity filter -> technical-growth analysis -> compensation normalization -> user review -> application -> outcome tracking

## Suggested Filters

Example:
- Archetype: Staff Platform Engineer / Staff SRE / DevOps Architect
- Remote eligibility: India / worldwide
- Employment: permanent + contract-to-hire + contract
- Company age: >= 3 years
- Skills: AWS + Kubernetes + Terraform
- Time zone: user-configurable
- Salary/rate: user-configurable
- Exclude: onsite-only, unknown work eligibility, excluded startup profile

## Acceptance Criteria

A job should only appear in the "global remote" view when the system has explicit evidence for its geographic/work model or clearly marks the eligibility as unknown.

A role should expose why it matched:
- remote eligibility
- employment model
- company age evidence
- key technologies
- compensation evidence
- source URL

## Portfolio / Profile Integration

Allow the candidate profile to reference:
- open-source projects
- personal applications
- infrastructure repositories
- AI engineering projects

Examples can include the candidate's NX Wagger and AGI Headless Bridge projects when their repository details are added to the profile.

## Privacy

Profile and preferences remain local unless explicitly sent to an AI provider for analysis, consistent with existing Hunt-Job privacy behavior.
