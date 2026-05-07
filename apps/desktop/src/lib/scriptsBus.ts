import { createSignal } from "solid-js";

/**
 * Global "scripts changed" version. Anything that mutates the script
 * list (create / archive / restore / duplicate / purge / rename) bumps
 * the version. The Browser reads it as part of its query key so the
 * list refetches no matter which view triggered the change.
 */
const [version, setVersion] = createSignal(0);

export const scriptsBus = {
  version,
  bump() {
    setVersion(version() + 1);
  },
};
