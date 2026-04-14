/**
 * JSX augmentation: declare the pbl-* intrinsic elements that the
 * reconciler handles. Imported for side effects from `components/index.tsx`.
 */

import type { ComponentChildren } from 'preact';

interface IntrinsicPblProps {
  children?: ComponentChildren;
  // Loose escape hatch — the typed wrappers in each component file
  // provide the real prop surface.
  [key: string]: unknown;
}

declare module 'preact' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'pbl-root': IntrinsicPblProps;
      'pbl-rect': IntrinsicPblProps;
      'pbl-circle': IntrinsicPblProps;
      'pbl-text': IntrinsicPblProps;
      'pbl-line': IntrinsicPblProps;
      'pbl-image': IntrinsicPblProps;
      'pbl-group': IntrinsicPblProps;
      'pbl-statusbar': IntrinsicPblProps;
      'pbl-actionbar': IntrinsicPblProps;
      'pbl-path': IntrinsicPblProps;
      'pbl-scrollable': IntrinsicPblProps;
      'pbl-arc': IntrinsicPblProps;
      'pbl-textflow': IntrinsicPblProps;
    }
  }
}

export {};
