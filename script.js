const ARTICLE_KEY = "heBookroomArticlesV2";
const USER_KEY = "heBookroomUsersV2";
const EBOOK_KEY = "heBookroomEbooksV1";
const READING_PLAN_KEY = "heBookroomReadingPlanV1";
const ACTIVITY_KEY = "heBookroomActivitiesV1";
const ADMIN_PASSCODE = "heshufang-admin";

const SUPABASE_CONFIG = window.HE_SHUFANG_SUPABASE || { url: "", anonKey: "" };
const SUPABASE_BUCKET = "ebooks";
const CLOUD_STATE_FILE = "heshufang-state.json";
const CLOUD_STATE_KEY = "__hsf_cloud_updated_at__";

const articleForm = document.querySelector("#excerpt-form");
const articleList = document.querySelector("#article-list");
const articleTemplate = document.querySelector("#article-template");
const currentBook = document.querySelector("#current-book");
const activityList = document.querySelector("#activity-list");
const readingDetail = document.querySelector("#reading-detail");

const monthlyEbookList = document.querySelector("#monthly-ebook-list");
const ebookAccessStatus = document.querySelector("#ebook-access-status");
const ebookReader = document.querySelector("#ebook-reader");
const ebookReaderTitle = document.querySelector("#ebook-reader-title");
const ebookReaderBody = document.querySelector("#ebook-reader-body");
const ebookReaderClose = document.querySelector("#ebook-reader-close");

const adminLoginForm = document.querySelector("#admin-login-form");
const adminStatus = document.querySelector("#admin-status");
const ebookUploadForm = document.querySelector("#ebook-upload-form");
const ebookUploadStatus = document.querySelector("#ebook-upload-status");
const readingPlanForm = document.querySelector("#reading-plan-form");
const readingPlanStatus = document.querySelector("#reading-plan-status");
const adminUserTable = document.querySelector("#admin-user-table");
const adminUserList = document.querySelector("#admin-user-list");
const adminCommentTable = document.querySelector("#admin-comment-table");
const adminCommentList = document.querySelector("#admin-comment-list");
const adminSubmenu = document.querySelector("#admin-submenu");

const starterArticles = [
  {
    id: "article-1",
    author: "Anna",
    title: "6月开始一起读《教学七律》",
    body: "从经典读起，一个月读完《教学七律》。",
    createdAt: "2026-05-20T08:30:00.000Z",
    comments: []
  }
];

const starterUsers = [{ id: "u-1", name: "访客", phone: "未登记", createdAt: new Date().toISOString() }];
const starterEbooks = [];
const defaultReadingPlan = {
  label: "6月共读",
  title: "《教学七律》",
  coverText: "教学七律",
  description: "精炼揭示教学核心规律，以清晰原则指导实践。",
  weeks: ["第1周 · 1-3章", "第2周 · 4-6章", "第3周 · 7-9章", "第4周 · 分享会"]
};
const starterActivities = [
  { id: "ac-1", title: "欢迎加入禾书房读书会", detail: "每周更新共读计划", createdAt: new Date().toISOString() }
];

function loadJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value || fallback;
  } catch {
    return fallback;
  }
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCoverText(value) {
  return escapeHtml(value).split("").join("<br />");
}

function getFileExtension(fileName = "") {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

async function readFileAsDataUrl(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function sanitizeStorageFileName(fileName) {
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "bin";
  const safeBase = base
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || `ebook-${Date.now()}`;
  return `${safeBase}.${ext}`;
}

function storagePublicUrl(path) {
  const root = (SUPABASE_CONFIG.url || "").replace(/\/+$/, "");
  return `${root}/storage/v1/object/public/${SUPABASE_BUCKET}/${encodeURIComponent(path)}`;
}

function storageUploadUrl(path) {
  const root = (SUPABASE_CONFIG.url || "").replace(/\/+$/, "");
  return `${root}/storage/v1/object/${SUPABASE_BUCKET}/${encodeURIComponent(path)}`;
}

async function uploadToSupabaseStorage(file) {
  if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) return null;
  const safeName = sanitizeStorageFileName(file.name || "ebook.pdf");
  const response = await fetch(storageUploadUrl(safeName), {
    method: "POST",
    headers: {
      apikey: SUPABASE_CONFIG.anonKey,
      Authorization: `Bearer ${SUPABASE_CONFIG.anonKey}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "true"
    },
    body: file
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `upload failed: ${response.status}`);
  }
  return { storageName: safeName, publicUrl: storagePublicUrl(safeName) };
}

let articles = loadJson(ARTICLE_KEY, starterArticles);
let users = loadJson(USER_KEY, starterUsers);
let ebooks = loadJson(EBOOK_KEY, starterEbooks);
let readingPlan = loadJson(READING_PLAN_KEY, defaultReadingPlan);
let activities = loadJson(ACTIVITY_KEY, starterActivities);
let adminAuthed = false;
let adminPane = "login";
let openEbookId = "";
let cloudConnected = Boolean(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey);
let cloudUpdatedAt = Number(localStorage.getItem(CLOUD_STATE_KEY) || 0);
let cloudSyncTimer = null;
let cloudSyncing = false;

function buildCloudState() {
  return {
    updatedAt: Date.now(),
    articles,
    users,
    ebooks,
    readingPlan,
    activities
  };
}

function applyCloudState(state) {
  if (!state || typeof state !== "object" || !Array.isArray(state.articles)) return;
  articles = state.articles;
  users = Array.isArray(state.users) ? state.users : users;
  ebooks = Array.isArray(state.ebooks) ? state.ebooks : ebooks;
  readingPlan = state.readingPlan && typeof state.readingPlan === "object" ? state.readingPlan : readingPlan;
  activities = Array.isArray(state.activities) ? state.activities : activities;

  localStorage.setItem(ARTICLE_KEY, JSON.stringify(articles));
  localStorage.setItem(USER_KEY, JSON.stringify(users));
  localStorage.setItem(EBOOK_KEY, JSON.stringify(ebooks));
  localStorage.setItem(READING_PLAN_KEY, JSON.stringify(readingPlan));
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activities));

  renderReadingPlan();
  renderActivities();
  renderArticles();
  renderEbooks();
  renderReadingDetail();
  renderAdminUsers();
  renderAdminComments();
}

async function pullCloudState() {
  if (!SUPABASE_CONFIG.url) return null;
  const res = await fetch(`${storagePublicUrl(CLOUD_STATE_FILE)}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) return null;
  return await res.json();
}

async function pushCloudState(force = false) {
  if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey || cloudSyncing) return;
  cloudSyncing = true;
  try {
    const state = buildCloudState();
    if (!force && state.updatedAt <= cloudUpdatedAt) return;
    const res = await fetch(storageUploadUrl(CLOUD_STATE_FILE), {
      method: "POST",
      headers: {
        apikey: SUPABASE_CONFIG.anonKey,
        Authorization: `Bearer ${SUPABASE_CONFIG.anonKey}`,
        "Content-Type": "application/json",
        "x-upsert": "true"
      },
      body: JSON.stringify(state)
    });
    if (!res.ok) throw new Error(`state upload failed: ${res.status}`);
    cloudUpdatedAt = state.updatedAt;
    localStorage.setItem(CLOUD_STATE_KEY, String(cloudUpdatedAt));
    cloudConnected = true;
    renderEbooks();
  } catch (e) {
    console.warn(e);
  } finally {
    cloudSyncing = false;
  }
}

function queueCloudSync() {
  if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) return;
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(() => pushCloudState(), 500);
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  queueCloudSync();
}

function addActivity(title, detail) {
  activities.unshift({ id: createId("ac"), title, detail, createdAt: new Date().toISOString() });
  activities = activities.slice(0, 8);
  saveJson(ACTIVITY_KEY, activities);
  renderActivities();
}

function renderActivities() {
  activityList.innerHTML = activities.map(a => `
    <article class="activity-item">
      <strong>${escapeHtml(a.title)}</strong>
      <span>${escapeHtml(a.detail)} · ${formatDate(a.createdAt)}</span>
    </article>
  `).join("");
}

function renderReadingPlan() {
  const currentEbook = ebooks[0];
  const coverUrl = currentEbook?.coverUrl || "";
  const coverTitle = currentEbook?.title || readingPlan.title;
  const coverHtml = coverUrl
    ? `<div class="cover image-cover"><img src="${coverUrl}" alt="${escapeHtml(coverTitle)}封面" /></div>`
    : `<div class="cover">${formatCoverText(readingPlan.coverText)}</div>`;

  currentBook.innerHTML = `
    ${coverHtml}
    <div>
      <span class="tag">${escapeHtml(readingPlan.label)}</span>
      <h3>${escapeHtml(readingPlan.title)}</h3>
      <p>${escapeHtml(readingPlan.description)}</p>
      <div class="chapter-grid">
        ${readingPlan.weeks.map((w, i) => `<button type="button" data-open-week="${i}">${escapeHtml(w)}</button>`).join("")}
      </div>
    </div>
  `;
}

function renderComments(target, comments) {
  target.innerHTML = "";
  if (!comments.length) {
    target.innerHTML = `<p class="comment-item">还没有评论，欢迎写下第一条回应。</p>`;
    return;
  }
  comments.forEach(comment => {
    const item = document.createElement("p");
    item.className = "comment-item";
    item.innerHTML = `<strong>${escapeHtml(comment.author)}</strong>：<span>${escapeHtml(comment.body)}</span>`;
    target.append(item);
  });
}

function renderArticles() {
  articleList.innerHTML = "";
  articles.forEach(article => {
    const node = articleTemplate.content.cloneNode(true);
    node.querySelector(".article-author").textContent = article.author;
    node.querySelector(".article-date").textContent = formatDate(article.createdAt);
    node.querySelector(".article-title").textContent = article.title;
    node.querySelector(".article-body").textContent = article.body;
    const commentsNode = node.querySelector(".comment-list");
    const form = node.querySelector(".comment-form");
    renderComments(commentsNode, article.comments || []);

    form.addEventListener("submit", event => {
      event.preventDefault();
      const data = new FormData(form);
      const author = String(data.get("author") || "").trim();
      const body = String(data.get("body") || "").trim();
      if (!author || !body) return;
      article.comments = article.comments || [];
      article.comments.push({ author, body });
      saveJson(ARTICLE_KEY, articles);
      pushCloudState(true);
      addActivity(`${author} 发表了评论`, `《${article.title}》`);
      renderArticles();
      renderAdminComments();
    });

    articleList.append(node);
  });
}

function renderEbooks() {
  ebookAccessStatus.textContent = cloudConnected ? "已连接云端同步" : "本地模式可阅读";
  if (!ebooks.length) {
    monthlyEbookList.innerHTML = `<article class="ebook-item"><strong>暂无电子书</strong></article>`;
    return;
  }
  const book = ebooks[0];
  monthlyEbookList.innerHTML = `
    <article class="ebook-item">
      <div>
        <strong>${escapeHtml(book.title)}</strong>
        <p class="ebook-leader">领读者：${escapeHtml(book.leader || "XXX")}</p>
        <p>${escapeHtml(book.leaderIntro || "")}</p>
      </div>
      <button class="button secondary" type="button" data-open-ebook="${escapeHtml(book.id)}">${openEbookId === book.id ? "收起阅读" : "打开阅读"}</button>
    </article>
  `;
}

async function openEbookReader(id) {
  const book = ebooks.find(item => item.id === id);
  if (!book) return;
  if (openEbookId === id && !ebookReader.hidden) {
    ebookReader.hidden = true;
    ebookReaderBody.innerHTML = "";
    openEbookId = "";
    renderEbooks();
    return;
  }
  ebookReaderTitle.textContent = book.title || "电子书阅读";
  const ext = getFileExtension(book.fileName);
  const sourceUrl = book.fileUrl || book.dataUrl || "";

  if ((book.type || "").startsWith("text/") || ["txt", "md"].includes(ext)) {
    if (!book.dataUrl) {
      ebookReaderBody.innerHTML = `<p>文本未找到</p>`;
    } else {
      const text = decodeURIComponent((book.dataUrl.split(",")[1] || ""));
      ebookReaderBody.innerHTML = `<pre class="ebook-text">${escapeHtml(text)}</pre>`;
    }
  } else if ((book.type || "") === "application/pdf" || ext === "pdf") {
    ebookReaderBody.innerHTML = `
      <div class="ebook-pdf-wrap">
        ${sourceUrl ? `<iframe class="ebook-frame" src="${sourceUrl}" title="${escapeHtml(book.title)}"></iframe>` : `<div class="ebook-frame ebook-pdf-empty"><p style="padding:12px">PDF 未找到</p></div>`}
      </div>
      ${sourceUrl ? `<a class="button secondary reader-open-link" href="${sourceUrl}" target="_blank" rel="noopener noreferrer">新窗口打开 PDF</a>` : ""}
    `;
  } else {
    ebookReaderBody.innerHTML = sourceUrl ? `<a class="button secondary" href="${sourceUrl}" target="_blank" rel="noopener noreferrer">打开文件</a>` : "无法预览此文件";
  }

  ebookReader.hidden = false;
  openEbookId = id;
  renderEbooks();
}

function renderReadingDetail() {
  const notes = articles.map(a => a.title);
  readingDetail.innerHTML = `
    <div>
      <h3>我的已读</h3>
      <ul class="mini-list"><li>《教学七律》</li><li>《失落的学艺》</li></ul>
    </div>
    <div>
      <h3>我的书摘</h3>
      <ul class="mini-list">${notes.map(n => `<li>${escapeHtml(n)}</li>`).join("")}</ul>
    </div>
  `;
}

function renderAdminUsers() {
  if (!adminAuthed) {
    adminUserList.innerHTML = "";
    return;
  }
  adminUserList.innerHTML = users.map(u => `
    <tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.phone)}</td><td>${formatDate(u.createdAt)}</td></tr>
  `).join("") || `<tr><td colspan="3">暂无用户</td></tr>`;
}

function renderAdminComments() {
  if (!adminAuthed) {
    adminCommentList.innerHTML = "";
    return;
  }
  const rows = [];
  articles.forEach(article => {
    (article.comments || []).forEach((comment, i) => {
      rows.push({ articleId: article.id, commentIndex: i, title: article.title, author: comment.author, body: comment.body });
    });
  });
  adminCommentList.innerHTML = rows.length ? rows.map(r => `
    <tr>
      <td>${escapeHtml(r.title)}</td>
      <td>${escapeHtml(r.author)}</td>
      <td>${escapeHtml(r.body)}</td>
      <td><button class="button secondary" type="button" data-delete-comment="1" data-article-id="${escapeHtml(r.articleId)}" data-comment-index="${r.commentIndex}">删除</button></td>
    </tr>
  `).join("") : `<tr><td colspan="4">暂无评论</td></tr>`;
}

function setAdminPane(pane) {
  adminPane = pane;
  const showLogin = pane === "login";
  const showUpload = pane === "upload" && adminAuthed;
  const showPlan = pane === "plan" && adminAuthed;
  const showUsers = pane === "users" && adminAuthed;
  const showComments = pane === "comments" && adminAuthed;
  adminLoginForm.hidden = !showLogin;
  ebookUploadForm.hidden = !showUpload;
  readingPlanForm.hidden = !showPlan;
  adminUserTable.hidden = !showUsers;
  adminCommentTable.hidden = !showComments;
  Array.from(adminSubmenu.querySelectorAll("[data-admin-pane]")).forEach(btn => {
    btn.classList.toggle("is-active", btn.getAttribute("data-admin-pane") === pane);
  });
}

function syncSubpageRoute() {
  const hash = (location.hash || "#home").replace("#", "");
  document.body.classList.toggle("subpage-mine", hash === "mine");
  document.body.classList.toggle("subpage-admin", hash === "admin");
  document.body.classList.toggle("subpage-monthly", hash === "monthly");
  if (hash === "admin") setAdminPane(adminAuthed ? (adminPane === "login" ? "upload" : adminPane) : "login");
}

articleForm.addEventListener("submit", event => {
  event.preventDefault();
  const data = new FormData(articleForm);
  const author = String(data.get("author") || "").trim();
  const title = String(data.get("title") || "").trim();
  const body = String(data.get("body") || "").trim();
  if (!author || !title || !body) return;
  articles.unshift({ id: createId("article"), author, title, body, createdAt: new Date().toISOString(), comments: [] });
  saveJson(ARTICLE_KEY, articles);
  pushCloudState(true);
  addActivity(`${author} 发布了笔记`, title);
  articleForm.reset();
  renderArticles();
  renderReadingDetail();
  renderAdminComments();
});

monthlyEbookList.addEventListener("click", event => {
  const btn = event.target.closest("[data-open-ebook]");
  if (!btn) return;
  openEbookReader(btn.getAttribute("data-open-ebook"));
});

currentBook.addEventListener("click", event => {
  const btn = event.target.closest("[data-open-week]");
  if (!btn || !ebooks[0]) return;
  openEbookReader(ebooks[0].id);
  document.querySelector("#monthly-ebook-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

ebookReaderClose.addEventListener("click", () => {
  ebookReader.hidden = true;
  ebookReaderBody.innerHTML = "";
  openEbookId = "";
  renderEbooks();
});

adminLoginForm.addEventListener("submit", event => {
  event.preventDefault();
  const passcode = String(new FormData(adminLoginForm).get("passcode") || "").trim();
  if (passcode !== ADMIN_PASSCODE) {
    adminAuthed = false;
    adminStatus.textContent = "管理口令错误。";
    renderAdminUsers();
    renderAdminComments();
    return;
  }
  adminAuthed = true;
  adminStatus.textContent = "验证成功。";
  adminLoginForm.reset();
  setAdminPane("upload");
  renderAdminUsers();
  renderAdminComments();
});

ebookUploadForm.addEventListener("submit", async event => {
  event.preventDefault();
  const data = new FormData(ebookUploadForm);
  const file = data.get("ebook");
  if (!(file instanceof File) || file.size === 0) return;
  const cover = data.get("cover");

  let cloudFileUrl = "";
  let cloudFileName = "";
  let mode = "本地";
  try {
    const uploaded = await uploadToSupabaseStorage(file);
    if (uploaded?.publicUrl) {
      cloudFileUrl = uploaded.publicUrl;
      cloudFileName = uploaded.storageName;
      cloudConnected = true;
      mode = "云端";
    }
  } catch (e) {
    console.warn(e);
  }

  const book = {
    id: createId("ebook"),
    title: String(data.get("title") || "").trim(),
    leader: String(data.get("leader") || "").trim(),
    leaderIntro: String(data.get("leaderIntro") || "").trim(),
    summary: String(data.get("summary") || "").trim(),
    fileName: cloudFileName || file.name,
    type: file.type || "application/octet-stream",
    dataUrl: cloudFileUrl ? "" : await readFileAsDataUrl(file),
    fileUrl: cloudFileUrl,
    coverUrl: (cover instanceof File && cover.size > 0) ? await readFileAsDataUrl(cover) : "",
    createdAt: new Date().toISOString()
  };

  ebooks = [book];
  saveJson(EBOOK_KEY, ebooks);
  pushCloudState(true);
  ebookUploadStatus.textContent = `已上传：${file.name}（${mode}）`;
  ebookUploadForm.reset();
  renderReadingPlan();
  renderEbooks();
  addActivity("管理员上传了电子书", book.title);
});

readingPlanForm.addEventListener("submit", event => {
  event.preventDefault();
  const data = new FormData(readingPlanForm);
  readingPlan = {
    label: String(data.get("label") || "").trim(),
    title: String(data.get("title") || "").trim(),
    coverText: String(data.get("coverText") || "").trim(),
    description: String(data.get("description") || "").trim(),
    weeks: [1, 2, 3, 4].map(i => String(data.get(`week${i}`) || "").trim())
  };
  saveJson(READING_PLAN_KEY, readingPlan);
  pushCloudState(true);
  readingPlanStatus.textContent = "读书计划已保存。";
  renderReadingPlan();
});

adminSubmenu.addEventListener("click", event => {
  const btn = event.target.closest("[data-admin-pane]");
  if (!btn) return;
  setAdminPane(btn.getAttribute("data-admin-pane"));
});

adminCommentList.addEventListener("click", event => {
  const btn = event.target.closest("[data-delete-comment]");
  if (!btn || !adminAuthed) return;
  const articleId = btn.getAttribute("data-article-id");
  const index = Number(btn.getAttribute("data-comment-index"));
  const article = articles.find(a => a.id === articleId);
  if (!article || !Array.isArray(article.comments) || index < 0 || index >= article.comments.length) return;
  article.comments.splice(index, 1);
  saveJson(ARTICLE_KEY, articles);
  pushCloudState(true);
  renderArticles();
  renderAdminComments();
});

window.addEventListener("hashchange", syncSubpageRoute);

async function bootstrapCloudSync() {
  if (!SUPABASE_CONFIG.url) return;
  try {
    const cloudState = await pullCloudState();
    const cloudTime = Number(cloudState?.updatedAt || 0);
    if (cloudState && cloudTime > cloudUpdatedAt) {
      cloudUpdatedAt = cloudTime;
      localStorage.setItem(CLOUD_STATE_KEY, String(cloudUpdatedAt));
      applyCloudState(cloudState);
    }
    if (SUPABASE_CONFIG.anonKey) {
      if (!cloudState) {
        await pushCloudState(true);
      }
      setInterval(async () => {
        try {
          const latest = await pullCloudState();
          const latestTime = Number(latest?.updatedAt || 0);
          if (latest && latestTime > cloudUpdatedAt) {
            cloudUpdatedAt = latestTime;
            localStorage.setItem(CLOUD_STATE_KEY, String(cloudUpdatedAt));
            applyCloudState(latest);
          }
        } catch {}
      }, 15000);
    }
  } catch {}
}

function bootstrap() {
  renderReadingPlan();
  renderActivities();
  renderArticles();
  renderEbooks();
  renderReadingDetail();
  renderAdminUsers();
  renderAdminComments();
  setAdminPane("login");
  syncSubpageRoute();
  bootstrapCloudSync();
}

bootstrap();
