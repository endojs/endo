// @ts-check

/** @import { VNode } from 'preact' */
/** @import { FormulaViewSpec } from './formula-view-registry.js' */

import harden from '@endo/harden';

import { h } from 'preact';

import { getFormulaViewSpec } from './formula-view-registry.js';

/**
 * @typedef {object} FormulaProperty
 * @property {'literal' | 'reference' | 'reference-list'} kind
 * @property {unknown} [value]
 * @property {string} [identifier]
 * @property {Record<string, string>} [entries]
 */

/**
 * @typedef {object} FormulaRecord
 * @property {string} type
 * @property {string} number
 * @property {Record<string, FormulaProperty>} properties
 */

/**
 * Format a literal value for back-face display. Strings render verbatim;
 * arrays render as comma-separated values; everything else falls through
 * to JSON.stringify (with a guard so circular structures do not blow
 * up the modal session).
 *
 * The result is rendered as a Preact text child, so the confined renderer
 * escapes it — daemon-supplied literal values never reach the DOM as markup.
 *
 * @param {unknown} value
 * @returns {string}
 */
const formatLiteral = value => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(v => (typeof v === 'string' ? v : String(v))).join(', ');
  }
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '(unrenderable)';
    }
  }
  return String(value);
};

/**
 * Turn a schema property name into a human-facing label: split
 * camelCase and kebab/snake boundaries and Title-Case each word
 * (`petStore` -> `Pet Store`, `make-unconfined` -> `Make Unconfined`).
 * Used so a reference button reads as a name rather than echoing the
 * raw schema identifier.
 *
 * @param {string} name
 * @returns {string}
 */
export const humanizeName = name => {
  const words = String(name)
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return String(name);
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};
harden(humanizeName);

/**
 * Build a reference-button vnode. The visible label is human-facing; the
 * navigation label (passed to `onNavigateReference`) stays raw for
 * back-stack breadcrumbs. A button with no identifier is disabled.
 *
 * @param {object} props
 * @param {string} props.label            Human-facing button text.
 * @param {string | undefined} props.identifier
 * @param {string} props.navLabel         Raw label for the navigation callback.
 * @param {(identifier: string, label: string) => void} props.onNavigateReference
 * @param {boolean} [props.solo]          Whether this is a single (non-list) reference.
 * @returns {VNode}
 */
const referenceButton = ({
  label,
  identifier,
  navLabel,
  onNavigateReference,
  solo,
}) => {
  const className = solo
    ? 'formula-view-reference formula-view-reference-solo'
    : 'formula-view-reference';
  return h(
    'button',
    {
      class: className,
      title: identifier || '',
      disabled: identifier ? undefined : true,
      onClick: identifier
        ? () => onNavigateReference(identifier, navLabel)
        : undefined,
    },
    label,
  );
};

/**
 * Render the modal's Formula (back) face as a confined Preact vnode.
 *
 * The back face renders:
 *
 * - A header band: the formula-type title, help text, and the
 *   formula identifier.
 * - An ordered property list, each row either a literal or a button
 *   that navigates to a referenced formula.
 *
 * Reference buttons are labeled by their property name in the formula
 * schema (per `designs/formula-inspector.md` "Reference-button label").
 * Clicking a reference button calls `onNavigateReference(identifier)`,
 * which the modal wires to "push current frame, open front face on
 * that identifier".
 *
 * The whole tree is rendered through `@endo/preact-container`'s
 * `renderConfined`, so the daemon-supplied property values, identifiers,
 * and reference-list entry keys reach the DOM only as escaped text — the
 * confinement boundary closes XSS on the untrusted interpolation that the
 * imperative predecessor escaped by hand via `textContent`.
 *
 * @param {object} props
 * @param {FormulaRecord} props.record
 * @param {(identifier: string, label: string) => void} props.onNavigateReference
 *   Called when the user clicks a reference button. The label is the
 *   schema property name (or `name -> entryKey` for reference-list
 *   entries), useful for back-stack breadcrumbs.
 * @param {number} [props.stackDepth]
 *   Total stack depth (including the back face's current entry). The
 *   header renders a "stack N/M" hint when greater than 1.
 * @param {number} [props.stackPosition]
 *   1-based position within the stack. Defaults to `stackDepth`.
 * @returns {VNode}
 */
export const FormulaView = ({
  record,
  onNavigateReference,
  stackDepth = 1,
  stackPosition = stackDepth,
}) => {
  const spec = getFormulaViewSpec(record.type);

  const headerChildren = [
    h(
      'div',
      {
        class: 'formula-view-title',
        id: 'formula-view-title',
        tabindex: '-1',
      },
      spec.header,
    ),
    h('div', { class: 'formula-view-help' }, spec.helpText),
    h(
      'div',
      { class: 'formula-view-identifier', title: 'Formula number' },
      record.number,
    ),
  ];
  if (stackDepth > 1) {
    headerChildren.push(
      h(
        'div',
        { class: 'formula-view-stack' },
        `stack ${stackPosition}/${stackDepth}`,
      ),
    );
  }
  const header = h(
    'div',
    { class: 'formula-view-header' },
    h('div', { class: 'formula-view-header-text' }, ...headerChildren),
  );

  // Compute the render order: declared properties first (in spec order),
  // then any properties present on the record but absent from the spec
  // (additive daemon changes always surface, never invisible).
  const declared = spec.propertyList.filter(p => {
    if (spec.omitProperties && spec.omitProperties.includes(p)) return false;
    return true;
  });
  const recordKeys = Object.keys(record.properties || {});
  const remainder = recordKeys.filter(k => {
    if (declared.includes(k)) return false;
    if (spec.omitProperties && spec.omitProperties.includes(k)) return false;
    return true;
  });
  const renderOrder = [...declared, ...remainder];

  if (renderOrder.length === 0) {
    return h(
      'div',
      null,
      header,
      h(
        'div',
        { class: 'formula-view-empty' },
        spec.emptyStateText ||
          'No formula properties to display for this type.',
      ),
    );
  }

  // Build the property-list children. A run of consecutive single-reference
  // properties shares one flex-wrap row so the buttons flow horizontally and
  // wrap, rather than each spanning a full grid row and stacking vertically (a
  // formula like `make-unconfined` or `host` otherwise produces a tall column
  // of buttons). The run resets whenever a labeled (literal / reference-list /
  // missing) property intervenes, so references stay grouped with their
  // neighbors in declared order.
  /** @type {VNode[]} */
  const dlChildren = [];
  /** @type {VNode[] | null} */
  let referenceRow = null;
  let rowKey = 0;

  const flushReferenceRow = () => {
    if (referenceRow && referenceRow.length > 0) {
      rowKey += 1;
      dlChildren.push(
        h(
          'div',
          { class: 'formula-view-reference-row', key: `refrow-${rowKey}` },
          ...referenceRow,
        ),
      );
    }
    referenceRow = null;
  };

  for (const name of renderOrder) {
    const label = (spec.overrideLabels || {})[name] || humanizeName(name);
    const prop = (record.properties || {})[name];

    if (prop !== undefined && prop.kind === 'reference') {
      // A single reference renders as one human-named button: the button name
      // is the label (no separate property-name cell, no stutter). Clicking it
      // inspects that value.
      if (referenceRow === null) referenceRow = [];
      referenceRow.push(
        referenceButton({
          label,
          identifier: prop.identifier,
          navLabel: name,
          onNavigateReference,
          solo: true,
        }),
      );
      // eslint-disable-next-line no-continue
      continue;
    }

    // End the current reference run; the next reference starts a fresh row
    // below this labeled property.
    flushReferenceRow();

    const dt = h('dt', { class: 'formula-view-property-name' }, label);

    /** @type {VNode} */
    let dd;
    if (prop === undefined) {
      dd = h(
        'dd',
        { class: 'formula-view-property-value formula-view-property-missing' },
        '(not yet exposed)',
      );
    } else if (prop.kind === 'literal') {
      dd = h(
        'dd',
        { class: 'formula-view-property-value' },
        h('pre', { class: 'formula-view-literal' }, formatLiteral(prop.value)),
      );
    } else if (prop.kind === 'reference-list') {
      const entries = prop.entries || {};
      const keys = Object.keys(entries);
      dd = h(
        'dd',
        { class: 'formula-view-property-value' },
        h(
          'div',
          { class: 'formula-view-reference-list' },
          keys.length === 0
            ? h('span', { class: 'formula-view-empty-list' }, '(empty)')
            : keys.map(key =>
                // Entry keys are user/code-supplied names (data), so they
                // render verbatim rather than humanized.
                h(
                  'span',
                  { key },
                  referenceButton({
                    label: key,
                    identifier: entries[key],
                    navLabel: `${name} -> ${key}`,
                    onNavigateReference,
                  }),
                ),
              ),
        ),
      );
    } else {
      dd = h(
        'dd',
        { class: 'formula-view-property-value formula-view-property-unknown' },
        '(unknown property kind)',
      );
    }
    dlChildren.push(dt, dd);
  }
  flushReferenceRow();

  // Add the privacy-suppression note if a property was omitted (today only
  // `keypair`'s `privateKey`, which the back face must never render).
  if (spec.omitProperties && spec.omitProperties.length > 0) {
    for (const omitted of spec.omitProperties) {
      dlChildren.push(
        h(
          'dt',
          {
            class:
              'formula-view-property-name formula-view-property-omitted-name',
            key: `omit-name-${omitted}`,
          },
          humanizeName(omitted),
        ),
        h(
          'dd',
          {
            class: 'formula-view-property-omitted',
            key: `omit-val-${omitted}`,
          },
          omitted === 'privateKey'
            ? 'Private key not displayed.'
            : 'Not displayed.',
        ),
      );
    }
  }

  return h(
    'div',
    null,
    header,
    h('dl', { class: 'formula-view-property-list' }, ...dlChildren),
  );
};
harden(FormulaView);
