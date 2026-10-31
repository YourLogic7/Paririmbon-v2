import { useEffect, useId, useMemo, useState } from "react";
import {
  ArrowDownRight, ArrowRight, BookOpen, BookPlus, Check,
  ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, Feather,
  FileText, Lightbulb, LockKeyhole, LogIn, LogOut, Moon, Pencil, Plus,
  Download, FileSpreadsheet, Search, ShieldCheck, Sparkles, Sun, Trash2,
  Upload, Users, UserRound, X
} from "lucide-react";
import {
  evaluateBadTicket,
  allKipRuleOptions,
  allKipsBad,
  allKipsNotBad,
  hasConflictingAllKipRules,
  initialBadTicketConfig,
  initialEntries,
  allIssueTypes,
  missingOnuNoacsStatus,
  missingOnuStatus
} from "./data.js";

const STORAGE_KEY = "paririmbon.entries.v1";
const BAD_TICKET_STORAGE_KEY = "paririmbon.bad-ticket-config.v1";
const THEME_STORAGE_KEY = "paririmbon.theme";
const SESSION_STORAGE_KEY = "paririmbon.session.v1";
const API = import.meta.env.VITE_API_URL || "";
const MAX_IMPORT_ROWS = 200;
const BAD_TICKET_HASHTAGS = [
  "#salah_kategori",
  "#salah_tujuan",
  "#mandatori_tidak_lengkap",
  "#non_eskalasi"
];
const BAD_TICKET_RULE_FILTER_FIELDS = [
  { field: "kip", label: "KIP", allLabel: "Semua KIP" },
  { field: "customerCase", label: "Case pelanggan", allLabel: "Semua case" },
  { field: "issueType", label: "Jenis kendala", allLabel: "Semua jenis kendala" },
  { field: "onuStatus", label: "Status ONU", allLabel: "Semua status ONU" }
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

function readSavedSession() {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

async function createAccountTemplate() {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const header = ["Nama Pegawai", "User ID", "Password"].map((value) => ({ value, fontWeight: "bold" }));
  const blankRow = ["", "", ""].map((value) => ({ value, type: String, format: "@" }));
  const blob = await writeExcelFile([header, ...Array.from({ length: MAX_IMPORT_ROWS }, () => blankRow)], {
    columns: [{ width: 30 }, { width: 24 }, { width: 24 }]
  }).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "template-akun-pegawai.xlsx";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function normalizeSpreadsheetHeader(value) {
  return String(value || "").trim().toLocaleLowerCase("id").replace(/\s+/g, " ");
}

async function readAccountsFromWorkbook(file) {
  if (!file.name.toLocaleLowerCase("id").endsWith(".xlsx")) {
    throw new Error("Pilih file Excel .xlsx.");
  }
  if (file.size > 2 * 1024 * 1024) throw new Error("Ukuran file maksimal 2 MB.");

  const { readSheet } = await import("read-excel-file/browser");
  const rows = await readSheet(file);
  if (!rows?.length) throw new Error("File Excel tidak memiliki sheet atau header.");
  if (rows.length > 5000) throw new Error("File Excel terlalu banyak baris. Maksimal 200 akun.");

  const headerAliases = {
    name: ["nama pegawai", "nama", "employee name"],
    id: ["user id", "userid", "id pengguna", "id akun", "id pegawai"],
    password: ["password", "kata sandi"]
  };
  const columns = {};
  rows[0].forEach((value, index) => {
    const header = normalizeSpreadsheetHeader(value);
    for (const [field, aliases] of Object.entries(headerAliases)) {
      if (aliases.includes(header)) columns[field] = index;
    }
  });
  if (Object.keys(columns).length !== 3) {
    throw new Error("Header wajib: Nama Pegawai, User ID, dan Password. Unduh template untuk format yang benar.");
  }

  const accounts = [];
  const seenIds = new Set();
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const rowNumber = rowIndex + 1;
    const row = rows[rowIndex];
    const values = {};
    for (const [field, column] of Object.entries(columns)) {
      const value = row[column];
      if (value === null || value === undefined || value === "") {
        values[field] = "";
      } else if (typeof value === "string" || (typeof value === "number" && Number.isFinite(value))) {
        values[field] = String(value).trim();
      } else {
        throw new Error(`Baris ${rowNumber}: gunakan teks biasa untuk nama, User ID, dan password.`);
      }
    }
    if (Object.values(values).every((value) => !value)) continue;
    if (!values.name || values.name.length > 100) {
      throw new Error(`Baris ${rowNumber}: nama pegawai wajib diisi (maksimal 100 karakter).`);
    }
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(values.id)) {
      throw new Error(`Baris ${rowNumber}: User ID harus 3–32 karakter (huruf, angka, titik, garis bawah, atau strip).`);
    }
    if (values.password.length < 8 || values.password.length > 128) {
      throw new Error(`Baris ${rowNumber}: password harus terdiri dari 8–128 karakter.`);
    }
    const normalizedId = values.id.toLowerCase();
    if (seenIds.has(normalizedId)) throw new Error(`Baris ${rowNumber}: User ID "${values.id}" duplikat di dalam file.`);
    seenIds.add(normalizedId);
    accounts.push({ name: values.name, id: values.id, password: values.password });
    if (accounts.length > MAX_IMPORT_ROWS) throw new Error("Maksimal 200 akun per impor.");
  }
  if (!accounts.length) throw new Error("Tidak ada data akun di file Excel.");
  return accounts;
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
    kips: (Array.isArray(currentConfig.kips) ? currentConfig.kips : initialBadTicketConfig.kips)
      .filter((kip) => !allKipRuleOptions.includes(kip)),
    onuStatuses: [...new Set([
      ...(Array.isArray(config?.onuStatuses) ? config.onuStatuses : initialBadTicketConfig.onuStatuses),
      missingOnuStatus,
      missingOnuNoacsStatus
    ])],
    rules: Array.isArray(config?.rules)
      ? config.rules.map((rule) => ({
        ...rule,
        onuStatuses: [...new Set(Array.isArray(rule.onuStatuses)
          ? rule.onuStatuses
          : typeof rule.onuStatus === "string" ? [rule.onuStatus] : [])],
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

function SearchableSelect({ id, value, options, onChange, placeholder, required = false, compact = false }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return options.filter((option) => option.toLocaleLowerCase().includes(normalizedQuery));
  }, [options, query]);

  function choose(option) {
    onChange(option);
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, filteredOptions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => current <= 0 ? filteredOptions.length - 1 : current - 1);
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      if (filteredOptions[activeIndex]) choose(filteredOptions[activeIndex]);
      else if (filteredOptions.length === 1) choose(filteredOptions[0]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
      setActiveIndex(-1);
    }
  }

  return (
    <div className={`searchable-select${compact ? " compact" : ""}`}>
      <div className="searchable-select-control">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
          autoComplete="off"
          required={required}
          value={open ? query : value}
          placeholder={placeholder}
          onFocus={() => { setOpen(true); setQuery(""); setActiveIndex(-1); }}
          onClick={() => {
            if (!open) {
              setOpen(true);
              setQuery("");
              setActiveIndex(-1);
            }
          }}
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(-1); setOpen(true); }}
          onKeyDown={handleKeyDown}
          onBlur={() => { setOpen(false); setQuery(""); setActiveIndex(-1); }}
        />
        <ChevronDown size={compact ? 14 : 16} aria-hidden="true" />
      </div>
      {open && (
        <div className="searchable-select-options" id={listId} role="listbox">
          {filteredOptions.length ? filteredOptions.map((option, index) => (
            <button
              id={`${listId}-option-${index}`}
              className={`searchable-select-option${index === activeIndex ? " active" : ""}`}
              type="button"
              role="option"
              aria-selected={option === value}
              key={option}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              {option}
            </button>
          )) : <span className="searchable-select-empty">Tidak ada pilihan yang cocok.</span>}
        </div>
      )}
    </div>
  );
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
  const [accountsAdminOpen, setAccountsAdminOpen] = useState(false);
  const [badTicketConfig, setBadTicketConfig] = useState(readSavedBadTicketConfig);
  const [ticketSubmission, setTicketSubmission] = useState({ kip: "", customerCase: "", issueType: "", onuStatus: "", caseId: "", incident: "", ihNumber: "" });
  const [ticketResult, setTicketResult] = useState(null);
  const [admin, setAdmin] = useState(false);
  const [token, setToken] = useState("");
  const [sessionChecking, setSessionChecking] = useState(true);
  const [editing, setEditing] = useState(undefined);
  const [toast, setToast] = useState("");

  useEffect(() => {
    let cancelled = false;
    const savedToken = readSavedSession();
    if (!savedToken) {
      setSessionChecking(false);
      return undefined;
    }
    fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${savedToken}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error("Sesi tidak valid.");
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        setToken(savedToken);
        setAdmin(data.role === "admin");
      })
      .catch(() => {
        try {
          sessionStorage.removeItem(SESSION_STORAGE_KEY);
        } catch {
          // Session storage can be unavailable in restricted browser contexts.
        }
      })
      .finally(() => {
        if (!cancelled) setSessionChecking(false);
      });
    return () => { cancelled = true; };
  }, []);

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
    if (!token) return undefined;
    let cancelled = false;
    const headers = { Authorization: `Bearer ${token}` };
    fetch(`${API}/api/entries`, { headers })
      .then(async (response) => {
        if (!response.ok) throw new Error(await getResponseError(response, "Gagal memuat halaman"));
        return response.json();
      })
      .then((data) => {
        if (cancelled || !data.entries?.length) return;
        setEntries(data.entries);
        setActiveId((current) => data.entries.some((entry) => entry.id === current) ? current : data.entries[0].id);
      })
      .catch((error) => { if (!cancelled) setToast(error.message); });
    fetch(`${API}/api/bad-ticket-config`, { headers })
      .then(async (response) => {
        if (!response.ok) throw new Error(await getResponseError(response, "Gagal memuat konfigurasi"));
        return response.json();
      })
      .then((data) => {
        if (!cancelled && data.config) setBadTicketConfig(normalizeBadTicketConfig(data.config));
      })
      .catch((error) => { if (!cancelled) setToast(error.message); });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    async function updatePresence() {
      try {
        const response = await fetch(`${API}/api/auth/presence`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.status === 401) {
          try {
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
          } catch {
            // Session storage can be unavailable in restricted browser contexts.
          }
          setToken("");
          setAdmin(false);
          setAccountsAdminOpen(false);
        }
      } catch {
        // A temporary network error should not end an otherwise valid session.
      }
    }
    updatePresence();
    const timer = window.setInterval(updatePresence, 15_000);
    return () => window.clearInterval(timer);
  }, [token]);

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

  function logout() {
    if (token) {
      fetch(`${API}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        keepalive: true
      }).then((response) => {
        if (!response.ok && response.status !== 401) console.warn("Paririmbon logout presence update failed:", response.status);
      }).catch((error) => console.warn("Paririmbon logout presence update failed:", error.message));
    }
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Session storage can be unavailable in restricted browser contexts.
    }
    setToken("");
    setAdmin(false);
    setAccountsAdminOpen(false);
    setBadTicketAdminOpen(false);
    setEditing(undefined);
  }

  function acceptSession(session) {
    setToken(session.token);
    setAdmin(session.role === "admin");
    setSessionChecking(false);
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
    if (evaluation.expectedRule?.special === "detailed-case") {
      const label = [
        `ID Case : ${ticketSubmission.caseId || "1-XXXXX"} / ${ticketSubmission.incident || "INCXXXXX"} No IH : ${ticketSubmission.ihNumber || "1XXXXXXX"}`,
        "Di detail pelaporan (copy dari DSC)",
        "",
        evaluation.expectedRule.recommendation,
        "",
        "#badtiketC4",
        evaluation.expectedRule.hashtag,
        "https://kms.telkomsel.co.id/content/(SESUAIKAN)"
      ].join("\n");
      setTicketResult({ ...evaluation, label, formattedLabel: true });
      return;
    }
    if (evaluation.expectedRule?.special === "missing-onu") {
      const label = [
        `ID Case : ${ticketSubmission.caseId || "1-XXXXX"} / ${ticketSubmission.incident || "INCXXXXX"}, No IH : ${ticketSubmission.ihNumber || "1XXXXXXX"}. Detail Permasalahan pelanggan adalah (COPY DARI DSC YA KAKAK2), namun tidak ada capture atau keterangan ONU ketika pelaporan.`,
        evaluation.expectedRule.recommendation,
        "",
        `#badtiketC4 ${evaluation.expectedRule.hashtag}`,
        evaluation.expectedRule.sourceLink
      ].join("\n");
      setTicketResult({ ...evaluation, label });
      return;
    }
    if (!evaluation.isBadTicket || !evaluation.expectedRule) {
      setTicketResult({
        ...evaluation,
        isUnconfigured: evaluation.isBadTicket && !evaluation.expectedRule
      });
      return;
    }
    const expectedKip = evaluation.expectedRule?.kip;
    let expectedText;
    if (evaluation.expectedRule?.special === "all-kips-bad") {
      expectedText = evaluation.expectedRule.recommendation || "";
    } else if (expectedKip) {
      expectedText = `Seharusnya dibuat di KIP: ${expectedKip}\n${evaluation.expectedRule.recommendation || "Gunakan KIP ini untuk kendala dan kondisi tersebut."}`;
    } else {
      expectedText = "Seharusnya gunakan KIP yang sesuai dengan case pelanggan, jenis kendala, dan status ONU. Verifikasi kembali pada KMS.";
    }
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

  if (sessionChecking) {
    return <div className="app-shell session-loading" data-theme={theme}><span className="live-dot" /> Memeriksa sesi...</div>;
  }
  if (!token) return <LoginScreen theme={theme} onAuthenticated={acceptSession} />;

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
          <button className={`assist-nav ${assistOpen && !badTicketAdminOpen && !accountsAdminOpen ? "selected" : ""}`} onClick={() => { setAssistOpen((value) => !value); setBadTicketAdminOpen(false); setAccountsAdminOpen(false); setTicketResult(null); }}>
            <Sparkles size={15} /> Bad tiket
          </button>
          <button className={`admin-button${admin ? " active" : ""}`} onClick={logout}>
            <LogOut size={14} /><span>Keluar</span>
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="left-rail">
          <div className="rail-label">RUANG BACA</div>
          <button className={`rail-item ${!assistOpen && !badTicketAdminOpen && !accountsAdminOpen ? "current" : ""}`} onClick={() => { setAssistOpen(false); setBadTicketAdminOpen(false); setAccountsAdminOpen(false); }}><BookOpen size={17} /><span>Buku panduan</span><span className="rail-count">{entries.length}</span></button>
          <button className={`rail-item ${assistOpen && !badTicketAdminOpen && !accountsAdminOpen ? "current" : ""}`} onClick={() => { setAssistOpen(true); setBadTicketAdminOpen(false); setAccountsAdminOpen(false); }}><Sparkles size={17} /><span>Bad tiket</span><span className="rail-new">TOOLS</span></button>
          {admin && <button className={`rail-item ${assistOpen && badTicketAdminOpen ? "current" : ""}`} onClick={() => { setAssistOpen(true); setBadTicketAdminOpen(true); setAccountsAdminOpen(false); }}><Pencil size={16} /><span>Edit bad tiket</span></button>}
          {admin && <button className={`rail-item ${accountsAdminOpen ? "current" : ""}`} onClick={() => { setAssistOpen(false); setBadTicketAdminOpen(false); setAccountsAdminOpen(true); }}><Users size={16} /><span>Kelola akun</span></button>}
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
              <div className="eyebrow"><span>PERPUSTAKAAN</span><ChevronRight size={13} /> {accountsAdminOpen ? "PENGELOLAAN AKUN" : badTicketAdminOpen ? "PENGELOLAAN BAD TIKET" : assistOpen ? "PEMERIKSA BAD TIKET" : "PANDUAN PRODUK"}</div>
              <h1>{accountsAdminOpen ? <>Kelola <em>akun tim.</em></> : badTicketAdminOpen ? <>Atur <em>aturan tiket.</em></> : assistOpen ? <>Periksa <em>bad tiket.</em></> : <>Buku kecil, <em>jawaban besar.</em></>}</h1>
              <p>{accountsAdminOpen ? "Buat akun dan pantau anggota tim yang sedang online." : badTicketAdminOpen ? "Kelola opsi dropdown dan kombinasi yang dinilai sesuai." : assistOpen ? "Isi detail pelaporan untuk memeriksa kesesuaian KIP." : "Semua yang perlu kamu tahu, tersimpan rapi di sini."}</p>
            </div>
            {admin && !assistOpen && !accountsAdminOpen && <button className="add-button" onClick={() => setEditing(null)}><Plus size={16} /> Tulis halaman</button>}
          </div>

          {accountsAdminOpen ? (
            <AccountAdminPanel token={token} onBack={() => setAccountsAdminOpen(false)} />
          ) : assistOpen ? (
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
          <div className="bottom-caption"><span><CircleHelp size={14} /> {admin ? "Ada yang perlu diperbarui?" : "Sesi aktif"}</span><button onClick={() => admin ? setEditing(null) : logout()}>{admin ? "Tambahkan pengetahuan" : "Keluar dari akun"} <ArrowRight size={13} /></button><span className="caption-spacer" /> <span className="page-ornament">✳</span></div>
        </section>
      </main>

      {editing !== undefined && <EntryEditor entry={editing} onClose={() => setEditing(undefined)} onSave={saveEntry} localOnly={!token} />}
      {toast && <div className="toast"><Check size={16} /> {toast}</div>}
    </div>
  );
}

function LoginScreen({ theme, onAuthenticated }) {
  const [mode, setMode] = useState("user");
  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: mode === "user" ? accountId.trim() : "", password })
      });
      if (!response.ok) throw new Error(await getResponseError(response, "Gagal masuk"));
      const session = await response.json();
      sessionStorage.setItem(SESSION_STORAGE_KEY, session.token);
      onAuthenticated(session);
    } catch (requestError) {
      setError(requestError.message || "Layanan login tidak tersedia. Periksa koneksi lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app-shell login-shell" data-theme={theme}>
      <header className="login-topbar">
        <a className="brand" href="#" onClick={(event) => event.preventDefault()}>
          <span className="brand-mark"><BookOpen size={19} strokeWidth={1.8} /></span>
          <span>paririmbon<span className="brand-dot">.</span><small>BUKU PENGETAHUAN TIM</small></span>
        </a>
        <span className="login-private"><LockKeyhole size={13} /> Akses terbatas untuk tim</span>
      </header>
      <main className="login-main">
        <div className="login-card">
          <span className="login-emblem"><BookOpen size={22} /></span>
          <span className="section-kicker">SELAMAT DATANG KEMBALI</span>
          <h1>Masuk ke <em>Paririmbon.</em></h1>
          <p>Gunakan akun tim untuk membuka buku pengetahuan dan alat kerja.</p>
          <div className="login-modes" role="tablist" aria-label="Jenis akun">
            <button type="button" className={mode === "user" ? "selected" : ""} role="tab" aria-selected={mode === "user"} onClick={() => { setMode("user"); setError(""); }}>
              <UserRound size={15} /> Pegawai
            </button>
            <button type="button" className={mode === "admin" ? "selected" : ""} role="tab" aria-selected={mode === "admin"} onClick={() => { setMode("admin"); setError(""); }}>
              <ShieldCheck size={15} /> Admin
            </button>
          </div>
          <form onSubmit={submit}>
            {mode === "user" && <>
              <label className="field-label" htmlFor="login-id">ID akun</label>
              <input autoFocus id="login-id" className="text-input" value={accountId} onChange={(event) => setAccountId(event.target.value)} placeholder="Masukkan ID akun" autoComplete="username" required maxLength={32} />
            </>}
            <label className="field-label login-password-label" htmlFor="login-password">{mode === "admin" ? "Kata sandi admin" : "Kata sandi"}</label>
            <input id="login-password" className="text-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Masukkan kata sandi" autoComplete="current-password" required maxLength={128} />
            {mode === "admin" && <span className="login-hint">Admin masuk menggunakan kata sandi yang telah dikonfigurasi.</span>}
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="primary-action login-submit" type="submit" disabled={submitting}>
              <LogIn size={16} /> {submitting ? "Memeriksa..." : "Masuk"}
            </button>
          </form>
          <div className="login-footer"><ShieldCheck size={13} /> Sesi login aman dan akan berakhir setelah 8 jam.</div>
        </div>
        <div className="login-decoration"><span>✳</span><p>Pengetahuan terbaik<br />adalah yang dibagikan.</p></div>
      </main>
    </div>
  );
}

function AccountAdminPanel({ token, onBack }) {
  const [accounts, setAccounts] = useState([]);
  const [employeeName, setEmployeeName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");
  const [importCandidates, setImportCandidates] = useState([]);
  const [importFileName, setImportFileName] = useState("");
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [resetTarget, setResetTarget] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function refreshAccounts() {
      try {
        const response = await fetch(`${API}/api/admin/accounts`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(await getResponseError(response, "Gagal memuat akun"));
        const data = await response.json();
        if (!cancelled) {
          setAccounts(data.accounts);
          setLoadError("");
          setLoading(false);
        }
      } catch (requestError) {
        if (!cancelled) {
          setLoadError(requestError.message || "Gagal memuat akun.");
          setLoading(false);
        }
      }
    }
    refreshAccounts();
    const timer = window.setInterval(refreshAccounts, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token]);

  async function request(path, method, body) {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!response.ok) throw new Error(await getResponseError(response, "Server menolak perubahan"));
    return response.status === 204 ? null : response.json();
  }

  async function createAccount(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      await request("/api/admin/accounts", "POST", {
        name: employeeName.trim(),
        id: accountId.trim(),
        password
      });
      setEmployeeName("");
      setAccountId("");
      setPassword("");
      setMessage(`Akun ${employeeName.trim()} berhasil dibuat.`);
    } catch (requestError) {
      setError(requestError.message || "Gagal membuat akun.");
    } finally {
      setSaving(false);
    }
  }

  async function selectImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setMessage("");
    setImportResult(null);
    setImportCandidates([]);
    setImportFileName("");
    try {
      const candidates = await readAccountsFromWorkbook(file);
      setImportCandidates(candidates);
      setImportFileName(file.name);
    } catch (requestError) {
      setError(requestError.message || "Gagal membaca file Excel.");
    }
  }

  async function downloadTemplate() {
    setError("");
    setTemplateLoading(true);
    try {
      await createAccountTemplate();
    } catch (requestError) {
      setError(requestError.message || "Gagal membuat template Excel.");
    } finally {
      setTemplateLoading(false);
    }
  }

  async function importAccounts() {
    setError("");
    setMessage("");
    setImporting(true);
    try {
      const result = await request("/api/admin/accounts/import", "POST", { accounts: importCandidates });
      setAccounts((current) => [
        ...result.imported.map((account) => ({
          ...account,
          online: false,
          lastSeenAt: null
        })),
        ...current.filter((account) => !result.imported.some((added) => added.id === account.id))
      ]);
      setImportResult(result);
      setImportCandidates([]);
      setImportFileName("");
      setMessage(`${result.imported.length} akun berhasil diimpor${result.skipped.length ? `; ${result.skipped.length} ID dilewati karena sudah terdaftar` : ""}.`);
    } catch (requestError) {
      setError(requestError.message || "Gagal mengimpor akun.");
    } finally {
      setImporting(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      await request(`/api/admin/accounts/${encodeURIComponent(resetTarget)}/password`, "PUT", { password: resetPassword });
      setMessage(`Kata sandi akun ${resetTarget} berhasil diperbarui.`);
      setResetTarget("");
      setResetPassword("");
    } catch (requestError) {
      setError(requestError.message || "Gagal memperbarui kata sandi.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount(id) {
    if (!window.confirm(`Hapus akun ${id}? Pengguna ini akan langsung kehilangan akses.`)) return;
    setError("");
    setMessage("");
    try {
      await request(`/api/admin/accounts/${encodeURIComponent(id)}`, "DELETE");
      setAccounts((current) => current.filter((account) => account.id !== id));
      setMessage(`Akun ${id} berhasil dihapus.`);
    } catch (requestError) {
      setError(requestError.message || "Gagal menghapus akun.");
    }
  }

  return (
    <section className="account-admin">
      <div className="account-admin-intro">
        <div><span className="section-kicker">ADMINISTRASI TIM</span><h2>Akun dan aktivitas.</h2><p>Status online diperbarui otomatis setiap beberapa detik.</p></div>
        <button className="close-book-button" type="button" onClick={onBack}><ChevronLeft size={15} /> Kembali ke buku</button>
      </div>
      <form className="account-create-form" onSubmit={createAccount}>
        <div className="account-form-heading"><UserRound size={16} /><div><b>Buat akun pegawai</b><span>ID 3–32 karakter, kata sandi minimal 8 karakter.</span></div></div>
        <div className="account-create-fields">
          <label><span className="field-label">Nama pegawai</span><input className="text-input" value={employeeName} onChange={(event) => setEmployeeName(event.target.value)} placeholder="Nama lengkap" required maxLength={100} /></label>
          <label><span className="field-label">ID akun</span><input className="text-input" value={accountId} onChange={(event) => setAccountId(event.target.value)} placeholder="contoh: nama.tim" required minLength={3} maxLength={32} pattern="[a-zA-Z0-9._-]+" /></label>
          <label><span className="field-label">Kata sandi awal</span><input className="text-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimal 8 karakter" required minLength={8} maxLength={128} autoComplete="new-password" /></label>
          <button className="primary-action" type="submit" disabled={saving}><Plus size={15} /> Buat akun</button>
        </div>
      </form>
      <div className="account-import">
        <div className="account-form-heading"><FileSpreadsheet size={16} /><div><b>Impor dari Excel</b><span>File .xlsx, maksimal 200 akun per impor.</span></div></div>
        <div className="account-import-actions">
          <button className="rule-edit-button" type="button" onClick={downloadTemplate} disabled={templateLoading}>
            <Download size={14} /> {templateLoading ? "Membuat template..." : "Unduh template"}
          </button>
          <label className="rule-edit-button account-file-label">
            <Upload size={14} /> Pilih file Excel
            <input className="account-file-input" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={selectImportFile} />
          </label>
        </div>
        {importFileName && <div className="account-import-preview">
          <div className="account-import-file"><FileSpreadsheet size={14} /><span>{importFileName}</span><b>{importCandidates.length} akun</b></div>
          <div className="account-import-list">
            {importCandidates.slice(0, 5).map((account) => <span key={account.id}>{account.name} <small>({account.id})</small></span>)}
            {importCandidates.length > 5 && <small>dan {importCandidates.length - 5} akun lainnya</small>}
          </div>
          <p>Kata sandi tidak ditampilkan. Akun dengan ID yang sudah terdaftar akan dilewati.</p>
          <div className="account-import-confirm">
            <button type="button" className="close-book-button" onClick={() => { setImportCandidates([]); setImportFileName(""); }}>Batal</button>
            <button type="button" className="primary-action" onClick={importAccounts} disabled={importing}>
              <Upload size={14} /> {importing ? "Mengimpor..." : `Impor ${importCandidates.length} akun`}
            </button>
          </div>
        </div>}
        {importResult?.skipped?.length > 0 && <div className="account-import-skipped">
          <b>ID dilewati karena sudah terdaftar:</b> {importResult.skipped.map((account) => `${account.name} (${account.id})`).join(", ")}
        </div>}
      </div>
      {loadError && <div className="form-error account-message" role="alert">{loadError}</div>}
      {error && <div className="form-error account-message" role="alert">{error}</div>}
      {message && <div className="account-success" role="status">{message}</div>}
      <div className="account-list-heading"><div><span className="section-kicker">PRESENSI REALTIME</span><h3>Anggota tim <span>({accounts.filter((account) => account.online).length} online)</span></h3></div><span className="account-refresh"><span className="live-dot" /> Pembaruan otomatis</span></div>
      <div className="account-list">
        {loading ? <p className="account-empty">Memuat daftar akun...</p> : loadError ? <p className="account-empty">Status online belum dapat dimuat.</p> : accounts.length ? accounts.map((account) => (
          <div className="account-entry" key={account.id}>
            <div className="account-entry-main">
              <span className={`account-status${account.online ? " online" : ""}`} />
              <div><b>{account.name || account.id}</b><span className="account-username">{account.id}</span><span className={`account-presence${account.online ? " online" : ""}`}>{account.online ? "Online sekarang" : "Offline"}</span></div>
              <small>{account.online ? "Aktif" : account.lastSeenAt ? `Terakhir aktif ${new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(account.lastSeenAt))}` : "Belum pernah masuk"}</small>
            </div>
            <div className="account-actions">
              <button type="button" className="rule-edit-button" onClick={() => { setResetTarget(resetTarget === account.id ? "" : account.id); setResetPassword(""); setError(""); }}><LockKeyhole size={13} /> Atur sandi</button>
              <button type="button" className="rule-delete-button" aria-label={`Hapus akun ${account.id}`} onClick={() => deleteAccount(account.id)}><Trash2 size={13} /></button>
            </div>
            {resetTarget === account.id && <form className="account-reset-form" onSubmit={changePassword}>
              <label htmlFor={`reset-${account.id}`}>Kata sandi baru</label>
              <input id={`reset-${account.id}`} className="text-input" type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} placeholder="Minimal 8 karakter" required minLength={8} maxLength={128} autoComplete="new-password" />
              <button className="primary-action" type="submit" disabled={saving}><Check size={14} /> Simpan</button>
            </form>}
          </div>
        )) : <p className="account-empty">Belum ada akun pegawai. Buat akun pertama untuk tim.</p>}
      </div>
      <div className="account-admin-footer"><span><ShieldCheck size={14} /> Akun yang dihapus langsung kehilangan akses ke API.</span></div>
    </section>
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
            <SearchableSelect
              id={`ticket-${field}`}
              value={submission[field]}
              options={options}
              onChange={(value) => onEdit(field, value)}
              placeholder={`Pilih atau ketik ${label.toLowerCase()}`}
              required
            />
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
            <div className="result-label"><span className="result-spark"><Sparkles size={13} /></span> HASIL PEMERIKSAAN <span className={`ticket-status${result.isUnconfigured ? "" : ` ${result.isBadTicket ? "bad" : "good"}`}`}>{result.isUnconfigured ? "BELUM ADA KETENTUAN" : result.isBadTicket ? "BAD TIKET" : "BUKAN BAD TIKET"}</span></div>
            <h3>{result.isUnconfigured
              ? <>Kombinasi belum<br /><em>ada ketentuannya.</em></>
              : result.isBadTicket ? <>Tiket perlu<br /><em>diperbaiki.</em></> : <>Tiket sudah<br /><em>sesuai aturan.</em></>}</h3>
            <p className="ticket-result-summary">{result.isUnconfigured
              ? "Belum ada ketentuannya, Mohon konfirm ke TL dulu yaaa, jangan lupa kasih tau Aku (With Love, Iky)"
              : result.isBadTicket
              ? result.expectedRule?.special === "all-kips-bad"
                ? "Kombinasi case pelanggan, jenis kendala, dan status ONU cocok dengan aturan All KIP pasti Bad."
                : "Kombinasi KIP, case pelanggan, jenis kendala, dan status ONU tidak ditemukan pada aturan yang disetujui."
              : "Semua pilihan cocok dengan kombinasi aturan yang disetujui admin."}</p>
            {result.isBadTicket && !result.isUnconfigured && <div className="ticket-label-wrap"><label className="field-label" htmlFor="bad-ticket-label">Rekomendasi redaksi pelabelan</label>{result.formattedLabel
              ? <div id="bad-ticket-label" className="text-input ticket-label ticket-label-preview" role="textbox" aria-readonly="true" tabIndex={0}>{result.label.split(/(SESUAIKAN)/g).map((part, index) => part === "SESUAIKAN" ? <strong className="ticket-label-emphasis" key={index}>{part}</strong> : part)}</div>
              : <textarea id="bad-ticket-label" className="text-input ticket-label" value={result.label} readOnly />}</div>}
            {result.isBadTicket && !result.isUnconfigured && result.expectedRule?.sourceLink && <a className="ticket-source-link" href={result.expectedRule.sourceLink} target="_blank" rel="noreferrer"><FileText size={14} /> Buka source KMS <ArrowRight size={14} /></a>}
          </div>
        )}
        <div className="result-bottom"><span>✳</span> DIRANGKUM DARI PENGETAHUAN TIM</div>
      </div>
    </div>
  );
}

function BadTicketAdminPanel({ config, onSave, onBack, localOnly }) {
  const [draft, setDraft] = useState(config);
  const [editingRuleIndex, setEditingRuleIndex] = useState(null);
  const [ruleFilters, setRuleFilters] = useState({ kip: "", customerCase: "", issueType: "", onuStatus: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const optionFields = [
    { field: "kips", label: "KIP pelaporan" },
    { field: "customerCases", label: "Case pelaporan pelanggan" },
    { field: "issueTypes", label: "Jenis kendala" },
    { field: "onuStatuses", label: "Status ONU" }
  ];

  useEffect(() => setDraft(config), [config]);

  const filteredRules = useMemo(() => draft.rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => BAD_TICKET_RULE_FILTER_FIELDS.every(({ field }) =>
      !ruleFilters[field] || (field === "onuStatus"
        ? (rule.onuStatuses || [rule.onuStatus]).includes(ruleFilters[field])
        : rule[field] === ruleFilters[field])
    )), [draft.rules, ruleFilters]);

  useEffect(() => {
    setRuleFilters((current) => Object.fromEntries(BAD_TICKET_RULE_FILTER_FIELDS.map(({ field }) => {
      const availableValues = new Set(draft.rules.map((rule) => rule[field]));
      return [field, availableValues.has(current[field]) ? current[field] : ""];
    })));
  }, [draft.rules]);

  function updateRule(index, field, value) {
    setDraft((current) => ({
      ...current,
      rules: current.rules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, [field]: value } : rule)
    }));
  }

  function addRule() {
    const newRule = {
      kip: draft.kips[0] || "",
      customerCase: draft.customerCases[0] || "",
      issueType: draft.issueTypes[0] || "",
      onuStatuses: draft.onuStatuses[0] ? [draft.onuStatuses[0]] : [],
      recommendation: "",
      sourceLink: "",
      hashtag: "#salah_kategori"
    };
    setDraft((current) => ({ ...current, rules: [...current.rules, newRule] }));
    setEditingRuleIndex(draft.rules.length);
  }

  function deleteRule(index) {
    setDraft((current) => ({
      ...current,
      rules: current.rules.filter((_, ruleIndex) => ruleIndex !== index)
    }));
    if (editingRuleIndex === index) setEditingRuleIndex(null);
    else if (editingRuleIndex !== null && index < editingRuleIndex) setEditingRuleIndex(editingRuleIndex - 1);
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
    normalized.onuStatuses = [...new Set([
      ...normalized.onuStatuses,
      missingOnuStatus,
      missingOnuNoacsStatus
    ])];
    normalized.rules = normalized.rules.map((rule) => {
      const updatedRule = {
        ...rule,
        onuStatuses: [...new Set(Array.isArray(rule.onuStatuses)
          ? rule.onuStatuses
          : typeof rule.onuStatus === "string" ? [rule.onuStatus] : [])]
      };
      optionFields.forEach(({ field }) => {
        const removed = config[field].filter((value) => !normalized[field].includes(value));
        const added = normalized[field].filter((value) => !config[field].includes(value));
        if (removed.length === 1 && added.length === 1) {
          if (field === "onuStatuses") {
            updatedRule.onuStatuses = updatedRule.onuStatuses.map((status) =>
              status === removed[0] ? added[0] : status
            );
          } else {
            const ruleField = { kips: "kip", customerCases: "customerCase", issueTypes: "issueType" }[field];
            if (updatedRule[ruleField] === removed[0]) updatedRule[ruleField] = added[0];
          }
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
      ];
      const missingOptions = fields
        .filter(([, ruleField, optionField]) =>
          !(optionField === "kips" && allKipRuleOptions.includes(rule[ruleField])) &&
          !(optionField === "issueTypes" && rule[ruleField] === allIssueTypes) &&
          !normalized[optionField].includes(rule[ruleField])
        )
        .map(([label]) => label);
      if (!Array.isArray(rule.onuStatuses) || !rule.onuStatuses.length ||
        rule.onuStatuses.some((status) => !normalized.onuStatuses.includes(status))) {
        missingOptions.push("Status ONU");
      }
      if (!BAD_TICKET_HASHTAGS.includes(rule.hashtag)) missingOptions.push("hashtag");
      if (!isHttpLink(rule.sourceLink)) missingOptions.push("source link");
      return missingOptions.length ? [`Aturan #${index + 1}: periksa ${missingOptions.join(", ")}.`] : [];
    });
    const signatures = normalized.rules.map((rule) => JSON.stringify([
      rule.kip,
      rule.customerCase,
      rule.issueType,
      [...rule.onuStatuses].sort()
    ]));
    if (invalidOption) {
      setError(`Tambahkan minimal satu pilihan untuk “${invalidOption.label}”.`);
      return;
    }
    if (normalized.kips.some((kip) => allKipRuleOptions.includes(kip))) {
      setError("Pilihan All KIP hanya tersedia pada editor aturan dan tidak boleh menjadi KIP pelaporan.");
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
    if (hasConflictingAllKipRules(normalized.rules)) {
      setError("Aturan All KIP Bad dan All KIP Tidak bad tidak boleh berlaku untuk kombinasi yang sama.");
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
      <div className="bad-ticket-admin-intro"><div><span className="section-kicker">MODE ADMIN</span><h2>Kelola dropdown dan aturan.</h2><p>Atur kombinasi yang bukan bad tiket atau tandai kombinasi tertentu sebagai bad tiket untuk semua KIP.</p></div><button className="close-book-button" type="button" onClick={onBack}><ChevronLeft size={15} /> Kembali ke pemeriksa</button></div>
      <div className="bad-ticket-option-grid">
        {optionFields.map(({ field, label }) => <div className="bad-ticket-option" key={field}>
          <div className="bad-ticket-option-head">
            <label className="field-label" htmlFor={`bad-ticket-options-${field}`}>{label}<small>Pisahkan pilihan dengan baris baru</small></label>
            <button
              type="button"
              className="option-sort-button"
              onClick={() => setDraft((current) => ({
                ...current,
                [field]: current[field]
                  .filter((value) => value.trim())
                  .sort((first, second) => first.localeCompare(second, "id", { sensitivity: "base" }))
              }))}
            >Sortir A-Z</button>
          </div>
          <textarea id={`bad-ticket-options-${field}`} className="text-input" value={draft[field].join("\n")} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value.split("\n") }))} rows={5} />
        </div>)}
      </div>
      <div className="bad-ticket-rules-head"><div><span className="section-kicker">KOMBINASI YANG DISETUJUI</span><h3>Aturan validasi <span>({filteredRules.length}/{draft.rules.length})</span></h3></div><button type="button" className="add-button" onClick={addRule}><Plus size={15} /> Tambah aturan</button></div>
      {!draft.rules.length && <p className="bad-ticket-no-rules">Belum ada kombinasi yang disetujui. Semua tiket yang diperiksa akan dianggap bad tiket.</p>}
      {draft.rules.length > 0 && <div className="bad-ticket-rule-filters">
        {BAD_TICKET_RULE_FILTER_FIELDS.map(({ field, label, allLabel }) => {
          const values = [...new Set(draft.rules.flatMap((rule) =>
            field === "onuStatus" ? (rule.onuStatuses || [rule.onuStatus]).filter(Boolean) : [rule[field]].filter(Boolean)
          ))];
          return <div className="bad-ticket-rule-filter" key={field}><label htmlFor={`rule-filter-${field}`}>{label}</label><SearchableSelect
            id={`rule-filter-${field}`}
            value={ruleFilters[field] || allLabel}
            options={[allLabel, ...values]}
            onChange={(value) => setRuleFilters((current) => ({ ...current, [field]: value === allLabel ? "" : value }))}
            placeholder={allLabel}
            compact
          /></div>;
        })}
      </div>}
      <div className="bad-ticket-rules">
        {filteredRules.map(({ rule, index }) => <div className="bad-ticket-rule-summary" key={`rule-${index}`}>
          <div className="bad-ticket-rule-summary-copy">
            <strong>{rule.customerCase || "Case belum dipilih"}</strong>
            <span>{[rule.kip, rule.issueType, (rule.onuStatuses || [rule.onuStatus]).filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "Kombinasi belum lengkap"}</span>
            <small>{rule.hashtag || "#salah_kategori"}{rule.recommendation ? ` · ${rule.recommendation}` : ""}</small>
          </div>
          <div className="bad-ticket-rule-summary-actions">
            <button type="button" className="rule-edit-button" onClick={() => setEditingRuleIndex(index)}><Pencil size={13} /> Edit</button>
            <button type="button" className="rule-delete-button" aria-label={`Hapus aturan ${index + 1}`} onClick={() => deleteRule(index)}><Trash2 size={13} /></button>
          </div>
        </div>)}
        {draft.rules.length > 0 && filteredRules.length === 0 && <p className="bad-ticket-no-rules">Tidak ada aturan yang cocok dengan filter ini.</p>}
      </div>
      {error && <div className="form-error bad-ticket-error">{error}</div>}
      <div className="bad-ticket-admin-footer"><span><ShieldCheck size={14} /> {localOnly ? "Mode demo: konfigurasi hanya tersimpan di perangkat ini." : "Konfigurasi akan disimpan ke MongoDB dan dibagikan ke pegawai."}</span><button className="primary-action" type="submit" disabled={saving}><Check size={16} /> {saving ? "Menyimpan..." : "Simpan konfigurasi"}</button></div>
      {editingRuleIndex !== null && draft.rules[editingRuleIndex] && <div className="modal-backdrop rule-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingRuleIndex(null); }}>
        <section className="rule-editor-modal" role="dialog" aria-modal="true" aria-labelledby="rule-editor-title">
          <div className="editor-header"><div><span className="section-kicker">ATURAN VALIDASI #{editingRuleIndex + 1}</span><h2 id="rule-editor-title">Edit kombinasi aturan.</h2></div><button type="button" className="modal-close" onClick={() => setEditingRuleIndex(null)} aria-label="Tutup"><X size={17} /></button></div>
          <div className="rule-editor-fields">
            {[
              { field: "kip", label: "KIP", options: [...draft.kips, allKipsBad, allKipsNotBad] },
              { field: "customerCase", label: "Case pelanggan", options: draft.customerCases },
              { field: "issueType", label: "Jenis kendala", options: [allIssueTypes, ...draft.issueTypes] }
            ].map(({ field, label, options }) => <label className="bad-ticket-rule-field" key={field}><span>{label}</span><SearchableSelect value={draft.rules[editingRuleIndex][field]} options={options} onChange={(value) => updateRule(editingRuleIndex, field, value)} placeholder={`Pilih ${label.toLowerCase()}`} required /></label>)}
            <fieldset className="bad-ticket-rule-field rule-onu-statuses">
              <legend>Status ONU</legend>
              <small className="rule-onu-status-hint">Pilih satu atau lebih status ONU untuk aturan ini.</small>
              <div className="rule-onu-status-options">
                {draft.onuStatuses.map((status) => <label key={status}>
                  <input
                    type="checkbox"
                    checked={(draft.rules[editingRuleIndex].onuStatuses || [draft.rules[editingRuleIndex].onuStatus]).includes(status)}
                    onChange={(event) => {
                      const selected = new Set(draft.rules[editingRuleIndex].onuStatuses || [draft.rules[editingRuleIndex].onuStatus]);
                      if (event.target.checked) selected.add(status);
                      else selected.delete(status);
                      updateRule(editingRuleIndex, "onuStatuses", draft.onuStatuses.filter((option) => selected.has(option)));
                    }}
                  />
                  <span>{status}</span>
                </label>)}
              </div>
            </fieldset>
            <label className="bad-ticket-rule-field rule-editor-wide"><span>Redaksi rekomendasi bad tiket <small>(opsional)</small></span><textarea className="text-input" value={draft.rules[editingRuleIndex].recommendation || ""} maxLength={2000} rows={4} onChange={(event) => updateRule(editingRuleIndex, "recommendation", event.target.value)} placeholder="Tulis rekomendasi untuk kombinasi ini." /></label>
            <label className="bad-ticket-rule-field rule-editor-wide"><span>Source link KMS</span><input className="text-input" type="url" value={draft.rules[editingRuleIndex].sourceLink || ""} onChange={(event) => updateRule(editingRuleIndex, "sourceLink", event.target.value)} placeholder="https://kms.telkomsel.co.id/content/" required /></label>
            <label className="bad-ticket-rule-field rule-editor-wide"><span>Hashtag bad tiket</span><select className="text-input" value={draft.rules[editingRuleIndex].hashtag || "#salah_kategori"} onChange={(event) => updateRule(editingRuleIndex, "hashtag", event.target.value)} required>{BAD_TICKET_HASHTAGS.map((hashtag) => <option key={hashtag} value={hashtag}>{hashtag}</option>)}</select></label>
          </div>
          <div className="rule-editor-footer"><button type="button" className="delete-action" onClick={() => deleteRule(editingRuleIndex)}><Trash2 size={14} /> Hapus aturan</button><button type="button" className="primary-action" onClick={() => setEditingRuleIndex(null)}><Check size={16} /> Selesai mengedit</button></div>
        </section>
      </div>}
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
