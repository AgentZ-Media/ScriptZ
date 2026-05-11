// Sanity tests fuer den StorageAdapter-Slot.
//
// Validiert dass der `api`-Proxy aus ./api.ts wirklich durch
// `getStorageAdapter()` geht - sonst greift ein zukuenftiger
// `setStorageAdapter(webImpl)` fuer Bestandscode mit `api.*`-Calls
// nicht durch.

import { afterEach, describe, it, expect, vi } from "vitest";
import {
  setStorageAdapter,
  getStorageAdapter,
  type StorageAdapter,
} from "../storage";
import { api } from "../api";

// Stub-Factory: liefert einen StorageAdapter, bei dem alle 30+ Methoden
// per `vi.fn()` ausgegeben werden. Tests setzen einzelne Methoden auf
// echte Werte um, der Rest reicht als "wird nicht aufgerufen".
function stubAdapter(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  // Eager-eval default fields per Pflichtschluessel der Interface.
  // Wir nutzen einen Proxy: alles, was nicht overridden ist, wird ein
  // `vi.fn()` das ein leeres Resultat liefert.
  return new Proxy({} as StorageAdapter, {
    get(_, prop: string) {
      if (prop in overrides) return overrides[prop as keyof StorageAdapter];
      return vi.fn().mockResolvedValue(undefined);
    },
  });
}

const originalAdapter = getStorageAdapter();

afterEach(() => {
  // Nach jedem Test den Default-Adapter wiederherstellen, damit andere
  // Test-Files (die ueber `api.*` gehen) nicht in unseren Stub laufen.
  setStorageAdapter(originalAdapter);
});

describe("StorageAdapter slot", () => {
  it("api proxies through getStorageAdapter() (not a static bind)", async () => {
    const getScript = vi
      .fn()
      .mockResolvedValue({ id: "x", title: "PROXIED" });
    setStorageAdapter(stubAdapter({ getScript: getScript as never }));

    const result = await api.getScript("x");

    expect(getScript).toHaveBeenCalledWith("x");
    expect((result as { title: string }).title).toBe("PROXIED");
  });

  it("setStorageAdapter wirkt sofort - kein Re-Import noetig", async () => {
    const first = vi.fn().mockResolvedValue([{ id: "a" }] as never);
    const second = vi.fn().mockResolvedValue([{ id: "b" }] as never);

    setStorageAdapter(stubAdapter({ listFolders: first as never }));
    expect(await api.listFolders()).toEqual([{ id: "a" }]);
    expect(first).toHaveBeenCalledTimes(1);

    setStorageAdapter(stubAdapter({ listFolders: second as never }));
    expect(await api.listFolders()).toEqual([{ id: "b" }]);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1); // first nicht erneut gerufen
  });

  it("Default-Adapter ist nach Import von ./api registriert", () => {
    // Wenn api.ts beim Import setStorageAdapter() nicht aufruft, schlaegt
    // getStorageAdapter() mit Error - dieser Test wuerde dann scheitern.
    expect(() => getStorageAdapter()).not.toThrow();
    // Und der Default hat alle Methoden die das Interface verlangt.
    const a = getStorageAdapter();
    expect(typeof a.getScript).toBe("function");
    expect(typeof a.listScripts).toBe("function");
    expect(typeof a.createSnapshot).toBe("function");
    expect(typeof a.globalSearch).toBe("function");
    expect(typeof a.loadDailyStats).toBe("function");
  });
});
