import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight, ArrowRight, BookOpen, BookPlus, Check,
  ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, Feather,
  FileText, Lightbulb, LockKeyhole, LogIn, LogOut, Moon, Pencil, Plus,
  Search, ShieldCheck, Sparkles, Sun, Trash2, X
} from "lucide-react";
import { evaluateBadTicket, initialBadTicketConfig, initialEntries } from "./data.js";

const STORAGE_KEY = "paririmbon.entries.v1";
const BAD_TICKET_STORAGE_KEY = "paririmbon.bad-ticket-config.v1";
const THEME_STORAGE_KEY = "paririmbon.theme";
const API = import.meta.env.VITE_API_URL || "";
const BAD_TICKET_HASHTAGS = [
  "#salah_kategori",
  "#salah_tujuan",
  "#mandatori_tidak_lengkap",
  "#non_eskalasi"
];

async function getResponseError(response, fallback) {
  try {
    const data = await response.json();
    if (data.error) return data.error;
  } catch {
    // Non-JSON responses need their HTTP status to help diagnose routing failures.
  }
  return `${fallback} (HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""})`;
}

function readSavedTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function readSavedEntries() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : initialEntries;
  } catch {
    return initialEntries;
  }
}

function normalizeBadTicketConfig(config) {
  const legacySourceLink = typeof config?.sourceLink === "string"
    ? config.sourceLink
    : initialBadTicketConfig.rules[0]?.sourceLink;
  const currentConfig = Object.fromEntries(
    Object.entries(config || {}).filter(([key]) => key !== "sourceLink")
  );
  return {
    ...initialBadTicketConfig,
    ...currentConfig,
    rules: Array.isArray(config?.rules)
      ? config.rules.map((rule) => ({
        ...rule,
        recommendation: rule.recommendation || "",
        sourceLink: rule.sourceLink || legacySourceLink,
        hashtag: BAD_TICKET_HASHTAGS.includes(rule.hashtag) ? rule.hashtag : "#salah_kategori"
      }))
      : initialBadTicketConfig.rules
  };
}

function isHttpLink(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function readSavedBadTicketConfig() {
  try {
    const saved = localStorage.getItem(BAD_TICKET_STORAGE_KEY);
    const config = saved ? JSON.parse(saved) : null;
    return config && Array.isArray(config.kips) && Array.isArray(config.customerCases) &&
      Array.isArray(config.issueTypes) && Array.isArray(config.onuStatuses) && Array.isArray(config.rules)
      ? normalizeBadTicketConfig(config)
      : initialBadTicketConfig;
  } catch {
    return initialBadTicketConfig;
  }
}

function App() {
  const [theme, setTheme] = useState(readSavedTheme);
  const [entries, setEntries] = useState(readSavedEntries);
  const [activeId, setActiveId] = useState(entries[0]?.id);
  const [search, setSearch] = useState("");
  const [bookOpen, setBookOpen] = useState(false);
  const [assistOpen, setAssistOpen] = useState(false);
  const [badTicketAdminOpen, setBadTicketAdminOpen] = useState(false);
  const [badTicketConfig, setBadTicketConfig] = useState(readSavedBadTicketConfig);
  const [ticketSubmission, setTicketSubmission] = useState({ kip: "", customerCase: "", issueType: "", onuStatus: "", caseId: "", incident: "", ihNumber: "" });
  const [ticketResult, setTicketResult] = useState(null);
  const [admin, setAdmin] = useState(false);
  const [token, setToken] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [authError, setAuthError] = useState("");
  const [password, setPassword] = useState("");
  const [editing, setEditing] = useState(undefined);
  const [toast, setToast] = useState("");
  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    if (entries.length && !entries.some((entry) => entry.id === activeId)) setActiveId(entries[0].id);
  }, [entries, activeId]);

  useEffect(() => {
    localStorage.setItem(BAD_TICKET_STORAGE_KEY, JSON.stringify(badTicketConfig));
  }, [badTicketConfig]);

  useEffect(() => {
    fetch(`${API}/api/entries`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data?.entries?.length) {
          setEntries(data.entries);
          setActiveId((current) => data.entries.some((entry) => entry.id === current) ? current : data.entries[0].id);
        }
      })
      .catch(() => {});
    fetch(`${API}/api/bad-ticket-config`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data?.config) setBadTicketConfig(normalizeBadTicketConfig(data.config));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const visibleEntries = useMemo(() => entries.filter((entry) =>
    `${entry.title} ${entry.category} ${entry.summary} ${entry.tags.join(" ")}`.toLowerCase().includes(search.toLowerCase())
  ), [entries, search]);
  const activeEntry = entries.find((entry) => entry.id === activeId) || entries[0];
  const activeIndex = entries.findIndex((entry) => entry.id === activeId);

  async function login(event) {
    event.preventDefault();
    setAuthError("");
    try {
      const response = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      if (!response.ok) throw new Error("Kata sandi admin tidak sesuai.");
      const data = await response.json();
      setToken(data.token);
      setAdmin(true);
      setAuthOpen(false);
      setPassword("");
      setToast("Mode editor aktif");
      return;
    } catch (error) {
      if (import.meta.env.DEV && password === "admin123") {
        setToken("");
        setAdmin(true);
        setAuthOpen(false);
        setPassword("");
        setToast("Mode demo admin aktif — perubahan tersimpan di perangkat ini");
        return;
      }
      setAuthError(error.message || "Layanan admin belum tersedia.");
    }
  }

  async function saveEntry(entry) {
    const now = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date());
    const updated = { ...entry, updatedAt: now };
    const isNew = !entries.some((item) => item.id === entry.id);
    if (token) {
      try {
        const response = await fetch(`${API}/api/entries${isNew ? "" : `/${encodeURIComponent(entry.id)}`}`, {
          method: isNew ? "POST" : "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(updated)
        });
        if (!response.ok) {
          setToast(`Gagal menyimpan ke server: ${await getResponseError(response, "server menolak perubahan")}`);
          return;
        }
      } catch {
        setToast("Gagal menyimpan ke server; perubahan belum diterapkan. Periksa koneksi lalu coba lagi.");
        return;
      }
    }
    setEntries((current) => isNew ? [updated, ...current] : current.map((item) => item.id === entry.id ? updated : item));
    setActiveId(updated.id);
    setEditing(undefined);
    setAssistOpen(false);
    setToast(token
      ? (isNew ? "Halaman baru berhasil disimpan ke server" : "Perubahan berhasil disimpan ke server")
      : "Tersimpan di perangkat ini saja; masuk ke server untuk menyinkronkan perubahan");
  }

  async function deleteEntry(entry) {
    if (!window.confirm(`Hapus halaman “${entry.title}”?`)) return;
    if (token) {
      try {
        const response = await fetch(`${API}/api/entries/${encodeURIComponent(entry.id)}`, {
          method: "DELETE", headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) {
          setToast(`Gagal menghapus di server: ${await getResponseError(response, "server menolak perubahan")}`);
          return;
        }
      } catch {
        setToast("Gagal menghapus di server; perubahan belum diterapkan. Periksa koneksi lalu coba lagi.");
        return;
      }
    }
    setEntries((current) => current.filter((item) => item.id !== entry.id));
    setToast(token
      ? "Halaman berhasil dihapus dari server"
      : "Dihapus di perangkat ini saja; masuk ke server untuk menyinkronkan perubahan");
  }

  function movePage(direction) {
    const next = Math.min(entries.length - 1, Math.max(0, activeIndex + direction));
    if (entries[next]) setActiveId(entries[next].id);
  }

  function evaluateTicket(event) {
    event.preventDefault();
    const evaluation = evaluateBadTicket(ticketSubmission, badTicketConfig);
    const expectedKip = evaluation.expectedRule?.kip;
    const expectedText = expectedKip
      ? `Seharusnya dibuat di KIP: ${expectedKip}\n${evaluation.expectedRule.recommendation || "Gunakan KIP ini untuk kendala dan kondisi tersebut."}`
      : "Seharusnya gunakan KIP yang sesuai dengan case pelanggan, jenis kendala, dan status ONU. Verifikasi kembali pada KMS.";
    const label = [
      `▪ ID Case : ${ticketSubmission.caseId || "1-XXXXX"} / ${ticketSubmission.incident || "INCXXXXX"} No IH : ${ticketSubmission.ihNumber || "1XXXXXXX"}`,
      `Permasalahan pelanggan: ${ticketSubmission.customerCase}`,
      `Jenis kendala: ${ticketSubmission.issueType} | Status ONU: ${ticketSubmission.onuStatus}`,
      `Namun dibuatkan di KIP: ${ticketSubmission.kip}`,
      expectedText,
      "",
      evaluation.expectedRule?.sourceLink || "",
      "",
      `#badtiketC4  ${evaluation.expectedRule?.hashtag || "#salah_kategori"}`
    ].join("\n");
    setTicketResult({ ...evaluation, label });
  }

  async function saveBadTicketConfig(nextConfig) {
    if (token) {
      let response;
      try {
        response = await fetch(`${API}/api/bad-ticket-config`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(nextConfig)
        });
      } catch {
        throw new Error("Gagal menyimpan konfigurasi. Periksa koneksi lalu coba lagi.");
      }
      if (!response.ok) throw new Error(await getResponseError(response, "server menolak perubahan"));
      const data = await response.json();
      setBadTicketConfig(normalizeBadTicketConfig(data.config));
      setToast("Konfigurasi bad tiket berhasil disimpan ke server");
      return;
    }
    setBadTicketConfig(nextConfig);
    setToast("Konfigurasi bad tiket tersimpan di perangkat ini saja");
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <header className="topbar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setAssistOpen(false); }}>
          <span className="brand-mark"><BookOpen size={19} strokeWidth={1.8} /></span>
          <span>paririmbon<span className="brand-dot">.</span><small>BUKU PENGETAHUAN TIM</small></span>
        </a>
        <div className="topbar-center"><span className="live-dot" /> Ruang belajar produk <span className="topbar-divider">/</span> <span className="topbar-muted">Edisi 01</span></div>
        <div className="topbar-actions">
          <div className="theme-toggle" role="group" aria-label="Theme">
            <button type="button" className={theme === "light" ? "selected" : ""} aria-pressed={theme === "light"} onClick={() => setTheme("light")}><Sun size={13} /><span>Light</span></button>
            <button type="button" className={theme === "dark" ? "selected" : ""} aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}><Moon size={13} /><span>Dark</span></button>
          </div>
          <button className={`assist-nav ${assistOpen && !badTicketAdminOpen ? "selected" : ""}`} onClick={() => { setAssistOpen((value) => !value); setBadTicketAdminOpen(false); setTicketResult(null); }}>
            <Sparkles size={15} /> Bad tiket
          </button>
          {admin ? (
            <button className="admin-button active" onClick={() => { setAdmin(false); setToken(""); setBadTicketAdminOpen(false); setToast("Kamu telah keluar dari mode editor"); }}>
              <ShieldCheck size={15} /> <span>Editor</span><LogOut size={13} />
            </button>
          ) : (
            <button className="admin-button" onClick={() => { setAuthOpen(true); setAuthError(""); }}>
              <LockKeyhole size={15} /> <span>Admin</span>
            </button>
          )}
        </div>
      </header>

      <main className="workspace">
        <aside className="left-rail">
          <div className="rail-label">RUANG BACA</div>
          <button className={`rail-item ${!assistOpen && !badTicketAdminOpen ? "current" : ""}`} onClick={() => { setAssistOpen(false); setBadTicketAdminOpen(false); }}><BookOpen size={17} /><span>Buku panduan</span><span className="rail-count">{entries.length}</span></button>
          <button className={`rail-item ${assistOpen && !badTicketAdminOpen ? "current" : ""}`} onClick={() => { setAssistOpen(true); setBadTicketAdminOpen(false); }}><Sparkles size={17} /><span>Bad tiket</span><span className="rail-new">TOOLS</span></button>
          {admin && <button className={`rail-item ${badTicketAdminOpen ? "current" : ""}`} onClick={() => { setAssistOpen(true); setBadTicketAdminOpen(true); }}><Pencil size={16} /><span>Edit bad tiket</span></button>}
          <div className="rail-rule" />
          <div className="rail-label rail-label-spaced">TENTANG BUKU INI</div>
          <div className="book-meta"><span className="meta-icon"><Feather size={15} /></span><div><b>Paririmbon</b><small>Pengetahuan produk</small></div></div>
          <div className="book-meta"><span className="meta-icon muted-icon"><FileText size={15} /></span><div><b>{entries.length} halaman</b><small>Diperbarui berkala</small></div></div>
          <div className="rail-note"><Lightbulb size={15} /><p>Pengetahuan terbaik adalah yang dibagikan. Bantu tim bertumbuh, satu halaman demi satu halaman.</p></div>
          <div className="rail-footer"><span className="avatar">P</span><span>Untuk tim, dari tim<small>Versi 1.0 · Oktober 2026</small></span></div>
        </aside>

        <section className="reading-area">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><span>PERPUSTAKAAN</span><ChevronRight size={13} /> {badTicketAdminOpen ? "PENGELOLAAN BAD TIKET" : assistOpen ? "PEMERIKSA BAD TIKET" : "PANDUAN PRODUK"}</div>
              <h1>{badTicketAdminOpen ? <>Atur <em>aturan tiket.</em></> : assistOpen ? <>Periksa <em>bad tiket.</em></> : <>Buku kecil, <em>jawaban besar.</em></>}</h1>
              <p>{badTicketAdminOpen ? "Kelola opsi dropdown dan kombinasi yang dinilai sesuai." : assistOpen ? "Isi detail pelaporan untuk memeriksa kesesuaian KIP." : "Semua yang perlu kamu tahu, tersimpan rapi di sini."}</p>
            </div>
            {admin && !assistOpen && <button className="add-button" onClick={() => setEditing(null)}><Plus size={16} /> Tulis halaman</button>}
          </div>

          {assistOpen ? (
            badTicketAdminOpen
              ? <BadTicketAdminPanel config={badTicketConfig} onSave={saveBadTicketConfig} onBack={() => setBadTicketAdminOpen(false)} localOnly={!token} />
              : <BadTicketPanel config={badTicketConfig} submission={ticketSubmission} onEdit={(field, value) => { setTicketSubmission((current) => ({ ...current, [field]: value })); setTicketResult(null); }} result={ticketResult} onSubmit={evaluateTicket} />
          ) : (
            <div className={`book-stage ${bookOpen ? "is-open" : "is-closed"}`}>
              {!bookOpen ? (
                <button className="closed-book" onClick={() => setBookOpen(true)} aria-label="Buka buku">
                  <div className="closed-book-spine" />
                  <div className="closed-book-cover"><span className="cover-flower">✳</span><span className="cover-small">CATATAN PENGETAHUAN PRODUK</span><span className="cover-title">Paririmbon</span><span className="cover-subtitle">Buku panduan tim</span><span className="cover-rule" /><span className="cover-open"><BookOpen size={15} /> KLIK UNTUK MEMBUKA</span></div>
                </button>
              ) : (
                <>
                  <div className="book-toolbar">
                    <label className="search-box"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari di dalam buku..." /><kbd>⌘ K</kbd></label>
                    <button className="close-book-button" onClick={() => setBookOpen(false)}><span>Tutup buku</span><X size={15} /></button>
                  </div>
                  <div className="book-spread">
                    <div className="book-page toc-page">
                      <div className="page-topline"><span><span className="tiny-flower">✳</span> PARIRIMBON</span><span>DAFTAR ISI</span></div>
                      <div className="toc-heading"><span className="section-kicker">PETA PENGETAHUAN</span><h2>Jelajahi<br /><em>isi buku.</em></h2><p>Pilih bab yang ingin kamu baca hari ini.</p></div>
                      <div className="toc-list">
                        {visibleEntries.length ? visibleEntries.map((entry, index) => (
                          <button key={entry.id} className={`toc-item ${entry.id === activeId ? "active" : ""}`} onClick={() => setActiveId(entry.id)}>
                            <span className="toc-index">{String(index + 1).padStart(2, "0")}</span><span className="toc-item-title">{entry.title}<small>{entry.category}</small></span><span className="toc-dots" /><ArrowDownRight className="toc-arrow" size={14} />
                          </button>
                        )) : <p className="empty-search">Belum ada halaman yang cocok.</p>}
                      </div>
                      <div className="page-bottom"><span>PARIRIMBON · EDISI 01</span><span>i</span></div>
                    </div>
                    <article key={activeEntry?.id || "empty"} className="book-page content-page">
                      <div className="page-topline"><span>{activeEntry?.category || "PANDUAN"}</span><span><span className="tiny-flower">✳</span> PENGETAHUAN BERSAMA</span></div>
                      {activeEntry ? (
                        <>
                          <div className="article-head">
                            <span className="section-kicker">BAB {String(activeIndex + 1).padStart(2, "0")} <span className="kicker-dash">—</span> {activeEntry.category.toUpperCase()}</span>
                            <h2>{activeEntry.title}</h2><p className="article-summary">{activeEntry.summary}</p>
                            <div className="article-meta"><span><Clock3 size={13} /> {activeEntry.readTime}</span><span>·</span><span>Disunting {activeEntry.updatedAt}</span></div>
                          </div>
                          <div className="article-divider"><span>✳</span></div>
                          <div className="article-body">{activeEntry.content.split("\n\n").map((paragraph, index) => (
                            <p key={`${activeEntry.id}-${index}`}>{paragraph.split("\n").map((line, lineIndex) => <span key={line}>{lineIndex > 0 && <br />}{line}</span>)}</p>
                          ))}</div>
                          {activeEntry.tags?.length > 0 && <div className="tag-list">{activeEntry.tags.slice(0, 4).map((tag) => <span key={tag}>#{tag}</span>)}</div>}
                          {admin && <div className="article-admin"><button onClick={() => setEditing(activeEntry)}><Pencil size={14} /> Edit halaman</button><button className="delete-action" onClick={() => deleteEntry(activeEntry)}><Trash2 size={14} /> Hapus</button></div>}
                        </>
                      ) : <div className="empty-page"><BookOpen size={30} /><p>Belum ada halaman. Tambahkan halaman baru untuk memulai.</p></div>}
                      <div className="page-bottom"><span>{activeEntry?.category.toUpperCase() || "PANDUAN PRODUK"}</span><span>{String(activeIndex + 1).padStart(2, "0")}</span></div>
                    </article>
                  </div>
                  <div className="book-controls">
                    <button onClick={() => movePage(-1)} disabled={activeIndex <= 0}><ChevronLeft size={16} /> Sebelumnya</button>
                    <span><i>{String(Math.max(activeIndex + 1, 1)).padStart(2, "0")}</i> <span className="control-slash">/</span> {String(entries.length).padStart(2, "0")}</span>
                    <button onClick={() => movePage(1)} disabled={activeIndex >= entries.length - 1}>Selanjutnya <ChevronRight size={16} /></button>
                  </div>
                </>
              )}
            </div>
          )}
          <div className="bottom-caption"><span><CircleHelp size={14} /> Ada yang perlu diperbarui?</span><button onClick={() => admin ? setEditing(null) : setAuthOpen(true)}>{admin ? "Tambahkan pengetahuan" : "Hubungi admin"} <ArrowRight size={13} /></button><span className="caption-spacer" /> <span className="page-ornament">✳</span></div>
        </section>
      </main>

      {authOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthOpen(false); }}><form className="auth-modal" onSubmit={login}>
        <button type="button" className="modal-close" onClick={() => setAuthOpen(false)} aria-label="Tutup"><X size={17} /></button>
        <span className="modal-icon"><LockKeyhole size={21} /></span><span className="section-kicker">AKSES TERBATAS</span><h2>Ruang editor.</h2><p>Masuk untuk merawat dan menambahkan pengetahuan di dalam buku.</p>
        <label className="field-label" htmlFor="admin-password">Kata sandi admin</label><input autoFocus id="admin-password" className="text-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Masukkan kata sandi" required />
        {authError && <div className="form-error">{authError}</div>}
        <button className="primary-action" type="submit"><LogIn size={16} /> Masuk sebagai admin</button>
        {import.meta.env.DEV && <span className="demo-hint">Mode demo lokal: gunakan <code>admin123</code></span>}
      </form></div>}

      {editing !== undefined && <EntryEditor entry={editing} onClose={() => setEditing(undefined)} onSave={saveEntry} localOnly={!token} />}
      {toast && <div className="toast"><Check size={16} /> {toast}</div>}
    </div>
  );
}

function BadTicketPanel({ config, submission, onEdit, result, onSubmit }) {
  const dropdowns = [
    { field: "kip", label: "KIP pelaporan", options: config.kips },
    { field: "customerCase", label: "Case pelaporan pelanggan", options: config.customerCases },
    { field: "issueType", label: "Jenis kendala", options: config.issueTypes },
    { field: "onuStatus", label: "Status ONU", options: config.onuStatuses }
  ];

  return (
    <div className="assist-layout">
      <form className="assist-form-card bad-ticket-form" onSubmit={onSubmit}>
        <div className="assist-card-head"><span className="assist-icon"><ShieldCheck size={18} /></span><div><span className="section-kicker">VALIDASI PELAPORAN</span><h2>Cek kesesuaian tiket.</h2></div><span className="assist-step">4 WAJIB</span></div>
        {dropdowns.map(({ field, label, options }) => (
          <div className="bad-ticket-field" key={field}>
            <label className="field-label" htmlFor={`ticket-${field}`}>{label} <span className="required-mark">*</span></label>
            <div className="select-wrap">
              <select id={`ticket-${field}`} value={submission[field]} onChange={(event) => onEdit(field, event.target.value)} required>
                <option value="">Pilih {label.toLowerCase()}</option>
                {options.map((item) => <option key={item} value={item}>{item}</option>)}
              </select><ChevronDown size={16} />
            </div>
          </div>
        ))}
        <div className="ticket-ids">
          <label className="bad-ticket-field"><span className="field-label">ID Case <span>(opsional)</span></span><input className="text-input" value={submission.caseId} onChange={(event) => onEdit("caseId", event.target.value)} placeholder="1-XXXXX" /></label>
          <label className="bad-ticket-field"><span className="field-label">No. INC <span>(opsional)</span></span><input className="text-input" value={submission.incident} onChange={(event) => onEdit("incident", event.target.value)} placeholder="INCXXXXX" /></label>
          <label className="bad-ticket-field"><span className="field-label">No. IH <span>(opsional)</span></span><input className="text-input" value={submission.ihNumber} onChange={(event) => onEdit("ihNumber", event.target.value)} placeholder="1XXXXXXX" /></label>
        </div>
        <button className="primary-action assist-submit" type="submit"><Sparkles size={16} /> Periksa tiket <ArrowRight size={15} /></button>
        <p className="privacy-note"><ShieldCheck size={13} /> Pemeriksaan mengikuti kombinasi aturan yang disimpan admin.</p>
      </form>
      <div className="assist-result-card">
        {!result ? <div className="result-empty"><span className="result-illustration"><BookPlus size={29} /></span><span className="section-kicker">HASIL PEMERIKSAAN</span><h3>Pastikan tiket<br /><em>sesuai aturan.</em></h3><p>Pilih KIP, case pelanggan, jenis kendala, dan status ONU untuk melihat hasil pemeriksaan serta redaksi rekomendasi.</p><span className="result-watermark">✳</span></div> : (
          <div className="result-content">
            <div className="result-label"><span className="result-spark"><Sparkles size={13} /></span> HASIL PEMERIKSAAN <span className={`ticket-status ${result.isBadTicket ? "bad" : "good"}`}>{result.isBadTicket ? "BAD TIKET" : "BUKAN BAD TIKET"}</span></div>
            <h3>{result.isBadTicket ? <>Tiket perlu<br /><em>diperbaiki.</em></> : <>Tiket sudah<br /><em>sesuai aturan.</em></>}</h3>
            <p className="ticket-result-summary">{result.isBadTicket
              ? "Kombinasi KIP, case pelanggan, jenis kendala, dan status ONU tidak ditemukan pada aturan yang disetujui."
              : "Semua pilihan cocok dengan kombinasi aturan yang disetujui admin."}</p>
            {result.isBadTicket && <div className="ticket-label-wrap"><label className="field-label" htmlFor="bad-ticket-label">Rekomendasi redaksi pelabelan</label><textarea id="bad-ticket-label" className="text-input ticket-label" value={result.label} readOnly /></div>}
            {result.isBadTicket && result.expectedRule?.sourceLink && <a className="ticket-source-link" href={result.expectedRule.sourceLink} target="_blank" rel="noreferrer"><FileText size={14} /> Buka source KMS <ArrowRight size={14} /></a>}
          </div>
        )}
        <div className="result-bottom"><span>✳</span> DIRANGKUM DARI PENGETAHUAN TIM</div>
      </div>
    </div>
  );
}

function BadTicketAdminPanel({ config, onSave, onBack, localOnly }) {
  const [draft, setDraft] = useState(config);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const optionFields = [
    { field: "kips", label: "KIP pelaporan" },
    { field: "customerCases", label: "Case pelaporan pelanggan" },
    { field: "issueTypes", label: "Jenis kendala" },
    { field: "onuStatuses", label: "Status ONU" }
  ];

  useEffect(() => setDraft(config), [config]);

  function updateRule(index, field, value) {
    setDraft((current) => ({
      ...current,
      rules: current.rules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, [field]: value } : rule)
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    const normalized = {
      ...draft,
      ...Object.fromEntries(optionFields.map(({ field }) => [
        field,
        [...new Set(draft[field].map((value) => value.trim()).filter(Boolean))]
      ]))
    };
    const ruleFields = {
      kips: "kip",
      customerCases: "customerCase",
      issueTypes: "issueType",
      onuStatuses: "onuStatus"
    };
    normalized.rules = normalized.rules.map((rule) => {
      const updatedRule = { ...rule };
      optionFields.forEach(({ field }) => {
        const removed = config[field].filter((value) => !normalized[field].includes(value));
        const added = normalized[field].filter((value) => !config[field].includes(value));
        if (removed.length === 1 && added.length === 1 && updatedRule[ruleFields[field]] === removed[0]) {
          updatedRule[ruleFields[field]] = added[0];
        }
      });
      return updatedRule;
    });
    const invalidOption = optionFields.find(({ field }) => normalized[field].length === 0);
    const ruleIssues = normalized.rules.flatMap((rule, index) => {
      const fields = [
        ["KIP", "kip", "kips"],
        ["Case", "customerCase", "customerCases"],
        ["Jenis kendala", "issueType", "issueTypes"],
        ["Status ONU", "onuStatus", "onuStatuses"]
      ];
      const missingOptions = fields
        .filter(([, ruleField, optionField]) => !normalized[optionField].includes(rule[ruleField]))
        .map(([label]) => label);
      if (!BAD_TICKET_HASHTAGS.includes(rule.hashtag)) missingOptions.push("hashtag");
      if (!isHttpLink(rule.sourceLink)) missingOptions.push("source link");
      return missingOptions.length ? [`Aturan #${index + 1}: periksa ${missingOptions.join(", ")}.`] : [];
    });
    const signatures = normalized.rules.map((rule) => JSON.stringify([rule.kip, rule.customerCase, rule.issueType, rule.onuStatus]));
    if (invalidOption) {
      setError(`Tambahkan minimal satu pilihan untuk “${invalidOption.label}”.`);
      return;
    }
    if (ruleIssues.length) {
      const visibleIssues = ruleIssues.slice(0, 3).join(" ");
      const remainingCount = ruleIssues.length - 3;
      setError(`${visibleIssues}${remainingCount > 0 ? ` Dan ${remainingCount} aturan lainnya.` : ""} Pilih nilai pengganti atau hapus aturan yang tidak digunakan.`);
      return;
    }
    if (new Set(signatures).size !== signatures.length) {
      setError("Setiap kombinasi aturan harus unik.");
      return;
    }
    setSaving(true);
    try {
      await onSave(normalized);
      setDraft(normalized);
    } catch (saveError) {
      setError(saveError.message || "Konfigurasi gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="bad-ticket-admin" onSubmit={submit}>
      <div className="bad-ticket-admin-intro"><div><span className="section-kicker">MODE ADMIN</span><h2>Kelola dropdown dan aturan.</h2><p>Hanya kombinasi yang didaftarkan di sini yang akan dinilai bukan bad tiket.</p></div><button className="close-book-button" type="button" onClick={onBack}><ChevronLeft size={15} /> Kembali ke pemeriksa</button></div>
      <div className="bad-ticket-option-grid">
        {optionFields.map(({ field, label }) => <label className="bad-ticket-option" key={field}><span className="field-label">{label}<small>Pisahkan pilihan dengan baris baru</small></span><textarea className="text-input" value={draft[field].join("\n")} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value.split("\n") }))} rows={5} /></label>)}
      </div>
      <div className="bad-ticket-rules-head"><div><span className="section-kicker">KOMBINASI YANG DISETUJUI</span><h3>Aturan validasi <span>({draft.rules.length})</span></h3></div><button type="button" className="add-button" onClick={() => setDraft((current) => ({ ...current,       rules: [...current.rules, { kip: current.kips[0] || "", customerCase: current.customerCases[0] || "", issueType: current.issueTypes[0] || "", onuStatus: current.onuStatuses[0] || "", recommendation: "", sourceLink: "", hashtag: "#salah_kategori" }] }))}><Plus size={15} /> Tambah aturan</button></div>
      {!draft.rules.length && <p className="bad-ticket-no-rules">Belum ada kombinasi yang disetujui. Semua tiket yang diperiksa akan dianggap bad tiket.</p>}
      <div className="bad-ticket-rules">
        {draft.rules.map((rule, index) => <div className="bad-ticket-rule" key={`rule-${index}`}>
          {[
            { field: "kip", label: "KIP", options: draft.kips },
            { field: "customerCase", label: "Case", options: draft.customerCases },
            { field: "issueType", label: "Jenis", options: draft.issueTypes },
            { field: "onuStatus", label: "ONU", options: draft.onuStatuses }
          ].map(({ field, label, options }) => <label className="bad-ticket-rule-field" key={field}><span>{label}</span><select className="text-input" value={rule[field]} onChange={(event) => updateRule(index, field, event.target.value)} required>{rule[field] && !options.includes(rule[field]) && <option value={rule[field]} disabled>{rule[field]} (tidak tersedia)</option>}{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>)}
          <label className="bad-ticket-rule-field recommendation-field"><span>Redaksi rekomendasi bad tiket <small>(opsional)</small></span><textarea className="text-input" value={rule.recommendation || ""} maxLength={2000} rows={3} onChange={(event) => updateRule(index, "recommendation", event.target.value)} placeholder="Contoh: Permasalahan internet lambat seharusnya dibuat di KIP K31 - Bisa Browsing - Lambat." /></label>
          <label className="bad-ticket-rule-field recommendation-field"><span>Source link KMS</span><input className="text-input" type="url" value={rule.sourceLink || ""} onChange={(event) => updateRule(index, "sourceLink", event.target.value)} placeholder="https://kms.telkomsel.co.id/content/" required /></label>
          <label className="bad-ticket-rule-field recommendation-field"><span>Hashtag bad tiket</span><select className="text-input" value={rule.hashtag || "#salah_kategori"} onChange={(event) => updateRule(index, "hashtag", event.target.value)} required>{BAD_TICKET_HASHTAGS.map((hashtag) => <option key={hashtag} value={hashtag}>{hashtag}</option>)}</select></label>
          <button type="button" className="delete-action" onClick={() => setDraft((current) => ({ ...current, rules: current.rules.filter((_, ruleIndex) => ruleIndex !== index) }))}><Trash2 size={14} /><span>Hapus aturan</span></button>
        </div>)}
      </div>
      {error && <div className="form-error bad-ticket-error">{error}</div>}
      <div className="bad-ticket-admin-footer"><span><ShieldCheck size={14} /> {localOnly ? "Mode demo: konfigurasi hanya tersimpan di perangkat ini." : "Konfigurasi akan disimpan ke MongoDB dan dibagikan ke pegawai."}</span><button className="primary-action" type="submit" disabled={saving}><Check size={16} /> {saving ? "Menyimpan..." : "Simpan konfigurasi"}</button></div>
    </form>
  );
}

function EntryEditor({ entry, onClose, onSave, localOnly }) {
  const [title, setTitle] = useState(entry?.title || "");
  const [category, setCategory] = useState(entry?.category || "Panduan umum");
  const [summary, setSummary] = useState(entry?.summary || "");
  const [content, setContent] = useState(entry?.content || "");
  const [tags, setTags] = useState(entry?.tags?.join(", ") || "");
  const isNew = !entry;

  function submit(event) {
    event.preventDefault();
    const id = entry?.id || `${title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Date.now().toString(36)}`;
    onSave({ id, title: title.trim(), category: category.trim(), summary: summary.trim(), content: content.trim(), tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), readTime: `${Math.max(1, Math.ceil(content.trim().split(/\s+/).filter(Boolean).length / 180))} menit` });
  }

  return <div className="modal-backdrop editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="editor-modal" onSubmit={submit}>
    <div className="editor-header"><div><span className="section-kicker">{isNew ? "TAMBAH PENGETAHUAN" : "PERBARUI ISI BUKU"}</span><h2>{isNew ? "Tulis halaman baru." : "Sunting halaman."}</h2></div><button type="button" className="modal-close" onClick={onClose} aria-label="Tutup"><X size={17} /></button></div>
    <label className="field-label" htmlFor="entry-title">Judul halaman</label><input id="entry-title" className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Contoh: Panduan aktivasi produk" required maxLength={100} />
    <div className="editor-two-col"><div><label className="field-label" htmlFor="entry-category">Kategori</label><input id="entry-category" className="text-input" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Misalnya: Pembayaran" required /></div><div><label className="field-label" htmlFor="entry-tags">Kata kunci <span>(pisahkan dengan koma)</span></label><input id="entry-tags" className="text-input" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="akun, akses, login" /></div></div>
    <label className="field-label" htmlFor="entry-summary">Ringkasan singkat</label><textarea id="entry-summary" className="text-input summary-input" value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Satu kalimat tentang isi halaman ini." required maxLength={220} />
    <label className="field-label" htmlFor="entry-content">Isi panduan</label><textarea id="entry-content" className="text-input content-input" value={content} onChange={(event) => setContent(event.target.value)} placeholder={"Tuliskan panduan di sini.\n\nPisahkan paragraf dengan baris kosong."} required />
    <div className="editor-footer"><span><ShieldCheck size={14} /> {localOnly ? "Hanya tersimpan di perangkat ini." : "Disimpan ke server saat dikonfirmasi."}</span><button className="primary-action" type="submit"><Check size={16} /> {isNew ? "Terbitkan halaman" : "Simpan perubahan"}</button></div>
  </form></div>;
}

export default App;
