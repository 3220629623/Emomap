"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type NoteSummary = {
  id: string;
  x: number;
  y: number;
  cell_x: number;
  cell_y: number;
  color: string;
  text_preview: string;
  created_at: string;
};

type Detail = {
  note: { id: string; user_id: string; x: number; y: number; color: string; text: string; created_at: string };
  images: Array<{ id: number; url: string }>;
};

type Camera = { x: number; y: number; zoom: number; width: number; height: number };
type Draft = { x: number; y: number; text: string; color: string; images: string[] };

const CELL_SIZE = 1024;
const NOTE_W = 56;
const NOTE_H = 42;
const COLORS = ["#ffdf6e", "#ffa6c1", "#9ee493", "#9bd7ff", "#d8b4fe", "#ffffff"];

function getDeviceId() {
  const key = "infinite-note-device-id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID().replaceAll("-", "");
  localStorage.setItem(key, created);
  return created;
}

async function readJson<T>(response: Response, fallback: T): Promise<T> {
  const text = await response.text();
  if (!text.trim()) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function isMobile() {
  return window.innerWidth <= 760 || window.matchMedia("(pointer: coarse)").matches;
}

function canvasRatio() {
  return Math.min(window.devicePixelRatio || 1, isMobile() ? 1.2 : 1.75);
}

function worldToScreen(x: number, y: number, camera: Camera) {
  return { x: (x - camera.x) * camera.zoom + camera.width / 2, y: (y - camera.y) * camera.zoom + camera.height / 2 };
}

function screenToWorld(x: number, y: number, camera: Camera) {
  return { x: (x - camera.width / 2) / camera.zoom + camera.x, y: (y - camera.height / 2) / camera.zoom + camera.y };
}

function viewportCells(camera: Camera, padding: number) {
  const left = camera.x - camera.width / 2 / camera.zoom;
  const right = camera.x + camera.width / 2 / camera.zoom;
  const top = camera.y - camera.height / 2 / camera.zoom;
  const bottom = camera.y + camera.height / 2 / camera.zoom;
  const cells: string[] = [];
  for (let cx = Math.floor(left / CELL_SIZE) - padding; cx <= Math.floor(right / CELL_SIZE) + padding; cx += 1) {
    for (let cy = Math.floor(top / CELL_SIZE) - padding; cy <= Math.floor(bottom / CELL_SIZE) + padding; cy += 1) {
      cells.push(`${cx},${cy}`);
    }
  }
  return cells;
}

function crisp(value: number) {
  return Math.round(value) + 0.5;
}

function drawAxis(ctx: CanvasRenderingContext2D, camera: Camera) {
  const origin = worldToScreen(0, 0, camera);
  ctx.save();
  ctx.font = "12px ui-sans-serif, system-ui";
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(15, 118, 110, 0.48)";
  ctx.fillStyle = "#0f766e";
  if (origin.y >= 0 && origin.y <= camera.height) {
    ctx.beginPath();
    ctx.moveTo(0, crisp(origin.y));
    ctx.lineTo(camera.width, crisp(origin.y));
    ctx.stroke();
    ctx.fillText("X axis", 12, Math.max(14, origin.y - 8));
  }
  if (origin.x >= 0 && origin.x <= camera.width) {
    ctx.beginPath();
    ctx.moveTo(crisp(origin.x), 0);
    ctx.lineTo(crisp(origin.x), camera.height);
    ctx.stroke();
    ctx.fillText("Y axis", Math.min(camera.width - 46, origin.x + 8), 18);
  }
  if (origin.x >= -20 && origin.x <= camera.width + 20 && origin.y >= -20 && origin.y <= camera.height + 20) {
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText("0,0", origin.x + 8, origin.y - 8);
  }
  ctx.restore();
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1, width: 1000, height: 700 });
  const notesRef = useRef<Map<string, NoteSummary>>(new Map());
  const loadedCellsRef = useRef<Set<string>>(new Set());
  const pointerRef = useRef({ dragging: false, moved: false, lastX: 0, lastY: 0, pinchDistance: 0, pinchZoom: 1 });
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const mobileRef = useRef(false);
  const dirtyRef = useRef(true);
  const fetchTimerRef = useRef<number | null>(null);

  const [deviceId, setDeviceId] = useState("");
  const [writeCredits, setWriteCredits] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [payment, setPayment] = useState<{ outTradeNo: string; qrDataUrl: string } | null>(null);
  const [mockOpen, setMockOpen] = useState(false);
  const [mockCode, setMockCode] = useState("");
  const [message, setMessage] = useState("Drag the paper, pinch or wheel to zoom, tap blank space to write.");
  const [coordX, setCoordX] = useState("");
  const [coordY, setCoordY] = useState("");
  const [centerLabel, setCenterLabel] = useState("X 0, Y 0");
  const [gridLabel, setGridLabel] = useState("1 grid = 64 coords");
  const [busy, setBusy] = useState(false);
  const [loadingCells, setLoadingCells] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const apiHeaders = useMemo(() => ({ "x-device-id": deviceId }), [deviceId]);
  const markDirty = useCallback(() => { dirtyRef.current = true; }, []);
  const updateCenterLabel = useCallback(() => {
    const camera = cameraRef.current;
    setCenterLabel(`X ${Math.round(camera.x)}, Y ${Math.round(camera.y)}`);
    const baseGrid = mobileRef.current ? 96 : 64;
    const grid = Math.max(mobileRef.current ? 28 : 18, baseGrid * camera.zoom);
    setGridLabel(`1 grid = ${Math.round(grid / camera.zoom)} coords`);
  }, []);

  const refreshMe = useCallback(async () => {
    if (!deviceId) return;
    const response = await fetch("/api/me", { headers: apiHeaders });
    const data = await readJson<{ writeCredits?: number }>(response, {});
    if (response.ok) setWriteCredits(data.writeCredits ?? 0);
  }, [apiHeaders, deviceId]);

  const pruneNotes = useCallback(() => {
    const keep = new Set(viewportCells(cameraRef.current, mobileRef.current ? 1 : 2));
    for (const [id, note] of notesRef.current) {
      if (!keep.has(`${note.cell_x},${note.cell_y}`)) notesRef.current.delete(id);
    }
  }, []);

  const fetchCells = useCallback(async () => {
    const cells = viewportCells(cameraRef.current, mobileRef.current ? 1 : 2);
    const missing = cells.filter((cell) => !loadedCellsRef.current.has(cell));
    pruneNotes();
    if (!missing.length) {
      setLoadedOnce(true);
      markDirty();
      return;
    }

    setLoadingCells(true);
    setMessage(loadedOnce ? "Loading nearby notes..." : "Loading the first paper area...");
    missing.forEach((cell) => loadedCellsRef.current.add(cell));

    try {
      const response = await fetch(`/api/notes/cells?cells=${encodeURIComponent(missing.join(";"))}`);
      const data = await readJson<{ notes?: NoteSummary[]; error?: string }>(response, { notes: [] });
      if (!response.ok) {
        missing.forEach((cell) => loadedCellsRef.current.delete(cell));
        setMessage(data.error ?? "Loading failed. Move a little or refresh.");
        return;
      }
      for (const note of data.notes ?? []) notesRef.current.set(note.id, note);
      pruneNotes();
      setLoadedOnce(true);
      setMessage("Drag the paper, pinch or wheel to zoom, tap blank space to write.");
      markDirty();
    } catch {
      missing.forEach((cell) => loadedCellsRef.current.delete(cell));
      setMessage("Network is slow. Still here, try moving a little or refresh.");
    } finally {
      setLoadingCells(false);
    }
  }, [loadedOnce, markDirty, pruneNotes]);

  const scheduleFetch = useCallback(() => {
    if (fetchTimerRef.current) window.clearTimeout(fetchTimerRef.current);
    fetchTimerRef.current = window.setTimeout(() => {
      fetchTimerRef.current = null;
      void fetchCells();
    }, mobileRef.current ? 220 : 120);
  }, [fetchCells]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const camera = cameraRef.current;
    const ratio = canvasRatio();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = "#fbfcff";
    ctx.fillRect(0, 0, camera.width, camera.height);

    ctx.save();
    ctx.globalAlpha = mobileRef.current ? 0.34 : 0.55;
    ctx.strokeStyle = "#d8dee8";
    ctx.lineWidth = 1;
    const grid = Math.max(mobileRef.current ? 28 : 18, (mobileRef.current ? 96 : 64) * camera.zoom);
    const ox = ((-camera.x * camera.zoom + camera.width / 2) % grid + grid) % grid;
    const oy = ((-camera.y * camera.zoom + camera.height / 2) % grid + grid) % grid;
    for (let x = ox; x <= camera.width; x += grid) { ctx.beginPath(); ctx.moveTo(crisp(x), 0); ctx.lineTo(crisp(x), camera.height); ctx.stroke(); }
    for (let y = oy; y <= camera.height; y += grid) { ctx.beginPath(); ctx.moveTo(0, crisp(y)); ctx.lineTo(camera.width, crisp(y)); ctx.stroke(); }
    ctx.restore();
    drawAxis(ctx, camera);

    const now = performance.now();
    const maxVisible = mobileRef.current ? 900 : 2600;
    let drawn = 0;
    for (const note of notesRef.current.values()) {
      if (drawn >= maxVisible) break;
      const point = worldToScreen(note.x, note.y, camera);
      const scale = Math.max(0.58, Math.min(1.28, camera.zoom));
      const w = NOTE_W * scale;
      const h = NOTE_H * scale;
      if (point.x < -w || point.y < -h || point.x > camera.width + w || point.y > camera.height + h) continue;
      const bob = mobileRef.current ? 0 : Math.sin(now / 900 + note.x * 0.01) * 1.2;
      ctx.save();
      ctx.translate(point.x, point.y + bob);
      ctx.rotate(mobileRef.current ? 0 : Math.sin(note.x + note.y) * 0.05);
      ctx.fillStyle = "rgba(15, 23, 42, 0.13)";
      ctx.fillRect(-w / 2 + 4, -h / 2 + 5, w, h);
      ctx.fillStyle = note.color;
      ctx.strokeStyle = "#263241";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(15, 23, 42, 0.32)";
      ctx.fillRect(-w / 2 + 9, -h / 2 + 12, w - 18, 2);
      ctx.fillRect(-w / 2 + 9, -h / 2 + 21, w - 24, 2);
      ctx.restore();
      drawn += 1;
    }
    dirtyRef.current = false;
  }, []);

  useEffect(() => { setDeviceId(getDeviceId()); }, []);
  useEffect(() => { refreshMe(); }, [refreshMe]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      mobileRef.current = isMobile();
      const ratio = canvasRatio();
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      cameraRef.current.width = width;
      cameraRef.current.height = height;
      loadedCellsRef.current.clear();
      markDirty();
      void fetchCells();
    };
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
    return () => { window.removeEventListener("resize", resize); window.removeEventListener("orientationchange", resize); };
  }, [fetchCells, markDirty]);

  useEffect(() => {
    let frame = 0;
    let lastDesktopDraw = 0;
    const tick = (time: number) => {
      if (mobileRef.current) {
        if (dirtyRef.current) draw();
      } else if (dirtyRef.current || time - lastDesktopDraw > 48) {
        draw();
        lastDesktopDraw = time;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [draw]);

  useEffect(() => {
    const timer = window.setInterval(() => scheduleFetch(), mobileRef.current ? 900 : 500);
    return () => window.clearInterval(timer);
  }, [scheduleFetch]);

  useEffect(() => {
    if (!payment) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/wechat/orders/${payment.outTradeNo}`, { headers: apiHeaders });
      const data = await readJson<{ payment?: { status: string } }>(response, {});
      if (data.payment?.status === "paid") {
        setPayment(null);
        setMessage("Payment done. You have 1 write credit.");
        await refreshMe();
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [apiHeaders, payment, refreshMe]);


  const goToCoordinate = () => {
    const x = Number(coordX);
    const y = Number(coordY);
    if (!coordX.trim() || !coordY.trim()) {
      setMessage("Type X and Y coordinates, for example X 1200 and Y -300.");
      return;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      setMessage("Coordinate is not valid.");
      return;
    }
    cameraRef.current.x = x;
    cameraRef.current.y = y;
    loadedCellsRef.current.clear();
    updateCenterLabel();
    scheduleFetch();
    markDirty();
    setMessage(`Centered at X ${Math.round(x)}, Y ${Math.round(y)}.`);
  };
  const findNoteAt = (screenX: number, screenY: number) => {
    const camera = cameraRef.current;
    for (const note of Array.from(notesRef.current.values()).reverse()) {
      const point = worldToScreen(note.x, note.y, camera);
      const scale = Math.max(0.58, Math.min(1.28, camera.zoom));
      const w = NOTE_W * scale;
      const h = NOTE_H * scale;
      if (Math.abs(screenX - point.x) <= w / 2 && Math.abs(screenY - point.y) <= h / 2) return note;
    }
    return null;
  };

  const openDetail = async (id: string) => {
    const response = await fetch(`/api/notes/${id}`);
    if (!response.ok) return;
    setDetail(await readJson<Detail>(response, { note: { id, user_id: "", x: 0, y: 0, color: "#fff", text: "", created_at: "" }, images: [] }));
  };

  const startPayment = async () => {
    if (!deviceId) return;
    setBusy(true);
    const response = await fetch("/api/wechat/native", { method: "POST", headers: apiHeaders });
    setBusy(false);
    const data = await readJson<{ outTradeNo?: string; qrDataUrl?: string; error?: string }>(response, {});
    if (!response.ok || !data.outTradeNo || !data.qrDataUrl) { setMessage(data.error ?? "Wechat order failed."); return; }
    setPayment({ outTradeNo: data.outTradeNo, qrDataUrl: data.qrDataUrl });
  };

  const simulatePayment = async () => {
    if (!deviceId) return;
    setBusy(true);
    const response = await fetch("/api/dev/mock-payment", {
      method: "POST",
      headers: { ...apiHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ code: mockCode })
    });
    setBusy(false);
    const data = await readJson<{ writeCredits?: number; error?: string }>(response, {});
    if (!response.ok) { setMessage(data.error ?? "Mock payment failed."); return; }
    setWriteCredits(data.writeCredits ?? writeCredits + 1);
    setMockOpen(false);
    setMockCode("");
    setMessage("Mock payment done. You have 1 write credit.");
  };

  const publishDraft = async () => {
    if (!draft) return;
    setBusy(true);
    const response = await fetch("/api/notes/publish", {
      method: "POST",
      headers: { ...apiHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(draft)
    });
    setBusy(false);
    const data = await readJson<{ note?: NoteSummary; error?: string }>(response, {});
    if (!response.ok || !data.note) { setMessage(data.error ?? "Publish failed."); return; }
    notesRef.current.set(data.note.id, data.note);
    setDraft(null);
    markDirty();
    await refreshMe();
  };

  const changeColor = async (color: string) => {
    if (!detail) return;
    const response = await fetch(`/api/notes/${detail.note.id}`, {
      method: "PATCH",
      headers: { ...apiHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ color })
    });
    const data = await readJson<{ error?: string }>(response, {});
    if (!response.ok) { setMessage(data.error ?? "Color update failed."); return; }
    const old = notesRef.current.get(detail.note.id);
    if (old) notesRef.current.set(detail.note.id, { ...old, color });
    setDetail({ ...detail, note: { ...detail.note, color } });
    markDirty();
  };

  const uploadImages = async (files: FileList | null) => {
    if (!draft || !files) return;
    const uploaded: string[] = [];
    for (const file of Array.from(files).slice(0, 6 - draft.images.length)) {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/uploads", { method: "POST", body: form });
      const data = await readJson<{ url?: string }>(response, {});
      if (response.ok && data.url) uploaded.push(data.url);
    }
    setDraft({ ...draft, images: [...draft.images, ...uploaded] });
  };

  return (
    <main className="appShell">
      <canvas
        ref={canvasRef}
        className="mapCanvas"
        onPointerDown={(event) => {
          activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          const points = Array.from(activePointersRef.current.values());
          if (points.length === 2) {
            pointerRef.current.pinchDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
            pointerRef.current.pinchZoom = cameraRef.current.zoom;
          } else {
            pointerRef.current = { ...pointerRef.current, dragging: true, moved: false, lastX: event.clientX, lastY: event.clientY };
          }
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!activePointersRef.current.has(event.pointerId)) return;
          activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          const points = Array.from(activePointersRef.current.values());
          const camera = cameraRef.current;
          if (points.length === 2) {
            const center = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
            const before = screenToWorld(center.x, center.y, camera);
            const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
            if (pointerRef.current.pinchDistance > 0) {
              camera.zoom = Math.max(0.25, Math.min(3, pointerRef.current.pinchZoom * (distance / pointerRef.current.pinchDistance)));
              const after = screenToWorld(center.x, center.y, camera);
              camera.x += before.x - after.x;
              camera.y += before.y - after.y;
              pointerRef.current.moved = true;
              scheduleFetch();
              markDirty();
            }
            return;
          }
          const pointer = pointerRef.current;
          if (!pointer.dragging) return;
          const dx = event.clientX - pointer.lastX;
          const dy = event.clientY - pointer.lastY;
          if (Math.abs(dx) + Math.abs(dy) > 3) pointer.moved = true;
          pointer.lastX = event.clientX;
          pointer.lastY = event.clientY;
          camera.x -= dx / camera.zoom;
          camera.y -= dy / camera.zoom;
          scheduleFetch();
          markDirty();
        }}
        onPointerUp={(event) => {
          activePointersRef.current.delete(event.pointerId);
          const pointer = pointerRef.current;
          pointer.dragging = false;
          pointer.pinchDistance = 0;
          if (pointer.moved) { scheduleFetch(); markDirty(); return; }
          const hit = findNoteAt(event.clientX, event.clientY);
          if (hit) { void openDetail(hit.id); return; }
          const point = screenToWorld(event.clientX, event.clientY, cameraRef.current);
          setDraft({ x: point.x, y: point.y, text: "", color: COLORS[0], images: [] });
        }}
        onPointerCancel={(event) => {
          activePointersRef.current.delete(event.pointerId);
          pointerRef.current.dragging = false;
          pointerRef.current.pinchDistance = 0;
        }}
        onWheel={(event) => {
          event.preventDefault();
          const camera = cameraRef.current;
          const before = screenToWorld(event.clientX, event.clientY, camera);
          camera.zoom = Math.max(0.25, Math.min(3, camera.zoom * (event.deltaY > 0 ? 0.9 : 1.1)));
          const after = screenToWorld(event.clientX, event.clientY, camera);
          camera.x += before.x - after.x;
          camera.y += before.y - after.y;
          loadedCellsRef.current.clear();
          scheduleFetch();
          markDirty();
        }}
      />

      <div className="topbar">
        <div className="brand"><div className="brandMark" /><div><strong>EmoMap</strong><span>by Mr.Ji</span></div></div>
        <form className="coordSearch" onSubmit={(event) => { event.preventDefault(); goToCoordinate(); }}>
          <label>X<input value={coordX} onChange={(event) => setCoordX(event.target.value)} placeholder="0" inputMode="decimal" /></label>
          <label>Y<input value={coordY} onChange={(event) => setCoordY(event.target.value)} placeholder="0" inputMode="decimal" /></label>
          <button type="submit">Go</button>
        </form>
        <div className="statusPill"><div><b>{writeCredits}</b><span> writes</span></div><button className="ghostButton" onClick={() => setMockOpen(true)} disabled={busy}>Mock</button><button className="payButton" onClick={startPayment} disabled={busy}>Pay 0.01</button></div>
      </div>
      <div className="hint">{message}</div>
      <div className="coordReadout"><span>Center: {centerLabel}</span><span>{gridLabel}</span></div>
      {!loadedOnce && <div className="loadingPanel"><div className="spinner" /><strong>Loading notes</strong><span>Opening the nearby paper area...</span></div>}
      {loadedOnce && loadingCells && <div className="loadingChip"><div className="spinner small" /> Loading nearby notes</div>}

      {mockOpen && <Modal title="Mock payment" onClose={() => setMockOpen(false)}><div className="field"><label>Code</label><input type="text" value={mockCode} onChange={(e) => setMockCode(e.target.value)} placeholder="123456" /></div><p className="message">Correct code adds 1 write credit.</p><div className="modalFooter"><button className="ghostButton" onClick={() => setMockOpen(false)}>Cancel</button><button className="primaryButton" disabled={busy || !mockCode} onClick={simulatePayment}>Add 1 write</button></div></Modal>}

      {payment && <Modal title="Wechat QR" onClose={() => setPayment(null)}><div className="qrBox"><img src={payment.qrDataUrl} alt="Wechat pay QR" /><p className="message">Pay 0.01 CNY to get 1 write credit.</p></div></Modal>}

      {draft && <Modal title="Write a note" onClose={() => setDraft(null)}><div className="field"><label>Text</label><textarea maxLength={500} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} placeholder="Write something here" /></div><div className="field"><label>Color</label><div className="swatches">{COLORS.map((color) => <button key={color} className="swatch" style={{ background: color }} data-active={draft.color === color} onClick={() => setDraft({ ...draft, color })} aria-label={color} />)}</div></div><div className="field"><label>Images</label><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => uploadImages(e.target.files)} /><p className="message">Up to 6 images, 5MB each.</p></div>{writeCredits < 1 && <p className="message error">No write credit. Pay or use mock payment.</p>}<div className="modalFooter"><button className="ghostButton" onClick={() => setDraft(null)}>Cancel</button><button className="primaryButton" disabled={busy || writeCredits < 1 || !draft.text.trim()} onClick={publishDraft}>Publish</button></div></Modal>}

      {detail && <Modal title="Note" onClose={() => setDetail(null)}><p className="noteText">{detail.note.text}</p>{detail.images.length > 0 && <div className="imageGrid">{detail.images.map((image) => <img key={image.id} src={image.url} alt="" loading="lazy" />)}</div>}<div className="field" style={{ marginTop: 16 }}><label>Color</label><div className="swatches">{COLORS.map((color) => <button key={color} className="swatch" style={{ background: color }} data-active={detail.note.color === color} onClick={() => changeColor(color)} aria-label={color} />)}</div></div></Modal>}
    </main>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modalBackdrop" onClick={onClose}><section className="modal" onClick={(event) => event.stopPropagation()}><div className="modalHeader"><h2 className="modalTitle">{title}</h2><button className="iconButton" onClick={onClose} aria-label="Close">X</button></div><div className="modalBody">{children}</div></section></div>;
}









