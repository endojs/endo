import { ComponentChild, ContainerNode } from 'preact';

export { h, Fragment, createElement } from 'preact';

export interface SecureRenderOptions {
  /**
   * REPLACES the default set of HTML tag names that may be rendered.
   * Anything outside the list is replaced with a Fragment so the
   * offending element disappears while its children continue to render.
   */
  allowedTags?: Iterable<string>;
  /**
   * EXTENDS the default set of attribute names that may appear on a
   * DOM-element vnode. Additive: the built-in `DEFAULT_SAFE_ATTRS`
   * (a curated allowlist of standard HTML attrs) still apply,
   * and the entries listed here are added on top for this tree only.
   * `aria-*`, `data-*`, and `on*` event handlers are always allowed
   * and do not need to be enumerated.
   *
   * Attribute names are compared CASE-INSENSITIVELY; a host can write
   * `tabIndex` and the lookup will hit the lowercase `tabindex`
   * entry. Tightening the allowlist (rather than extending) is not
   * supported via this option — fork `DEFAULT_SAFE_ATTRS` if you
   * need a stricter baseline.
   */
  allowedAttrs?: Iterable<string>;
}

/**
 * A flat snapshot of the DOM target an event fired on. Only primitive,
 * read-only fields are exposed — there is no path back to the live element.
 */
export interface SafeEventTarget {
  readonly tagName: string | null;
  readonly name: string | null;
  readonly id: string | null;
  readonly type: string | null;
  readonly value: string | number | boolean | undefined;
  readonly checked: boolean | undefined;
  readonly selectedIndex: number | undefined;
}

/**
 * A sanitized facade over a DOM `Event`. Component code only ever receives
 * objects of this shape; the underlying DOM event is never reachable.
 */
export interface SafeEvent {
  readonly type: string;
  readonly timeStamp: number;
  readonly bubbles: boolean;
  readonly cancelable: boolean;
  readonly isTrusted: boolean;
  readonly eventPhase: number;
  readonly defaultPrevented: boolean;
  readonly target: SafeEventTarget | null;
  readonly currentTarget: SafeEventTarget | null;

  readonly key?: string;
  readonly code?: string;
  readonly keyCode?: number;
  readonly which?: number;
  readonly charCode?: number;
  readonly location?: number;
  readonly repeat?: boolean;
  readonly isComposing?: boolean;

  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;

  readonly button?: number;
  readonly buttons?: number;

  readonly clientX?: number;
  readonly clientY?: number;
  readonly pageX?: number;
  readonly pageY?: number;
  readonly screenX?: number;
  readonly screenY?: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
  readonly movementX?: number;
  readonly movementY?: number;

  readonly pointerId?: number;
  readonly pointerType?: string;
  readonly isPrimary?: boolean;

  readonly deltaX?: number;
  readonly deltaY?: number;
  readonly deltaZ?: number;
  readonly deltaMode?: number;

  preventDefault(): void;
  stopPropagation(): void;
  stopImmediatePropagation(): void;
}

export function renderConfined(
  vnode: ComponentChild,
  parentDom: ContainerNode,
  opts?: SecureRenderOptions,
): void;

export function unmount(parentDom: ContainerNode): void;

/**
 * Boundary that disables sanitization for everything rendered inside it.
 * Used by add-on layers (e.g. `@endo/preact-container/compartment`) to splice
 * host-trusted vnodes back into an otherwise-confined tree. Components
 * rendered below a `HostPassthrough` see real DOM events, real refs work,
 * etc. Use only with vnodes the host fully controls.
 */
export const HostPassthrough: import('preact').FunctionComponent<{
  children?: ComponentChild;
}>;

/**
 * Register an additional function reference as a trusted-exit
 * boundary. Internal extension point used by
 * `@endo/preact-container/compartment` to opt `OpaqueChild` in by
 * IDENTITY (without exposing a forge-able marker flag).
 *
 * SECURITY: any module that calls this can promote an arbitrary
 * function to a trusted-exit type — at which point any vnode of
 * that type will turn sanitization off for its subtree. Treat this
 * as a privileged API and only register references owned by
 * sibling addons, never an attacker-supplied function.
 */
export function _registerTrustedExitType(
  fn: (...args: unknown[]) => unknown,
): void;

/**
 * Register an additional function reference as a SECURE-REENTRY
 * boundary. A vnode whose type is registered here resets
 * `trustedExitDepth` to zero for its subtree, restoring it on
 * diffed/catchError. Used by `@endo/preact-container/compartment` so a
 * `Confined` mounted inside a `HostPassthrough` island still has its output
 * sanitized.
 *
 * SECURITY: the consequence of registration is just that
 * `trustedExitDepth` resets (which *increases* sanitization), so
 * this is less dangerous than `_registerTrustedExitType`. Throws if
 * `fn` is already registered as a trusted-exit type — the same
 * function in both sets would let setState-in-render mix the two
 * branches and flip sanitization off mid-render.
 */
export function _registerSecureReentryType(
  fn: (...args: unknown[]) => unknown,
): void;
