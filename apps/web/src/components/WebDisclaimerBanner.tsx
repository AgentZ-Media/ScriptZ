import { Show, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import { api } from "@scriptz/core/lib/api";
import { t } from "@scriptz/core/i18n";
import "./WebDisclaimerBanner.css";

const DISMISS_KEY = "web_disclaimer_dismissed_v1";
const LANDING_URL = "https://write-scriptz.com";

export function WebDisclaimerBanner() {
  const [ready, setReady] = createSignal(false);
  const [visible, setVisible] = createSignal(false);

  onMount(async () => {
    try {
      const raw = await api.getAppState(DISMISS_KEY);
      setVisible(raw !== "1");
    } catch {
      setVisible(true);
    } finally {
      setReady(true);
    }
  });

  const dismiss = () => {
    setVisible(false);
    void api.setAppState(DISMISS_KEY, "1").catch(() => {});
  };

  let bannerRef: HTMLDivElement | undefined;
  createEffect(() => {
    if (!(ready() && visible())) {
      document.documentElement.style.removeProperty("--web-header-offset");
      return;
    }
    if (!bannerRef) return;
    const update = () => {
      const h = bannerRef!.getBoundingClientRect().height;
      document.documentElement.style.setProperty(
        "--web-header-offset",
        `${Math.round(h)}px`,
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(bannerRef);
    onCleanup(() => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--web-header-offset");
    });
  });

  return (
    <Show when={ready() && visible()}>
      <div class="web-disclaimer" role="note" ref={bannerRef}>
        <div class="web-disclaimer-text">
          <strong>{t("web.disclaimer.title")}</strong>
          <span>
            {t("web.disclaimer.body")}{" "}
            <a href={LANDING_URL} target="_blank" rel="noopener">
              {t("web.disclaimer.link")}
            </a>
            .
          </span>
        </div>
        <button
          type="button"
          class="web-disclaimer-dismiss"
          aria-label={t("web.disclaimer.dismissAria")}
          onClick={dismiss}
        >
          {t("web.disclaimer.dismiss")}
        </button>
      </div>
    </Show>
  );
}
