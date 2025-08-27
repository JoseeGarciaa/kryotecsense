/// <reference types="react" />
/// <reference types="react-dom" />

declare module 'react/jsx-runtime' {
  export * from 'react/jsx-runtime';
}

declare module 'react/jsx-dev-runtime' {
  export * from 'react/jsx-dev-runtime';
}

// Declaraciones globales para JSX
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

export {};
