import { createSignal } from "solid-js";

const [version, setVersion] = createSignal(0);

export const foldersBus = {
  version,
  bump() {
    setVersion(version() + 1);
  },
};
