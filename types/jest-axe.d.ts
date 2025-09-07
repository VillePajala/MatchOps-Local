declare module 'jest-axe' {
  export interface AxeResults {
    violations: Array<{
      id: string;
      impact: string;
      tags: string[];
      description: string;
      help: string;
      helpUrl: string;
      nodes: Array<{
        any: any[];
        all: any[];
        none: any[];
        impact: string;
        html: string;
        target: string[];
      }>;
    }>;
    passes: any[];
    incomplete: any[];
    inapplicable: any[];
  }

  export function axe(container: Element | Document): Promise<AxeResults>;
  export function configureAxe(options?: any): any;
  export const toHaveNoViolations: { [key: string]: any };
}

declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveNoViolations(): R;
    }
  }
}

declare module '@jest/expect' {
  interface Matchers<R> {
    toHaveNoViolations(): R;
  }
}