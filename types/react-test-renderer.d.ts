// Minimal ambient typing for react-test-renderer (which ships no .d.ts and has no @types package in the lockfile).
// An ambient module declaration shadows a real one: delete this file if @types/react-test-renderer is ever installed.
// Minimal ambient typing for `react-test-renderer`, which ships no bundled
// `.d.ts` and has no matching `@types/react-test-renderer` in this repo's
// lockfile (adding one is a new dependency, which item B3's scope avoids).
// Covers exactly the surface the B3 component tests use — expand if a later
// test needs more of the real (much larger) API.
declare module "react-test-renderer" {
  import type { ReactElement } from "react";

  export interface ReactTestInstance {
    type: unknown;
    props: Record<string, any>;
    parent: ReactTestInstance | null;
    children: (ReactTestInstance | string)[];
    find(predicate: (node: ReactTestInstance) => boolean): ReactTestInstance;
    findAll(predicate: (node: ReactTestInstance) => boolean): ReactTestInstance[];
    findByType(type: unknown): ReactTestInstance;
    findAllByType(type: unknown): ReactTestInstance[];
    findByProps(props: Record<string, any>): ReactTestInstance;
    findAllByProps(props: Record<string, any>): ReactTestInstance[];
  }

  export interface ReactTestRenderer {
    root: ReactTestInstance;
    toJSON(): unknown;
    unmount(): void;
    update(element: ReactElement): void;
  }

  export function create(
    element: ReactElement,
    options?: Record<string, any>,
  ): ReactTestRenderer;

  export function act<T>(callback: () => T): T;
}
