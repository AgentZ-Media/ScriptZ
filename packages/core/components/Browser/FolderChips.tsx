import { For, Show, createSignal } from "solid-js";
import type { Folder } from "../../lib/types";
import { t } from "../../i18n";

export const SCRIPT_DRAG_MIME = "application/x-scriptz-script-id";

// UUIDv4: version bit in the third group == "4", variant bit in
// the fourth == 8/9/a/b. Stricter than a generic UUID match,
// so a foreign drag source with an arbitrarily shaped ID doesn't
// slip through. The app-wide invariant is "all IDs are UUIDv4".
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
              isFolder
              onClick={() => props.onSelect(f.id)}
              onContextMenu={(e) => props.onChipContextMenu(f, e)}
              onDropScript={(id) => props.onDropScript(f.id, id)}
            />
          )}
        </For>
      </div>
      {/* "+ Folder" is intentionally placed outside role="tablist"
          because it isn't a tab (placing it inside would break the
          ARIA tabs-pattern semantics - tablist must only contain
          role="tab"). */}
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
  isFolder?: boolean;
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
        "is-folder": !!props.isFolder,
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
          // Belt-and-suspenders: dragover fires continuously while
          // the cursor is over the chip (or a child). If dragleave
          // flipped the highlight off while moving onto a child element,
          // we reliably bring it back here.
          if (!over()) setOver(true);
        }
      }}
      onDragLeave={(e) => {
        // dragleave also fires when the cursor only moves onto a child
        // element. We detect a real leave via relatedTarget being
        // outside the chip (or null, e.g. when leaving
        // the window).
        const next = e.relatedTarget as Node | null;
        if (next && (e.currentTarget as Node).contains(next)) return;
        setOver(false);
      }}
      onDrop={(e) => {
        const id = e.dataTransfer?.getData(SCRIPT_DRAG_MIME);
        setOver(false);
        // Check the ID format before passing it to the move API.
        // Prevents a foreign drag source with the same MIME from
        // pushing garbage through - the API would only reject it as
        // "not found", but the toast would be confusing.
        if (!id || !UUID_RE.test(id)) return;
        e.preventDefault();
        props.onDropScript(id);
      }}
    >
      <Show when={props.isFolder}>
        <span class="folder-chip-icon" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M1.75 4.25c0-.69.56-1.25 1.25-1.25h3.13c.33 0 .65.13.88.37l1.12 1.13H13c.69 0 1.25.56 1.25 1.25v6.5c0 .69-.56 1.25-1.25 1.25H3c-.69 0-1.25-.56-1.25-1.25v-8Z"
              stroke="currentColor"
              stroke-width="1.25"
              stroke-linejoin="round"
            />
          </svg>
        </span>
      </Show>
      <span class="folder-chip-label">{props.label}</span>
      <span class="folder-chip-count">{props.count}</span>
    </button>
  );
}
