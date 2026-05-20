const ARTICLE_KEY = "heBookroomArticlesV2";
const USER_KEY = "heBookroomUsersV2";
const EBOOK_KEY = "heBookroomEbooksV1";
const READING_PLAN_KEY = "heBookroomReadingPlanV1";
const ACTIVITY_KEY = "heBookroomActivitiesV1";
const ADMIN_PASSCODE = "heshufang-admin";
const SUPABASE_CONFIG = window.HE_SHUFANG_SUPABASE || { url: "", anonKey: "" };
const SUPABASE_STATE_TABLE = "heshufang_state";
const SUPABASE_STATE_ID = "global";
const cloudEnabled = Boolean(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey);
let cloudSyncTimer = null;
let cloudSyncing = false;

const starterArticles = [
  {
    id: "article-1",
    author: "青禾",
    title: "我喜欢这一句：城市不是远方",
    body: "书里写到，城市不是远方，而是我们每天路过却没有认真看见的地方。这句话很适合本月共读的主题。",
    createdAt: "2026-05-20T08:30:00.000Z",
    comments: [
      { author: "南窗", body: "这句让我想到通勤路上的树，平时真的很少停下来看。" }
    ]
  },
  {
    id: "article-2",
    author: "小满",
    title: "读到第三章时的停顿",
    body: "第三章关于记忆的段落很轻，但后劲很长。我想把它作为线下分享会的开场。",
    createdAt: "2026-05-18T12:20:00.000Z",
    comments: []
  }
];

const readingProfile = {
  book: "《教学七律》",
  progress: 68,
  badge: "稳读者勋章",
  days: 14,
  completedBookCount: 2,
  excerptCount: 10,
  finishedBooks: [
    "《教学七律》",
    "《失落的学艺》"
  ],
  notes: [
    "第 1 章：教学的七大要素：1. 教师；2. 学生；3. 一门语言或媒介；4. 一门课程或一个真理；5. 教师的工作；6. 学生的工作；7. 复习的行为"
  ],
  comments: [
    "回应了青禾：这句很适合朗读。",
    "评论了小满：第三章我也停了很久。"
  ]
};

const starterEbooks = [
  {
    id: "ebook-1",
    title: "《教学七律》",
    leader: "XXX",
    leaderIntro: "领读者介绍会在管理员上传电子书时填写，并显示在这里。",
    fileName: "city-slow-reading.txt",
    type: "text/plain",
    summary: "《教学七律》示例电子书，注册登录后可打开阅读。",
    dataUrl: `data:text/plain;charset=utf-8,${encodeURIComponent("禾书房《教学七律》试读本\n\n第1章：教学的七大要素：1. 教师；2. 学生；3. 一门语言或媒介；4. 一门课程或一个真理；5. 教师的工作；6. 学生的工作；7. 复习的行为")}`,
    createdAt: "2026-05-20T08:00:00.000Z"
  }
];

const defaultReadingPlan = {
  label: "6 月共读",
  title: "《教学七律》",
  coverText: "教学七律",
  description: "《教学七律》精炼揭示教学核心规律，以清晰原则指导实践，兼顾理论深度与操作价值。无论新手或资深教师，都能从中反思提升，是教育者的实用经典。",
  weeks: [
    "第 1 周 · 1-3 章",
    "第 2 周 · 4-6 章",
    "第 3 周 · 7-9 章",
    "第 4 周 · 分享会"
  ]
};

const starterActivities = [
  {
    id: "activity-1",
    title: "Anna 已读完第 3 章",
    detail: "本周读书进度 · 《城市慢读》",
    createdAt: "2026-05-20T09:10:00.000Z"
  },
  {
    id: "activity-2",
    title: "Anna 给 Anjo 的书摘写了点评",
    detail: "评论互动 · “我喜欢这一句：城市不是远方”",
    createdAt: "2026-05-20T08:45:00.000Z"
  },
  {
    id: "activity-3",
    title: "Anjo 新增 1 篇读者书摘",
    detail: "书摘发布 · 第 3 章阅读札记",
    createdAt: "2026-05-19T15:20:00.000Z"
  }
];

const articleForm = document.querySelector("#excerpt-form");
const articleList = document.querySelector("#article-list");
const articleTemplate = document.querySelector("#article-template");
const readingDetail = document.querySelector("#reading-detail");
const adminLoginForm = document.querySelector("#admin-login-form");
const adminStatus = document.querySelector("#admin-status");
const adminUserTable = document.querySelector("#admin-user-table");
const adminUserList = document.querySelector("#admin-user-list");
const ebookUploadForm = document.querySelector("#ebook-upload-form");
const ebookUploadStatus = document.querySelector("#ebook-upload-status");
const monthlyEbookList = document.querySelector("#monthly-ebook-list");
const ebookAccessStatus = document.querySelector("#ebook-access-status");
const ebookReader = document.querySelector("#ebook-reader");
const ebookReaderTitle = document.querySelector("#ebook-reader-title");
const ebookReaderBody = document.querySelector("#ebook-reader-body");
const ebookReaderClose = document.querySelector("#ebook-reader-close");
const currentBook = document.querySelector("#current-book");
const readingPlanForm = document.querySelector("#reading-plan-form");
const readingPlanStatus = document.querySelector("#reading-plan-status");
const activityList = document.querySelector("#activity-list");

function loadJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value || fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  queueCloudSync();
}

function getCloudHeaders() {
  return {
    apikey: SUPABASE_CONFIG.anonKey,
    Authorization: `Bearer ${SUPABASE_CONFIG.anonKey}`,
    "Content-Type": "application/json"
  };
}

function getCurrentState() {
  return {
    articles,
    users,
    ebooks,
    readingPlan,
    activities
  };
}

async function pullCloudState() {
  if (!cloudEnabled) return null;
  const url = `${SUPABASE_CONFIG.url}/rest/v1/${SUPABASE_STATE_TABLE}?id=eq.${SUPABASE_STATE_ID}&select=state,updated_at`;
  const response = await fetch(url, { headers: getCloudHeaders() });
  if (!response.ok) {
    throw new Error(`cloud pull failed: ${response.status}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows[0].state || null;
}

async function pushCloudState(force = false) {
  if (!cloudEnabled) return;
  if (cloudSyncing && !force) return;
  cloudSyncing = true;
  try {
    const payload = {
      id: SUPABASE_STATE_ID,
      state: getCurrentState(),
      updated_at: new Date().toISOString()
    };
    const url = `${SUPABASE_CONFIG.url}/rest/v1/${SUPABASE_STATE_TABLE}?on_conflict=id`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...getCloudHeaders(),
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify([payload])
    });
    if (!response.ok) {
      throw new Error(`cloud push failed: ${response.status}`);
    }
  } catch (error) {
    console.warn("Supabase cloud sync error:", error);
  } finally {
    cloudSyncing = false;
  }
}

function queueCloudSync() {
  if (!cloudEnabled) return;
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(() => {
    pushCloudState().catch(error => console.warn(error));
  }, 500);
}

function applyCloudState(state) {
  if (!state || typeof state !== "object") return;
  if (Array.isArray(state.articles)) {
    articles = state.articles;
    localStorage.setItem(ARTICLE_KEY, JSON.stringify(articles));
  }
  if (Array.isArray(state.users)) {
    users = state.users;
    localStorage.setItem(USER_KEY, JSON.stringify(users));
  }
  if (Array.isArray(state.ebooks)) {
    ebooks = state.ebooks;
    localStorage.setItem(EBOOK_KEY, JSON.stringify(ebooks));
  }
  if (state.readingPlan && typeof state.readingPlan === "object") {
    readingPlan = state.readingPlan;
    localStorage.setItem(READING_PLAN_KEY, JSON.stringify(readingPlan));
  }
  if (Array.isArray(state.activities)) {
    activities = state.activities;
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activities));
  }
}

function createId(prefix) {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

let articles = loadJson(ARTICLE_KEY, starterArticles);
let users = loadJson(USER_KEY, []);
let ebooks = loadJson(EBOOK_KEY, starterEbooks);
ebooks = ebooks.map(ebook => ({
  ...ebook,
  leader: ebook.leader || "XXX",
  leaderIntro: ebook.leaderIntro || "领读者介绍会在管理员上传电子书时填写，并显示在这里。"
}));
saveJson(EBOOK_KEY, ebooks);
let readingPlan = loadJson(READING_PLAN_KEY, defaultReadingPlan);
if (readingPlan.label === "5 月共读") {
  readingPlan = { ...readingPlan, label: "6 月共读" };
  saveJson(READING_PLAN_KEY, readingPlan);
}
let activities = loadJson(ACTIVITY_KEY, starterActivities);
let adminAuthed = false;
let openEbookId = "";
let currentReaderBlobUrl = "";
let cloudConnected = false;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function saveActivities() {
  saveJson(ACTIVITY_KEY, activities.slice(0, 12));
}

function addActivity(title, detail) {
  activities.unshift({
    id: createId("activity"),
    title,
    detail,
    createdAt: new Date().toISOString()
  });
  activities = activities.slice(0, 12);
  saveActivities();
  renderActivities();
}

function renderActivities() {
  const visibleActivities = activities.slice(0, 6);
  const duration = Math.max(visibleActivities.length * 4, 12);
  activityList.style.setProperty("--activity-duration", `${duration}s`);
  activityList.innerHTML = visibleActivities
    .map((activity, index) => `
      <article class="activity-item" style="animation-delay: ${index * 4}s">
        <strong>${escapeHtml(activity.title)}</strong>
        <span>${escapeHtml(activity.detail)} · ${formatDate(activity.createdAt)}</span>
      </article>
    `)
    .join("");
}

function renderComments(target, comments) {
  target.innerHTML = "";

  if (!comments.length) {
    const empty = document.createElement("p");
    empty.className = "comment-item";
    empty.textContent = "还没有评论，欢迎写下第一条回应。";
    target.append(empty);
    return;
  }

  comments.forEach(comment => {
    const item = document.createElement("p");
    item.className = "comment-item";
    item.innerHTML = "<strong></strong>：<span></span>";
    item.querySelector("strong").textContent = comment.author;
    item.querySelector("span").textContent = comment.body;
    target.append(item);
  });
}

function renderArticles() {
  articleList.innerHTML = "";

  articles.forEach(article => {
    const node = articleTemplate.content.cloneNode(true);
    const card = node.querySelector(".article-card");
    const comments = node.querySelector(".comment-list");
    const form = node.querySelector(".comment-form");

    node.querySelector(".article-author").textContent = article.author;
    node.querySelector(".article-date").textContent = formatDate(article.createdAt);
    node.querySelector(".article-date").dateTime = article.createdAt;
    node.querySelector(".article-title").textContent = article.title;
    node.querySelector(".article-body").textContent = article.body;
    renderComments(comments, article.comments);

    form.addEventListener("submit", event => {
      event.preventDefault();
      const data = new FormData(form);
      const author = String(data.get("author")).trim();
      const body = String(data.get("body")).trim();
      if (!author || !body) return;

      article.comments.push({ author, body });
      saveJson(ARTICLE_KEY, articles);
      addActivity(`${author} 给 ${article.author} 的书摘写了点评`, `评论互动 · “${article.title}”`);
      renderArticles();
      renderReadingDetail();
    });

    card.dataset.articleId = article.id;
    articleList.append(node);
  });
}

function getCurrentUser() {
  return users[0] || { id: "guest", name: "访客" };
}

function formatCoverText(value) {
  return escapeHtml(value).split("").join("<br />");
}

function renderCover() {
  const currentEbook = ebooks[0];
  const coverUrl = currentEbook?.coverUrl || readingPlan.coverUrl;
  const coverTitle = currentEbook?.title || readingPlan.title;
  if (coverUrl) {
    return `<div class="cover image-cover"><img src="${coverUrl}" alt="${escapeHtml(coverTitle)}封面" /></div>`;
  }

  return `<div class="cover">${formatCoverText(readingPlan.coverText)}</div>`;
}

function renderReadingPlan() {
  currentBook.innerHTML = `
    ${renderCover()}
    <div>
      <span class="tag">${escapeHtml(readingPlan.label)}</span>
      <h3>${escapeHtml(readingPlan.title)}</h3>
      <p>${escapeHtml(readingPlan.description)}</p>
      <div class="chapter-grid">
        ${readingPlan.weeks.map((week, index) => `<button type="button" data-open-week="${index}">${escapeHtml(week)}</button>`).join("")}
      </div>
    </div>
  `;
}

function syncReadingPlanForm() {
  readingPlanForm.elements.label.value = readingPlan.label;
  readingPlanForm.elements.title.value = readingPlan.title;
  readingPlanForm.elements.coverText.value = readingPlan.coverText;
  readingPlanForm.elements.description.value = readingPlan.description;
  readingPlan.weeks.forEach((week, index) => {
    readingPlanForm.elements[`week${index + 1}`].value = week;
  });
}

function renderEbooks() {
  ebookAccessStatus.textContent = cloudConnected ? "已连接云端同步" : "本地模式可阅读";
  const currentEbook = ebooks[0];

  if (!ebooks.length) {
    monthlyEbookList.innerHTML = `
      <article class="ebook-item">
        <strong>暂无电子书</strong>
        <p>管理员上传后会显示在这里。</p>
      </article>
    `;
    return;
  }

  const displayTitle = currentEbook.title || readingPlan.title;
  const extension = getFileExtension(currentEbook.fileName);
  const fileTypeLabel = currentEbook.type || extension || "unknown";

  monthlyEbookList.innerHTML = `
      <article class="ebook-item">
        <div>
          <strong>${escapeHtml(displayTitle)}</strong>
          <p class="ebook-leader">领读者：${escapeHtml(currentEbook.leader || "XXX")}</p>
          <p>${escapeHtml(currentEbook.leaderIntro || "领读者介绍会在管理员上传电子书时显示。")}</p>
          <span>${escapeHtml(currentEbook.fileName)} · ${formatDate(currentEbook.createdAt)} · 类型：${escapeHtml(fileTypeLabel)}</span>
        </div>
        <button class="button secondary" type="button" data-open-ebook="${escapeHtml(currentEbook.id)}">${openEbookId === currentEbook.id && !ebookReader.hidden ? "收起阅读" : "打开阅读"}</button>
      </article>
    `;
}

function getFileExtension(fileName) {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

function dataUrlToText(dataUrl) {
  const [meta, payload = ""] = dataUrl.split(",");
  if (meta.includes(";base64")) {
    const binary = atob(payload);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  }
  return decodeURIComponent(payload);
}

function dataUrlToBlobUrl(dataUrl) {
  const [meta, payload = ""] = dataUrl.split(",");
  const mimeMatch = meta.match(/^data:([^;]+);/);
  const mimeType = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  let bytes;

  if (meta.includes(";base64")) {
    const binary = atob(payload);
    bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  } else {
    const decoded = decodeURIComponent(payload);
    bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
  }

  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

function openEbookReader(ebookId) {
  const ebook = ebooks.find(item => item.id === ebookId);
  if (!ebook) return;
  if (openEbookId === ebookId && !ebookReader.hidden) {
    ebookReader.hidden = true;
    ebookReaderBody.innerHTML = "";
    openEbookId = "";
    renderEbooks();
    return;
  }

  const displayTitle = readingPlan.title || ebook.title;
  const extension = getFileExtension(ebook.fileName);
  ebookReaderTitle.textContent = displayTitle;
  if (currentReaderBlobUrl) {
    URL.revokeObjectURL(currentReaderBlobUrl);
    currentReaderBlobUrl = "";
  }

  if (ebook.type.startsWith("text/") || ["txt", "md"].includes(extension)) {
    ebookReaderBody.innerHTML = `<pre class="ebook-text"></pre>`;
    ebookReaderBody.querySelector("pre").textContent = dataUrlToText(ebook.dataUrl);
  } else if (ebook.type === "application/pdf" || extension === "pdf") {
    currentReaderBlobUrl = dataUrlToBlobUrl(ebook.dataUrl);
    ebookReaderBody.innerHTML = `
      <p class="reader-tip">如果下方 PDF 区域空白，请点击“新窗口打开 PDF”。</p>
      <iframe class="ebook-frame" title="${escapeHtml(displayTitle)}"></iframe>
      <a class="button secondary reader-open-link" href="${ebook.dataUrl}" target="_blank" rel="noopener noreferrer">新窗口打开 PDF</a>
    `;
    ebookReaderBody.querySelector("iframe")?.setAttribute("src", currentReaderBlobUrl);
  } else if (ebook.type === "text/html" || ["html", "htm"].includes(extension)) {
    ebookReaderBody.innerHTML = `<iframe class="ebook-frame" title="${escapeHtml(displayTitle)}"></iframe>`;
    ebookReaderBody.querySelector("iframe").src = ebook.dataUrl;
  } else if (ebook.type.startsWith("image/")) {
    ebookReaderBody.innerHTML = `<img class="ebook-image" src="${ebook.dataUrl}" alt="${escapeHtml(displayTitle)}" />`;
  } else {
    ebookReaderBody.innerHTML = `
      <div class="reader-fallback">
        <strong>此格式无法在浏览器内直接预览</strong>
        <p>已加载管理员上传的电子书文件：${escapeHtml(ebook.fileName)}。可以点击下方按钮打开或下载。</p>
        <a class="button secondary" href="${ebook.dataUrl}" target="_blank" rel="noopener noreferrer">打开文件</a>
      </div>
    `;
  }

  ebookReader.hidden = false;
  openEbookId = ebookId;
  renderEbooks();
  ebookReader.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderReadingDetail() {
  const user = getCurrentUser();

  renderEbooks();

  const myArticles = articles.filter(article => article.author === user.name);
  const myComments = articles.flatMap(article =>
    article.comments
      .filter(comment => comment.author === user.name)
      .map(comment => `在《${article.title}》下评论：${comment.body}`)
  );
  const notes = myArticles.length ? myArticles.map(article => article.title) : readingProfile.notes;
  const comments = myComments.length ? myComments : readingProfile.comments;
  const completedBooks = readingProfile.completedBookCount;
  const excerptCount = Math.max(myArticles.length, readingProfile.excerptCount);
  const weeklyBadges = Math.floor(readingProfile.days / 7);
  const excerptBadges = Math.floor(excerptCount / 10);
  const earnedBadges = [
    ...Array.from({ length: weeklyBadges }).map((_, index) => ({
      type: "week",
      icon: index + 1,
      title: `坚持一周勋章 ${index + 1}`,
      desc: `连续阅读第 ${index + 1} 周`
    })),
    ...Array.from({ length: completedBooks }).map((_, index) => ({
      type: "book",
      icon: index + 1,
      title: `完读勋章 ${index + 1}`,
      desc: `已读完第 ${index + 1} 本书`
    })),
    ...Array.from({ length: excerptBadges }).map((_, index) => ({
      type: "excerpt",
      icon: index + 1,
      title: `书摘勋章 ${index + 1}`,
      desc: `已发表 ${10 * (index + 1)} 个书摘`
    }))
  ];
  const displayBadges = earnedBadges.length ? earnedBadges : [{
    type: "week",
    icon: "1",
    title: "坚持一周勋章待解锁",
    desc: "坚持阅读 1 周后点亮",
    locked: true
  }];

  readingDetail.className = "panel reading-detail";
  readingDetail.innerHTML = `
    <div class="profile-head">
      <div class="avatar">${escapeHtml(user.name.slice(0, 1))}</div>
      <div>
        <h3>${escapeHtml(user.name)} 的读书详情</h3>
        <p>${escapeHtml(readingPlan.title)}</p>
      </div>
      <div class="earned-board" aria-label="所有已得勋章榜">
        <strong>已得勋章榜</strong>
        <div>
          ${earnedBadges.map(badge => `<span class="mini-medal mini-${badge.type}" title="${escapeHtml(badge.title)}">${escapeHtml(badge.icon)}</span>`).join("") || "<em>待解锁</em>"}
        </div>
      </div>
    </div>
    <div class="progress-card">
      <strong>本月阅读进度 ${readingProfile.progress}%</strong>
      <div class="progress-track" style="--progress: ${readingProfile.progress}%"><span></span></div>
      <span>已连续阅读 ${readingProfile.days} 天，继续完成本月共读可升级为“深读者勋章”。</span>
    </div>
    <div class="medal-section">
      <div class="medal-head">
        <h3>我的勋章</h3>
        <span>坚持 1 周获得红色勋章，读完 1 本书获得黄色勋章，发表 10 个书摘获得蓝色勋章</span>
      </div>
      <div class="medal-list">
        ${displayBadges.map(badge => `
          <article class="medal-card ${badge.locked ? "locked" : ""}">
            <span class="medal medal-${badge.type}"><i>${escapeHtml(badge.icon)}</i></span>
            <strong>${escapeHtml(badge.title)}</strong>
            <small>${escapeHtml(badge.desc)}</small>
          </article>
        `).join("")}
      </div>
    </div>
    <div class="detail-grid">
      <article><strong>${excerptCount}</strong><span>我的书摘</span></article>
      <article><strong>${myComments.length}</strong><span>我的评论</span></article>
      <article><strong>${earnedBadges.length}</strong><span>已获得勋章</span></article>
    </div>
    <div>
      <h3>我的已读</h3>
      <ul class="mini-list">${readingProfile.finishedBooks.map(book => `<li>${escapeHtml(book)}</li>`).join("")}</ul>
    </div>
    <div>
      <h3>我的书摘</h3>
      <ul class="mini-list">${notes.map(note => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
    </div>
    <div>
      <h3>我的评论</h3>
      <ul class="mini-list">${comments.map(comment => `<li>${escapeHtml(comment)}</li>`).join("")}</ul>
    </div>
  `;
}

function renderAdminUsers() {
  if (!adminAuthed) {
    adminUserTable.hidden = true;
    adminUserList.innerHTML = "";
    ebookUploadForm.hidden = true;
    readingPlanForm.hidden = true;
    return;
  }

  adminUserTable.hidden = false;
  ebookUploadForm.hidden = false;
  readingPlanForm.hidden = false;
  syncReadingPlanForm();

  if (!users.length) {
    adminUserList.innerHTML = `<tr><td colspan="3">暂无注册用户</td></tr>`;
    return;
  }

  adminUserList.innerHTML = users
    .map(user => `
      <tr>
        <td>${escapeHtml(user.name)}</td>
        <td>${escapeHtml(user.phone)}</td>
        <td>${formatDate(user.createdAt)}</td>
      </tr>
    `)
    .join("");
}

articleForm.addEventListener("submit", event => {
  event.preventDefault();
  const data = new FormData(articleForm);
  const author = String(data.get("author")).trim();
  const title = String(data.get("title")).trim();
  const body = String(data.get("body")).trim();
  if (!author || !title || !body) return;

  articles.unshift({
    id: createId("article"),
    author,
    title,
    body,
    createdAt: new Date().toISOString(),
    comments: []
  });

  saveJson(ARTICLE_KEY, articles);
  addActivity(`${author} 新增 1 篇读者书摘`, `书摘发布 · “${title}”`);
  articleForm.reset();
  renderArticles();
  renderReadingDetail();
});

adminLoginForm.addEventListener("submit", event => {
  event.preventDefault();
  const data = new FormData(adminLoginForm);
  const passcode = String(data.get("passcode")).trim();

  if (passcode !== ADMIN_PASSCODE) {
    adminAuthed = false;
    adminStatus.textContent = "管理员口令不正确，用户信息仍保持隐藏。";
    renderAdminUsers();
    return;
  }

  adminAuthed = true;
  adminStatus.textContent = "管理员已验证，可查看注册用户名称及手机号码。";
  adminLoginForm.reset();
  renderAdminUsers();
});

readingPlanForm.addEventListener("submit", event => {
  event.preventDefault();
  const data = new FormData(readingPlanForm);
  readingPlan = {
    label: String(data.get("label")).trim(),
    title: String(data.get("title")).trim(),
    coverText: String(data.get("coverText")).trim(),
    coverUrl: readingPlan.coverUrl || "",
    description: String(data.get("description")).trim(),
    weeks: [1, 2, 3, 4].map(index => String(data.get(`week${index}`)).trim())
  };
  saveJson(READING_PLAN_KEY, readingPlan);
  renderReadingPlan();
  renderReadingDetail();
  renderEbooks();
  syncReadingPlanForm();
  readingPlanStatus.textContent = "每周读书计划已保存，并已更新到当月在读。";
});

ebookUploadForm.addEventListener("submit", event => {
  event.preventDefault();
  const data = new FormData(ebookUploadForm);
  const title = String(data.get("title")).trim();
  const leader = String(data.get("leader")).trim();
  const leaderIntro = String(data.get("leaderIntro")).trim();
  const summary = String(data.get("summary")).trim();
  const file = data.get("ebook");
  const cover = data.get("cover");
  if (!title || !leader || !leaderIntro || !(file instanceof File) || !file.name) return;

  const readFileAsDataUrl = targetFile => new Promise(resolve => {
    if (!(targetFile instanceof File) || !targetFile.name) {
      resolve("");
      return;
    }

    const fileReader = new FileReader();
    fileReader.addEventListener("load", () => resolve(String(fileReader.result)));
    fileReader.readAsDataURL(targetFile);
  });

  Promise.all([readFileAsDataUrl(file), readFileAsDataUrl(cover)]).then(([ebookDataUrl, coverDataUrl]) => {
    const uploadedEbook = {
      id: createId("ebook"),
      title,
      leader,
      leaderIntro,
      fileName: file.name,
      type: file.type || "application/octet-stream",
      summary,
      dataUrl: ebookDataUrl,
      coverUrl: coverDataUrl,
      createdAt: new Date().toISOString()
    };
    ebooks.unshift(uploadedEbook);
    ebooks = ebooks.map((ebook, index) => index === 0 ? uploadedEbook : ebook);
    readingPlan = {
      ...readingPlan,
      title,
      coverText: title.replace(/[《》]/g, "").slice(0, 4) || readingPlan.coverText,
      coverUrl: coverDataUrl || readingPlan.coverUrl || "",
      description: summary || readingPlan.description
    };
    saveJson(EBOOK_KEY, ebooks);
    saveJson(READING_PLAN_KEY, readingPlan);
    ebookUploadForm.reset();
    ebookUploadStatus.textContent = `已上传：${file.name}。登录用户现在可以在“当月在读”查看。`;
    renderReadingPlan();
    renderReadingDetail();
    renderEbooks();
    syncReadingPlanForm();
  });
});

monthlyEbookList.addEventListener("click", event => {
  const button = event.target.closest("[data-open-ebook]");
  if (!button) return;
  openEbookReader(button.dataset.openEbook);
});

ebookReaderClose.addEventListener("click", () => {
  ebookReader.hidden = true;
  ebookReaderBody.innerHTML = "";
  if (currentReaderBlobUrl) {
    URL.revokeObjectURL(currentReaderBlobUrl);
    currentReaderBlobUrl = "";
  }
  openEbookId = "";
  renderEbooks();
});

currentBook.addEventListener("click", event => {
  const button = event.target.closest("[data-open-week]");
  if (!button) return;

  const user = getCurrentUser();
  const currentEbook = ebooks[0];
  if (user && currentEbook) {
    openEbookReader(currentEbook.id);
    return;
  }

  document.querySelector("#monthly").scrollIntoView({ behavior: "smooth", block: "start" });
});

async function bootstrap() {
  if (cloudEnabled) {
    try {
      const cloudState = await pullCloudState();
      if (cloudState) {
        applyCloudState(cloudState);
      } else {
        await pushCloudState(true);
      }
      cloudConnected = true;
    } catch (error) {
      console.warn("Supabase bootstrap failed, fallback to localStorage:", error);
      cloudConnected = false;
    }
  }

  renderArticles();
  renderReadingPlan();
  renderActivities();
  renderReadingDetail();
  renderAdminUsers();
  renderEbooks();
}

bootstrap();
