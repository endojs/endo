/**
 * The end-state a stage-and-commit scenario is scored against.
 */
export interface GitCommitTarget {
  /** Repository-relative path the scenario commits. */
  path: string;
  /** The exact UTF-8 content the committed file must carry at HEAD. */
  content: string;
  /** The exact commit message HEAD must carry. */
  message: string;
}
