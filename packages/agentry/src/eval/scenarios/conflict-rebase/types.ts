/**
 * A note that must remain present at the final feature tip.
 */
export interface GitTrackedNote {
  path: string;
  content: string;
}

/**
 * The end-state a conflict-rebase scenario is scored against.
 */
export interface GitConflictRebaseTarget {
  /** Branch the scenario starts on and must leave checked out. */
  featureBranch: string;
  /** Branch the feature branch is rebased onto. */
  integrationBranch: string;
  /** The pre-run integration branch tip. */
  integrationOid: string;
  /** Feature commit summaries, oldest first, expected after replay. */
  replayedSummaries: string[];
  /** Feature commit oids before the rebase, oldest first. */
  originalFeatureOids: string[];
  /** Expected per-replayed-commit patches, oldest first. */
  expectedPatches: string[];
  /** Exact post-rebase feature tip tree. */
  featureTreeOid: string;
  /** Exact app.txt content after resolving the conflict. */
  appText: string;
  /** Notes that must be present at HEAD. */
  notes: GitTrackedNote[];
}
