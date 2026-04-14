/**
 * Preact compatibility shim used by component wrappers.
 *
 * Component files in this package use `React.createElement(...)` directly
 * (originally a port from a React-based implementation). Instead of rewriting
 * every call site to `h(...)`, we expose a tiny object that aliases
 * `createElement` to Preact's `h`.
 */

import { h } from 'preact';
import type { ComponentChildren } from 'preact';

export const React = { createElement: h } as const;

/**
 * Unify ReactNode with Preact's ComponentChildren so component prop types
 * can keep the familiar React naming.
 */
export type ReactNode = ComponentChildren;
