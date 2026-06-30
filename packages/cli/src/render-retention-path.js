// @ts-check

/** @import { RetentionPath } from '@endo/daemon' */

/**
 * Render a single retention path in the human-readable form
 * documented in `designs/daemon-retention-paths.md` § CLI: endo
 * paths § Example output.
 *
 * Each non-root segment renders as `<member-name> (<formula-type>)`;
 * the root segment renders as `<member-name> (root)`. Edge labels
 * between segments use `→<field>` (Unicode arrow) for field-name
 * edges and `"<name>"` for pet-name edges.
 *
 * @param {RetentionPath} path
 * @returns {string[]}
 */
export const renderPath = path => {
  /** @type {string[]} */
  const lines = [];
  // Walk leaf-to-root so the topmost segment renders last (matches
  // the design's example, which reads "rooted at endo" first).
  const segments = [...path].reverse();
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    const isRoot = seg.type === 'root';
    const members = (seg.groupMembers ?? []).join(', ');
    const types = seg.formulaTypes ?? [];
    // The design's example shows the root marker `(root)` in place
    // of the formula type; for non-root segments the type goes in
    // parentheses after the member name. Multi-member groups join
    // their per-member types with commas so the rendering remains
    // 1:1 with `groupMembers`.
    const typeMarker = isRoot
      ? '(root)'
      : types.length > 0
        ? `(${types.join(', ')})`
        : '';
    const label = typeMarker !== '' ? `${members} ${typeMarker}` : members;
    lines.push(`  ${label}`);
    // Edge labels separating this segment from the next one
    // downstream (i.e. closer to the target).
    if (i < segments.length - 1) {
      const next = segments[i + 1];
      const labels = next.labels ?? [];
      if (labels.length === 0) {
        lines.push(`    →`);
      } else {
        for (const lab of labels) {
          if (lab.startsWith('pet:')) {
            lines.push(`    "${lab.slice('pet:'.length)}"`);
          } else {
            lines.push(`    →${lab}`);
          }
        }
      }
    }
  }
  return lines;
};

/**
 * Compose the banner for a single path, matching the design's
 * "Path N (rooted at <root-name>):" form. When the path does not
 * terminate at a GC root, the parenthetical is dropped.
 *
 * @param {RetentionPath} rPath
 * @param {number} index Zero-based path index in the surrounding list.
 * @returns {string}
 */
export const renderBanner = (rPath, index) => {
  const rootSeg = rPath[rPath.length - 1];
  const isRooted = rootSeg && rootSeg.type === 'root';
  const rootName =
    isRooted && rootSeg.groupMembers && rootSeg.groupMembers.length > 0
      ? rootSeg.groupMembers[0]
      : undefined;
  return rootName
    ? `Path ${index + 1} (rooted at ${rootName}):`
    : `Path ${index + 1}:`;
};
