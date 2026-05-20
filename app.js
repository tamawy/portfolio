/**
 * Blog application — Supabase-powered static frontend
 * Works on GitHub Pages (no backend server required)
 */

// ─── Supabase configuration (update with your project credentials) ───
const SUPABASE_URL = "https://aopplmspwyvvynzdsqlf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mn3UwizECH9q_CRwJ1gCqQ_GlQFHbM0";

let supabaseClient = null;

const TAG = "div";

/** Initialize and return the Supabase client (singleton). */
function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  if (typeof supabase === "undefined") {
    throw new Error("Supabase library not loaded. Include the CDN script before app.js.");
  }

  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabaseClient;
}

/** Fetch all blogs ordered by newest first. */
async function fetchAllBlogs() {
  const client = getSupabaseClient();
  return client
    .from("blogs")
    .select("id, title, slug, excerpt, tags, created_at, cover_image")
    .order("created_at", { ascending: false });
}

/** Fetch a single blog post by slug. */
async function fetchBlogBySlug(slug) {
  const client = getSupabaseClient();
  return client.from("blogs").select("*").eq("slug", slug).maybeSingle();
}

/** Format ISO date for display. */
function formatPublishDate(isoDate) {
  if (!isoDate) return "";
  return new Date(isoDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Normalize tags from DB (text[] or comma-separated string). */
function normalizeTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.filter(Boolean);
  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

/** Escape HTML to prevent XSS when inserting user content. */
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** True when content looks like HTML (legacy posts) rather than Markdown. */
function isProbablyHtml(str) {
  const trimmed = (str || "").trim();
  if (!trimmed) return false;
  return /^<[a-z][\s\S]*>/i.test(trimmed);
}

let markedParserReady = false;
let dompurifyHookReady = false;

/** Configure marked.js once (GFM + Mermaid code blocks). */
function configureMarkedParser() {
  if (markedParserReady || typeof marked === "undefined") return;

  marked.use({
    gfm: true,
    breaks: true,
    renderer: {
      code({ text, lang }) {
        if (lang === "mermaid") {
          return `<pre class="mermaid bidi-isolate" dir="ltr">${text}</pre>`;
        }
        return false;
      },
    },
  });

  markedParserReady = true;
}

let mermaidInitialized = false;

/** Initialize Mermaid once (respects dark mode). */
function initMermaid() {
  if (mermaidInitialized || typeof mermaid === "undefined") return;

  const isDark = document.body.classList.contains("dark-mode");
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? "dark" : "default",
    securityLevel: "strict",
    fontFamily: 'Inter, "IBM Plex Sans Arabic", "Noto Sans Arabic", sans-serif',
  });
  mermaidInitialized = true;
}

/** Normalize marked output and render Mermaid diagrams inside article content. */
async function renderMermaidDiagrams(container) {
  if (!container || typeof mermaid === "undefined") return;

  container.querySelectorAll("pre > code.language-mermaid").forEach((code) => {
    const parent = code.parentElement;
    if (!parent) return;
    const block = document.createElement("pre");
    block.className = "mermaid bidi-isolate";
    block.setAttribute("dir", "ltr");
    block.textContent = code.textContent;
    parent.replaceWith(block);
  });

  const nodes = container.querySelectorAll("pre.mermaid");
  if (!nodes.length) return;

  initMermaid();

  try {
    await mermaid.run({ nodes });
  } catch (err) {
    console.error("Mermaid render failed:", err);
    nodes.forEach((node) => {
      node.classList.add("mermaid--error");
      node.insertAdjacentHTML(
        "afterend",
        `<p class="mermaid-error-msg" role="alert">تعذّر عرض المخطط.</p>`
      );
    });
  }
}

/** Harden external links after DOMPurify sanitization. */
function setupDomPurifyHooks() {
  if (dompurifyHookReady || typeof DOMPurify === "undefined") return;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A" && node.getAttribute("href")) {
      const href = node.getAttribute("href");
      if (/^https?:\/\//i.test(href)) {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
    }
  });
  dompurifyHookReady = true;
}

/**
 * Sanitize HTML before inserting into the DOM.
 * @param {string} html
 */
function sanitizeBlogHtml(html) {
  if (typeof DOMPurify === "undefined") {
    console.warn("DOMPurify not loaded; blog HTML was not sanitized.");
    return html;
  }
  setupDomPurifyHooks();
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target", "rel", "id", "dir", "lang"],
    ADD_TAGS: ["bdi"],
  });
}

/* ─── Arabic / English mixed text (same-line RTL + LTR) ─── */
const ARABIC_CHAR_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

const LTR_TERM_RE =
  /(\.[A-Za-z][\w.]*)|([A-Za-z][\w.#+\-/]*(?:\s+(?:&|\+|\/)\s*|\s+)[A-Za-z][\w.#+\-/]*)|(\b[A-Z]{2,}\b)/g;

const BIDI_SKIP_SELECTOR = "code, pre, script, style, bdi, .bidi-ltr";

function containsArabic(text) {
  return ARABIC_CHAR_RE.test(text || "");
}

/** @param {object} post */
function resolveArticleLocale(post) {
  const explicit = String(post?.lang || post?.language || post?.locale || "")
    .toLowerCase()
    .trim();

  if (explicit === "ar" || explicit === "arabic" || explicit.startsWith("ar")) {
    return { lang: "ar", dir: "rtl" };
  }
  if (explicit === "en" || explicit === "english" || explicit.startsWith("en")) {
    return { lang: "en", dir: "ltr" };
  }

  const sample = `${post?.title || ""}\n${post?.excerpt || ""}\n${post?.content || ""}`;
  if (containsArabic(sample)) {
    return { lang: "ar", dir: "rtl" };
  }
  return { lang: "en", dir: "ltr" };
}

function shouldWrapLatinTerm(term) {
  if (!term) return false;
  if (term.startsWith(".")) return true;
  if (/^[A-Z]{2,}$/.test(term)) return true;
  return term.length >= 2;
}

/** Wrap English technical terms in <bdi> for correct order inside Arabic lines. */
function wrapLatinTermsInText(text) {
  LTR_TERM_RE.lastIndex = 0;
  let result = "";
  let lastIndex = 0;
  let match;

  while ((match = LTR_TERM_RE.exec(text)) !== null) {
    const term = match[0];
    result += escapeHtml(text.slice(lastIndex, match.index));
    if (shouldWrapLatinTerm(term)) {
      result += `<bdi dir="ltr" class="bidi-ltr" lang="en">${escapeHtml(term)}</bdi>`;
    } else {
      result += escapeHtml(term);
    }
    lastIndex = match.index + term.length;
  }

  result += escapeHtml(text.slice(lastIndex));
  return result;
}

/**
 * Safe HTML for plain text (title, excerpt, tags) with mixed AR/EN on one line.
 * @param {string} text
 * @param {{ lang: string, dir: string }} locale
 */
function formatMixedPlainText(text, locale) {
  if (!text) return "";
  if (locale?.dir === "rtl") {
    return wrapLatinTermsInText(text);
  }
  return escapeHtml(text);
}

function enhanceBidiHtml(html, dir) {
  if (!html || dir !== "rtl") return html;

  const box = document.createElement("div");
  box.innerHTML = html;

  box.querySelectorAll("code").forEach((el) => {
    if (!el.closest("pre")) {
      el.setAttribute("dir", "ltr");
      el.setAttribute("lang", "en");
      el.classList.add("bidi-isolate");
    }
  });

  box.querySelectorAll("pre").forEach((el) => {
    el.setAttribute("dir", "ltr");
    el.setAttribute("lang", "en");
    el.classList.add("bidi-isolate");
  });

  box.querySelectorAll('a[href^="http"]').forEach((el) => {
    el.setAttribute("dir", "ltr");
    el.classList.add("bidi-isolate");
  });

  const textNodes = [];
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  for (const textNode of textNodes) {
    const parent = textNode.parentElement;
    if (!parent || parent.closest(BIDI_SKIP_SELECTOR)) continue;

    const value = textNode.nodeValue;
    if (!value || !/[A-Za-z]/.test(value)) continue;

    LTR_TERM_RE.lastIndex = 0;
    if (!LTR_TERM_RE.test(value)) continue;

    const template = document.createElement("template");
    template.innerHTML = wrapLatinTermsInText(value);
    parent.replaceChild(template.content, textNode);
  }

  return box.innerHTML;
}

function applyArticleLocale(root, locale) {
  const { lang, dir } = locale;

  document.documentElement.lang = lang;
  document.documentElement.dir = dir;

  const article = root.querySelector(".blog-post-container");
  const wrap = root.querySelector(".blog-post-content-wrap");
  const content = root.querySelector("#blogContent");
  const backLink = root.querySelector(".blog-back-link");

  for (const el of [article, wrap, content]) {
    if (!el) continue;
    el.setAttribute("lang", lang);
    el.setAttribute("dir", dir);
  }

  if (article) {
    article.classList.toggle("blog-post-container--rtl", dir === "rtl");
  }
  if (backLink) {
    backLink.classList.toggle("blog-back-link--rtl", dir === "rtl");
  }
}

/**
 * Convert Markdown (or legacy HTML) from Supabase into safe HTML.
 * @param {string} raw
 * @param {{ lang: string, dir: string }} [locale]
 */
function renderBlogContent(raw, locale) {
  if (!raw) return "";

  configureMarkedParser();

  let html;
  if (isProbablyHtml(raw)) {
    html = raw;
  } else if (typeof marked !== "undefined") {
    html = marked.parse(raw);
  } else {
    return `<p>${escapeHtml(raw)}</p>`;
  }

  html = sanitizeBlogHtml(html);
  if (locale?.dir === "rtl") {
    html = enhanceBidiHtml(html, "rtl");
  }
  return html;
}

/** Plain text for reading-time estimate (works with Markdown or HTML). */
function getPlainTextFromContent(raw) {
  if (!raw) return "";
  if (isProbablyHtml(raw)) return raw.replace(/<[^>]+>/g, " ");
  configureMarkedParser();
  if (typeof marked !== "undefined") {
    return marked.parse(raw).replace(/<[^>]+>/g, " ");
  }
  return raw;
}

/** Build tag chips markup. */
function renderTagsHtml(tags, wrapperClass = "blog-card__tags", locale) {
  const list = normalizeTags(tags);
  if (!list.length) return "";

  const chips = list
    .map((tag) => {
      const label = locale ? formatMixedPlainText(tag, locale) : escapeHtml(tag);
      const dirAttr = locale?.dir === "rtl" ? ' dir="rtl"' : "";
      return `<span class="blog-tag"${dirAttr}>${label}</span>`;
    })
    .join("");

  return `<${TAG} class="${wrapperClass}" aria-label="Tags" dir="${locale?.dir || "ltr"}">${chips}</${TAG}>`;
}

/** Default cover when none is set in the database. */
const DEFAULT_COVER_IMAGE =
  "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=800&q=80";

/** Create a blog card element. */
function createBlogCard(blog) {
  const article = document.createElement("article");
  article.className = "blog-card";
  article.setAttribute("itemscope", "");
  article.setAttribute("itemtype", "https://schema.org/BlogPosting");

  const locale = resolveArticleLocale(blog);
  const cover = blog.cover_image || DEFAULT_COVER_IMAGE;
  const slug = escapeHtml(blog.slug);
  const title = formatMixedPlainText(blog.title, locale);
  const excerpt = formatMixedPlainText(blog.excerpt || "", locale);
  const date = formatPublishDate(blog.created_at);
  const tagsHtml = renderTagsHtml(blog.tags, "blog-card__tags", locale);

  article.setAttribute("lang", locale.lang);
  article.setAttribute("dir", locale.dir);
  article.classList.toggle("blog-card--rtl", locale.dir === "rtl");

  article.innerHTML = `
    <a href="blog.html?slug=${slug}" class="blog-card__cover-link" tabindex="-1" aria-hidden="true">
      <img class="blog-card__cover" src="${escapeHtml(cover)}" alt="" loading="lazy" width="400" height="220" />
    </a>
    <${TAG} class="blog-card__body" dir="${locale.dir}" lang="${locale.lang}">
      <${TAG} class="blog-meta">
        <time class="blog-date" datetime="${escapeHtml(blog.created_at || "")}" itemprop="datePublished">${escapeHtml(date)}</time>
      </${TAG}>
      <h2 class="blog-title blog-mixed-text" itemprop="headline" dir="${locale.dir}">
        <a href="blog.html?slug=${slug}" class="blog-card__title-link">${title}</a>
      </h2>
      <p class="blog-desc blog-mixed-text" itemprop="description" dir="${locale.dir}">${excerpt}</p>
      ${tagsHtml}
      <a href="blog.html?slug=${slug}" class="blog-link blog-card__read-more">
        Read More <i class="fas fa-arrow-right" aria-hidden="true"></i>
      </a>
    </${TAG}>
  `;

  return article;
}

/** Show loading skeleton in a grid container. */
function showBlogLoading(container) {
  container.innerHTML = "";
  container.setAttribute("aria-busy", "true");
  container.classList.add("blogs-grid--loading");

  for (let i = 0; i < 3; i++) {
    const skeleton = document.createElement(TAG);
    skeleton.className = "blog-card blog-card--skeleton";
    skeleton.innerHTML = `
      <${TAG} class="blog-card__skeleton-cover"></${TAG}>
      <${TAG} class="blog-card__body">
        <${TAG} class="blog-card__skeleton-line blog-card__skeleton-line--short"></${TAG}>
        <${TAG} class="blog-card__skeleton-line blog-card__skeleton-line--title"></${TAG}>
        <${TAG} class="blog-card__skeleton-line"></${TAG}>
        <${TAG} class="blog-card__skeleton-line"></${TAG}>
        <${TAG} class="blog-card__skeleton-line blog-card__skeleton-line--btn"></${TAG}>
      </${TAG}>
    `;
    container.appendChild(skeleton);
  }
}

/** Show error state UI. */
function showBlogError(container, message, onRetry) {
  container.removeAttribute("aria-busy");
  container.classList.remove("blogs-grid--loading");
  container.innerHTML = `
    <${TAG} class="blog-state blog-state--error" role="alert">
      <i class="fas fa-exclamation-circle blog-state__icon" aria-hidden="true"></i>
      <h3 class="blog-state__title">Unable to load blogs</h3>
      <p class="blog-state__message">${escapeHtml(message || "Something went wrong. Please try again later.")}</p>
      ${onRetry ? '<button type="button" class="btn btn-primary blog-state__btn" id="blogRetryBtn">Try Again</button>' : ""}
    </${TAG}>
  `;

  if (onRetry) {
    const btn = container.querySelector("#blogRetryBtn");
    if (btn) btn.addEventListener("click", onRetry);
  }
}

/** Show empty state when no posts exist. */
function showBlogEmpty(container) {
  container.removeAttribute("aria-busy");
  container.classList.remove("blogs-grid--loading");
  container.innerHTML = `
    <${TAG} class="blog-state blog-state--empty">
      <i class="fas fa-newspaper blog-state__icon" aria-hidden="true"></i>
      <h3 class="blog-state__title">No blog posts yet</h3>
      <p class="blog-state__message">Check back soon for new articles and tutorials.</p>
      <a href="index.html" class="btn btn-secondary blog-state__btn">Back to Home</a>
    </${TAG}>
  `;
}

/** Render blog cards into a grid container. */
function renderBlogList(blogs, container, limit) {
  container.removeAttribute("aria-busy");
  container.classList.remove("blogs-grid--loading");
  container.innerHTML = "";

  const posts = limit ? blogs.slice(0, limit) : blogs;
  posts.forEach((blog) => container.appendChild(createBlogCard(blog)));
}

/** Initialize blog listing page or homepage preview section. */
async function initBlogListPage(options = {}) {
  const container = document.querySelector(options.containerSelector || "#blogsGrid");
  if (!container) return;

  const limit = options.limit ?? null;
  showBlogLoading(container);

  try {
    const { data, error } = await fetchAllBlogs();

    if (error) {
      showBlogError(container, error.message, () => initBlogListPage(options));
      return;
    }

    if (!data || data.length === 0) {
      showBlogEmpty(container);
      return;
    }

    renderBlogList(data, container, limit);
  } catch (err) {
    showBlogError(
      container,
      err.message || "Failed to connect to the blog service.",
      () => initBlogListPage(options)
    );
  }
}

/** Get slug from URL query string. */
function getSlugFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("slug")?.trim() || "";
}

/** Estimate reading time from Markdown or HTML content. */
function estimateReadingTime(content, locale) {
  const text = getPlainTextFromContent(content);
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
  if (locale?.lang === "ar") {
    return minutes === 1 ? "دقيقة واحدة للقراءة" : `${minutes} دقائق للقراءة`;
  }
  return `${minutes} min read`;
}

/** Render single blog post on blog.html. */
async function initBlogDetailPage() {
  const root = document.getElementById("blogPostRoot");
  if (!root) return;

  const slug = getSlugFromUrl();

  if (!slug) {
    root.innerHTML = `
      <${TAG} class="blog-state blog-state--error" role="alert">
        <i class="fas fa-link-slash blog-state__icon" aria-hidden="true"></i>
        <h3 class="blog-state__title">Post not found</h3>
        <p class="blog-state__message">No article slug was provided in the URL.</p>
        <a href="blogs.html" class="btn btn-primary blog-state__btn">View All Blogs</a>
      </${TAG}>
    `;
    return;
  }

  root.setAttribute("aria-busy", "true");
  root.innerHTML = `<${TAG} class="blog-detail-loading"><${TAG} class="blog-detail-loading__spinner" aria-hidden="true"></${TAG}><p>Loading article…</p></${TAG}>`;

  try {
    const { data, error } = await fetchBlogBySlug(slug);

    if (error) {
      root.removeAttribute("aria-busy");
      root.innerHTML = `
        <${TAG} class="blog-state blog-state--error" role="alert">
          <h3 class="blog-state__title">Unable to load article</h3>
          <p class="blog-state__message">${escapeHtml(error.message)}</p>
          <button type="button" class="btn btn-primary blog-state__btn" id="blogDetailRetry">Try Again</button>
        </${TAG}>
      `;
      document.getElementById("blogDetailRetry")?.addEventListener("click", initBlogDetailPage);
      return;
    }

    if (!data) {
      root.removeAttribute("aria-busy");
      root.innerHTML = `
        <${TAG} class="blog-state blog-state--error">
          <h3 class="blog-state__title">Post not found</h3>
          <p class="blog-state__message">We couldn't find an article with slug "${escapeHtml(slug)}".</p>
          <a href="blogs.html" class="btn btn-primary blog-state__btn">View All Blogs</a>
        </${TAG}>
      `;
      return;
    }

    document.title = `${data.title} | Ibrahim Eltamawy Blog`;

    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", data.excerpt || data.title);

    const locale = resolveArticleLocale(data);
    const cover = data.cover_image || DEFAULT_COVER_IMAGE;
    root.removeAttribute("aria-busy");
    const titleHtml = formatMixedPlainText(data.title, locale);

    root.innerHTML = `
      <article class="blog-post-container blog-article-layout" itemscope itemtype="https://schema.org/BlogPosting">
        <img class="blog-featured-image" src="${escapeHtml(cover)}" alt="${escapeHtml(data.title)}" itemprop="image" />
        <${TAG} class="blog-post-content-wrap blog-post-content-wrap--article-only">
          <h1 class="visually-hidden blog-post-title" itemprop="headline" dir="${locale.dir}">${titleHtml}</h1>
          <meta itemprop="datePublished" content="${escapeHtml(data.created_at || "")}">
          <${TAG} id="blogContent" class="blog-post-content markdown-body" itemprop="articleBody" dir="${locale.dir}" lang="${locale.lang}"></${TAG}>
          <a href="blogs.html" class="blog-back-link"><i class="fas fa-arrow-left" aria-hidden="true"></i> Back to Blogs</a>
        </${TAG}>
      </article>
    `;

    const contentEl = root.querySelector("#blogContent");
    if (contentEl) {
      contentEl.innerHTML = renderBlogContent(data.content, locale);
      await renderMermaidDiagrams(contentEl);
    }

    applyArticleLocale(root, locale);

    await loadRelatedPosts(slug, data.id);
  } catch (err) {
    root.removeAttribute("aria-busy");
    root.innerHTML = `
      <${TAG} class="blog-state blog-state--error" role="alert">
        <h3 class="blog-state__title">Unable to load article</h3>
        <p class="blog-state__message">${escapeHtml(err.message)}</p>
        <button type="button" class="btn btn-primary blog-state__btn" id="blogDetailRetry">Try Again</button>
      </${TAG}>
    `;
    document.getElementById("blogDetailRetry")?.addEventListener("click", initBlogDetailPage);
  }
}

/** Load related posts section on detail page. */
async function loadRelatedPosts(currentSlug, currentId) {
  const relatedRoot = document.getElementById("relatedPosts");
  if (!relatedRoot) return;

  try {
    const { data } = await fetchAllBlogs();
    if (!data?.length) return;

    const related = data.filter((b) => b.slug !== currentSlug && b.id !== currentId).slice(0, 3);
    if (!related.length) {
      relatedRoot.hidden = true;
      return;
    }

    relatedRoot.hidden = false;
    relatedRoot.innerHTML = `
      <${TAG} class="related-posts">
        <h2 class="related-title">Related Posts</h2>
        <${TAG} class="related-list">
          ${related
            .map((post) => {
              const postLocale = resolveArticleLocale(post);
              const titleHtml = formatMixedPlainText(post.title, postLocale);
              return `
            <${TAG} class="related-item" dir="${postLocale.dir}">
              <img src="${escapeHtml(post.cover_image || DEFAULT_COVER_IMAGE)}" alt="" class="related-thumb" loading="lazy" width="48" height="48" />
              <a href="blog.html?slug=${escapeHtml(post.slug)}" class="related-link blog-mixed-text" dir="${postLocale.dir}" lang="${postLocale.lang}">${titleHtml}</a>
            </${TAG}>`;
            })
            .join("")}
        </${TAG}>
      </${TAG}>
    `;
  } catch {
    relatedRoot.hidden = true;
  }
}

/** Dark mode toggle (blog pages only; portfolio home uses script.js). */
function initDarkMode() {
  if (document.body.dataset.blogPage === "preview") return;

  const toggle = document.getElementById("darkModeToggleFloating");
  if (!toggle || toggle.dataset.blogDarkInit) return;
  toggle.dataset.blogDarkInit = "true";

  function setDarkMode(enabled) {
    if (enabled) {
      document.body.classList.add("dark-mode");
      toggle.textContent = "☀️";
      localStorage.setItem("darkMode", "enabled");
    } else {
      document.body.classList.remove("dark-mode");
      toggle.textContent = "🌙";
      localStorage.setItem("darkMode", "disabled");
    }
  }

  toggle.addEventListener("click", () => {
    setDarkMode(!document.body.classList.contains("dark-mode"));
  });

  const saved = localStorage.getItem("darkMode");
  if (saved === "enabled" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
    setDarkMode(true);
  } else if (saved === "disabled") {
    setDarkMode(false);
  }
}

/** Mobile nav toggle for blog pages. */
function initMobileNav() {
  const hamburger = document.querySelector(".hamburger");
  const navMenu = document.querySelector(".nav-menu");
  if (!hamburger || !navMenu || hamburger.dataset.blogNavInit) return;
  hamburger.dataset.blogNavInit = "true";

  hamburger.addEventListener("click", () => {
    hamburger.classList.toggle("active");
    navMenu.classList.toggle("active");
  });

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      hamburger.classList.remove("active");
      navMenu.classList.remove("active");
    });
  });
}

/** Boot the correct page mode from data attribute on body. */
function initBlogApp() {
  initDarkMode();
  initMobileNav();

  const page = document.body.dataset.blogPage;

  if (page === "list") {
    initBlogListPage({ containerSelector: "#blogsGrid" });
  } else if (page === "preview") {
    initBlogListPage({ containerSelector: "#blogsGrid", limit: 3 });
  } else if (page === "detail") {
    initBlogDetailPage();
  }
}

document.addEventListener("DOMContentLoaded", initBlogApp);
