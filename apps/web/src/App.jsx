import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight, ArrowRight, BookOpen, BookPlus, Check,
  ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, Feather,
  FileText, Lightbulb, LockKeyhole, LogIn, LogOut, Moon, Pencil, Plus,
  Search, ShieldCheck, Sparkles, Sun, Trash2, X
} from "lucide-react";
import { caseTypes, conditionGroups, getRecommendations, initialEntries } from "./data.js";

const STORAGE_KEY = "paririmbon.entries.v1";
const THEME_STORAGE_KEY = "paririmbon.theme";
const API = import.meta.env.VITE_API_URL || "";

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

function App() {
  const [theme, setTheme] = useState(readSavedTheme);
  const [entries, setEntries] = useState(readSavedEntries);
  const [activeId, setActiveId] = useState(entries[0]?.id);
  const [search, setSearch] = useState("");
  const [bookOpen, setBookOpen] = useState(false);
  const [assistOpen, setAssistOpen] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [token, setToken] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [authError, setAuthError] = useState("");
  const [password, setPassword] = useState("");
  const [editing, setEditing] = useState(undefined);
  const [toast, setToast] = useState("");
  const [caseType, setCaseType] = useState(caseTypes[0]);
  const [conditions, setConditions] = useState([]);
  const [recommendation, setRecommendation] = useState(null);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    if (entries.length && !entries.some((entry) => entry.id === activeId)) setActiveId(entries[0].id);
  }, [entries, activeId]);

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

  async function getAssist() {
    const fallback = getRecommendations(caseType, conditions, entries);
    setRecommendation(fallback);
    try {
      const response = await fetch(`${API}/api/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseType, conditions })
      });
      if (response.ok) setRecommendation(await response.json());
    } catch {
      // The local guide keeps the feature useful when the API is not configured.
    }
  }

  function toggleCondition(value) {
    setConditions((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
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
          <button className={`assist-nav ${assistOpen ? "selected" : ""}`} onClick={() => { setAssistOpen((value) => !value); setRecommendation(null); }}>
            <Sparkles size={15} /> AI Assist
          </button>
          {admin ? (
            <button className="admin-button active" onClick={() => { setAdmin(false); setToken(""); setToast("Kamu telah keluar dari mode editor"); }}>
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
          <button className={`rail-item ${!assistOpen ? "current" : ""}`} onClick={() => setAssistOpen(false)}><BookOpen size={17} /><span>Buku panduan</span><span className="rail-count">{entries.length}</span></button>
          <button className={`rail-item ${assistOpen ? "current" : ""}`} onClick={() => { setAssistOpen(true); setRecommendation(null); }}><Sparkles size={17} /><span>AI Assist</span><span className="rail-new">BARU</span></button>
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
              <div className="eyebrow"><span>PERPUSTAKAAN</span><ChevronRight size={13} /> {assistOpen ? "ASISTEN CERDAS" : "PANDUAN PRODUK"}</div>
              <h1>{assistOpen ? <>Temukan jalan <em>keluar.</em></> : <>Buku kecil, <em>jawaban besar.</em></>}</h1>
              <p>{assistOpen ? "Ceritakan situasinya. Kita cari langkah terbaik bersama." : "Semua yang perlu kamu tahu, tersimpan rapi di sini."}</p>
            </div>
            {admin && !assistOpen && <button className="add-button" onClick={() => setEditing(null)}><Plus size={16} /> Tulis halaman</button>}
          </div>

          {assistOpen ? (
            <AssistPanel caseType={caseType} setCaseType={setCaseType} conditions={conditions} toggleCondition={toggleCondition} recommendation={recommendation} onSubmit={getAssist} onSelect={(id) => { setActiveId(id); setAssistOpen(false); setBookOpen(true); }} />
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

function AssistPanel({ caseType, setCaseType, conditions, toggleCondition, recommendation, onSubmit, onSelect }) {
  return (
    <div className="assist-layout">
      <div className="assist-form-card">
        <div className="assist-card-head"><span className="assist-icon"><Sparkles size={18} /></span><div><span className="section-kicker">TEMAN BERPIKIR</span><h2>Mulai dari ceritamu.</h2></div><span className="assist-step">01 / 02</span></div>
        <label className="field-label" htmlFor="case-type">Situasi yang sedang dihadapi</label>
        <div className="select-wrap"><select id="case-type" value={caseType} onChange={(event) => setCaseType(event.target.value)}>{caseTypes.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={16} /></div>
        <div className="condition-header"><span className="field-label">Tambahkan konteks <span>(pilih yang sesuai)</span></span><span>{conditions.length} dipilih</span></div>
        {conditionGroups.map((group) => <div className="condition-group" key={group.label}><span>{group.label}</span><div className="condition-options">{group.options.map((item) => <button key={item} className={`condition-chip ${conditions.includes(item) ? "chosen" : ""}`} onClick={() => toggleCondition(item)}>{conditions.includes(item) && <Check size={12} />}{item}</button>)}</div></div>)}
        <button className="primary-action assist-submit" onClick={onSubmit}><Sparkles size={16} /> Temukan panduan <ArrowRight size={15} /></button>
        <p className="privacy-note"><ShieldCheck size={13} /> Panduan awal, bukan pengganti kebijakan resmi.</p>
      </div>
      <div className="assist-result-card">
        {!recommendation ? <div className="result-empty"><span className="result-illustration"><BookPlus size={29} /></span><span className="section-kicker">JAWABAN MENUNGGU</span><h3>Setiap kasus<br /><em>punya jalannya.</em></h3><p>Pilih situasi, ceritakan konteksnya, lalu biarkan pengetahuan tim membantu menemukan langkah berikutnya.</p><span className="result-watermark">✳</span></div> : (
          <div className="result-content">
            <div className="result-label"><span className="result-spark"><Sparkles size={13} /></span> RANGKUMAN PANDUAN <span className="confidence-pill">PANDUAN TIM</span></div>
            <h3>Berikut langkah<br /><em>yang bisa dicoba.</em></h3>
            <ol className="recommendation-list">{recommendation.steps.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span><p>{step}</p></li>)}</ol>
            <div className="assist-note"><Lightbulb size={15} /><p>{recommendation.note}</p></div>
            {recommendation.article && <button className="related-article" onClick={() => onSelect(recommendation.article.id)}><span className="related-icon"><FileText size={15} /></span><span><small>BACA PANDUAN TERKAIT</small><b>{recommendation.article.title}</b></span><ArrowRight size={16} /></button>}
          </div>
        )}
        <div className="result-bottom"><span>✳</span> DIRANGKUM DARI PENGETAHUAN TIM</div>
      </div>
    </div>
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
