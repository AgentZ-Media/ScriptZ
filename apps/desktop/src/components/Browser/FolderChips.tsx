import { For, Show, createSignal } from "solid-js";
import type { Folder } from "~/lib/types";

export const SCRIPT_DRAG_MIME = "application/x-scriptz-script-id";

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
      <div class="folder-chips-scroll" role="tablist" aria-label="Ordner">
        <Chip
          label="Alle"
          count={props.allCount}
          active={props.activeFolderId === null}
          onClick={() => props.onSelect(null)}
          onDropScript={(id) => props.onDropScript(null, id)}
        />
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
      <button
        class="btn btn-ghost folder-chips-new"
        onClick={() => props.onCreateFolder()}
        title="Neuer Ordner"
      >
        <span aria-hidden="true">+</span>
        <span>Neuer Ordner</span>
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
        if (!id) return;
        e.preventDefault();
        props.onDropScript(id);
      }}
    >
      <span class="folder-chip-icon" aria-hidden="true">
        <FolderIcon />
      </span>
      <span class="folder-chip-label">{props.label}</span>
      <Show when={props.count > 0 || props.active}>
        <span class="folder-chip-count">{props.count}</span>
      </Show>
    </button>
  );
}

function FolderIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M2 5.5a1 1 0 0 1 1-1h3l1.5 1.5h5.5a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
    </svg>
  );
}
