import { For, Show, createSignal } from "solid-js";
import type { Folder } from "../../lib/types";
import { t } from "../../i18n";

export const SCRIPT_DRAG_MIME = "application/x-scriptz-script-id";

// UUIDv4: Version-Bit in der dritten Gruppe == "4", Variant-Bit in
// der vierten == 8/9/a/b. Strenger als ein generisches UUID-Match,
// damit ein fremder Drag-Source mit beliebig geformter ID nicht
// durchrutscht. Das App-weite Invariant "alle IDs sind UUIDv4".
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface FolderChipsProps {
  folders: Folder[];
  activeFolderId: string | null;
  allCount: number;
  onSelect: (folderId: string | null) => void;
  onCreateFolder: () => void;
  onChipContextMenu: (folder: Folder, ev: MouseEvent) => void;
  onDropScript: (folderId: string | null, scriptId: string) => void;
}

export function FolderChips(props: FolderChipsProps) {
  return (
    <div class="folder-chips-row">
      <div class="folder-chips-scroll" role="tablist" aria-label={t("folder.aria.tablist")}>
        <Chip
          label={t("folder.all")}
          count={props.allCount}
          active={props.activeFolderId === null}
          onClick={() => props.onSelect(null)}
          onDropScript={(id) => props.onDropScript(null, id)}
        />
        <Show when={props.folders.length > 0}>
          <span class="chip-divider" aria-hidden="true" />
        </Show>
        <For each={props.folders}>
          {(f) => (
            <Chip
              label={f.name}
              count={f.script_count}
              active={props.activeFolderId === f.id}
              onClick={() => props.onSelect(f.id)}
              onContextMenu={(e) => props.onChipContextMenu(f, e)}
              onDropScript={(id) => props.onDropScript(f.id, id)}
            />
          )}
        </For>
      </div>
      {/* "+ Ordner" liegt bewusst außerhalb des role="tablist", weil
          es kein Tab ist (würde sonst die ARIA-Tabs-Pattern-Semantik
          brechen - Tablist enthält ausschließlich role="tab"). */}
      <button
        class="folder-chips-new"
        onClick={() => props.onCreateFolder()}
        title={t("folder.new")}
        type="button"
      >
        {t("folder.newButton")}
      </button>
    </div>
  );
}

interface ChipProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  onContextMenu?: (e: MouseEvent) => void;
  onDropScript: (scriptId: string) => void;
}

function Chip(props: ChipProps) {
  const [over, setOver] = createSignal(false);
  return (
    <button
      class="folder-chip"
      classList={{
        "is-active": props.active,
        "is-drop-target": over(),
      }}
      role="tab"
      aria-selected={props.active}
      onClick={() => props.onClick()}
      onContextMenu={(e) => {
        if (props.onContextMenu) {
          e.preventDefault();
          props.onContextMenu(e);
        }
      }}
      onDragEnter={(e) => {
        if (e.dataTransfer?.types.includes(SCRIPT_DRAG_MIME)) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer?.types.includes(SCRIPT_DRAG_MIME)) {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        const id = e.dataTransfer?.getData(SCRIPT_DRAG_MIME);
        setOver(false);
        // ID-Format prüfen, bevor wir sie an die move-API geben.
        // Verhindert, dass ein fremder Drag-Source mit demselben MIME
        // garbage durchschiebt - die API würde es zwar nur als
        // "not found" ablehnen, aber der Toast wäre verwirrend.
        if (!id || !UUID_RE.test(id)) return;
        e.preventDefault();
        props.onDropScript(id);
      }}
    >
      <span class="folder-chip-label">{props.label}</span>
      <span class="folder-chip-count">{props.count}</span>
    </button>
  );
}
