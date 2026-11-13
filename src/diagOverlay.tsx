import { useEffect, useState } from "react";
import { api, selfTest } from "./api";

/* 诊断浮层（仅 __DIAG__ 构建启用）：
   把 selfTest 全链路结果 + 网络失败记录直接显示在屏幕上，
   解决安卓上 debug.log 拿不到、剪贴板写不进去的问题。 */

type Rec = { t: string; kind: string; detail: string };

let records: Rec[] = [];
let notify: (() => void) | null = null;

function push(kind: string, detail: string) {
  records = [...records.slice(-119), { t: new Date().toISOString().slice(11, 19), kind, detail }];
  notify?.();
}

let patched = false;
function patchNetwork() {
  if (patched) return;
  patched = true;

  const origFetch = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    try {
      const r = await origFetch(input as RequestInfo, init);
      if (!r.ok || url.includes("hg.localhost")) push("fetch", `${r.status} ${url.slice(0, 140)}`);
      return r;
    } catch (e) {
      push("fetch-err", `${(e as Error)?.message ?? e} ${url.slice(0, 140)}`);
      throw e;
    }
  }) as typeof window.fetch;

  const xo = XMLHttpRequest.prototype.open;
  const xs = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest & { __u?: string }, method: string, url: string, ...rest: unknown[]) {
    this.__u = url;
    return (xo as unknown as (...a: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest & { __u?: string }, ...args: unknown[]) {
    this.addEventListener("error", () => push("xhr-err", String(this.__u).slice(0, 140)));
    this.addEventListener("load", () => { if (this.status >= 400) push("xhr", `${this.status} ${String(this.__u).slice(0, 140)}`); });
    return xs.apply(this, args as []);
  } as typeof XMLHttpRequest.prototype.send;
}

export default function DiagOverlay() {
  const [lines, setLines] = useState<string[]>([]);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    patchNetwork();
    notify = () => setLines(records.map((r) => `${r.t} [${r.kind}] ${r.detail}`));
    const onErr = (e: ErrorEvent) => push("window-error", String(e.message).slice(0, 160));
    const onRej = (e: PromiseRejectionEvent) =>
      push("unhandled", String((e.reason && (e.reason.stack || e.reason.message)) || e.reason).slice(0, 160));
    const origCE = console.error.bind(console);
    console.error = (...a: unknown[]) => {
      try { push("console", a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ").slice(0, 160)); } catch { /* ignore */ }
      origCE(...a);
    };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    void run();
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
      console.error = origCE;
      notify = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    setBusy(true);
    push("diag", `== 开始自检 platform=${navigator.userAgent.includes("Android") ? "android" : "other"} ==`);
    try {
      const st = await selfTest();
      push("selfTest", st);
    } catch (e) {
      push("selfTest-err", String((e as Error)?.message ?? e));
    }
    try {
      const nd = await api.netDiag();
      push("netDiag", JSON.stringify(nd));
    } catch (e) {
      push("netDiag-err", String((e as Error)?.message ?? e));
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ position: "fixed", right: 10, bottom: 90, zIndex: 99999, padding: "6px 10px", borderRadius: 8, background: "#1f6feb", color: "#fff", fontSize: 12, border: "none" }}
      >
        诊断
      </button>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,.93)", color: "#7CFC9A", fontSize: 11, display: "flex", flexDirection: "column", padding: 10, boxSizing: "border-box" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button onClick={() => void run()} disabled={busy} style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: "#1f6feb", color: "#fff", fontSize: 12 }}>
          {busy ? "检测中…" : "重新自检"}
        </button>
        <button onClick={() => { records = []; setLines([]); }} style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: "#333", color: "#fff", fontSize: 12 }}>
          清空
        </button>
        <button onClick={() => setOpen(false)} style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: "#7a1f1f", color: "#fff", fontSize: 12 }}>
          关闭
        </button>
      </div>
      <pre style={{ flex: 1, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0, fontFamily: "monospace", lineHeight: 1.35 }}>
        {lines.join("\n") || "等待记录…"}
      </pre>
    </div>
  );
}
