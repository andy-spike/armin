export {};

declare global {
  interface Window {
    /** Set by browser automation to expose graph debugging hooks. */
    __ARMIN_E2E__?: boolean;
  }
}
