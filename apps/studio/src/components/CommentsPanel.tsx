import { createSignal, For, Show } from "solid-js";
import { convex, createQuery } from "../lib/convex";
import { api } from "../../convex/_generated/api";
import { relativeTime, withToast } from "../lib/ui";
import { Empty } from "./ui";

type TargetType = "idea" | "script";

export function CommentsPanel(props: { targetType: TargetType; targetId: string }) {
  const comments = createQuery(api.comments.listForTarget, () => ({
    targetType: props.targetType,
    targetId: props.targetId,
  }));
  const [draft, setDraft] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const send = async () => {
    const body = draft().trim();
    if (!body) return;
    setBusy(true);
    const ok = await withToast(() =>
      convex.mutation(api.comments.add, {
        targetType: props.targetType,
        targetId: props.targetId,
        body,
      }),
    );
    setBusy(false);
    if (ok !== undefined) setDraft("");
  };

  return (
    <div class="comments">
      <h3 class="comments-head">Anmerkungen</h3>
      <Show
        when={(comments.data()?.length ?? 0) > 0}
        fallback={<p class="comments-empty">Noch keine Anmerkungen.</p>}
      >
        <ul class="comment-list">
          <For each={comments.data()}>
            {(c) => (
              <li class={`comment ${c.resolved ? "is-resolved" : ""}`}>
                <div class="comment-meta">
                  <span class="comment-author">{c.authorName}</span>
                  <span class={`badge badge-role`}>
                    {c.authorRole === "agency" ? "Agentur" : "Kunde"}
                  </span>
                  <span class="comment-time">{relativeTime(c.createdAt)}</span>
                </div>
                <p class="comment-body">{c.body}</p>
                <div class="comment-actions">
                  <button
                    class="btn btn-ghost btn-sm"
                    onClick={() =>
                      void withToast(() =>
                        convex.mutation(api.comments.setResolved, {
                          commentId: c.id,
                          resolved: !c.resolved,
                        }),
                      )
                    }
                  >
                    {c.resolved ? "Wieder öffnen" : "Erledigt"}
                  </button>
                  <Show when={c.mine}>
                    <button
                      class="btn btn-ghost btn-sm"
                      onClick={() =>
                        void withToast(() =>
                          convex.mutation(api.comments.remove, { commentId: c.id }),
                        )
                      }
                    >
                      Löschen
                    </button>
                  </Show>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <div class="comment-compose">
        <textarea
          class="textarea"
          rows="2"
          placeholder="Anmerkung schreiben …"
          value={draft()}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void send();
          }}
        />
        <button class="btn btn-primary btn-sm" disabled={busy() || !draft().trim()} onClick={() => void send()}>
          Senden
        </button>
      </div>
    </div>
  );
}
