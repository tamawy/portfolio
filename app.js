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

/** Build tag chips markup. */
function renderTagsHtml(tags, wrapperClass = "blog-card__tags") {
  const list = normalizeTags(tags);
  if (!list.length) return "";

  const chips = list
    .map((tag) => `<span class="blog-tag">${escapeHtml(tag)}</span>`)
    .join("");

  return `<${TAG} class="${wrapperClass}" aria-label="Tags">${chips}</${TAG}>`;
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

  const cover = blog.cover_image || DEFAULT_COVER_IMAGE;
  const slug = escapeHtml(blog.slug);
  const title = escapeHtml(blog.title);
  const excerpt = escapeHtml(blog.excerpt || "");
  const date = formatPublishDate(blog.created_at);
  const tagsHtml = renderTagsHtml(blog.tags);

  article.innerHTML = `
    <a href="blog.html?slug=${slug}" class="blog-card__cover-link" tabindex="-1" aria-hidden="true">
      <img class="blog-card__cover" src="${escapeHtml(cover)}" alt="" loading="lazy" width="400" height="220" />
    </a>
    <${TAG} class="blog-card__body">
      <${TAG} class="blog-meta">
        <time class="blog-date" datetime="${escapeHtml(blog.created_at || "")}" itemprop="datePublished">${escapeHtml(date)}</time>
      </${TAG}>
      <h2 class="blog-title" itemprop="headline">
        <a href="blog.html?slug=${slug}" class="blog-card__title-link">${title}</a>
      </h2>
      <p class="blog-desc" itemprop="description">${excerpt}</p>
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

/** Estimate reading time from HTML content. */
function estimateReadingTime(html) {
  const text = (html || "").replace(/<[^>]+>/g, " ");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
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

    const cover = data.cover_image || DEFAULT_COVER_IMAGE;
    const date = formatPublishDate(data.created_at);
    const readTime = estimateReadingTime(data.content);
    const tagsHtml = renderTagsHtml(data.tags, "blog-tags");

    root.removeAttribute("aria-busy");
    root.innerHTML = `
      <article class="blog-post-container" itemscope itemtype="https://schema.org/BlogPosting">
        <img class="blog-featured-image" src="${escapeHtml(cover)}" alt="${escapeHtml(data.title)}" itemprop="image" />
        <${TAG} class="blog-post-content-wrap">
          ${tagsHtml}
          <h1 class="blog-post-title" itemprop="headline">${escapeHtml(data.title)}</h1>
          <${TAG} class="blog-post-meta">
            <time datetime="${escapeHtml(data.created_at || "")}" itemprop="datePublished">${escapeHtml(date)}</time>
            <span aria-hidden="true"> &bull; </span>
            <span>${escapeHtml(readTime)}</span>
          </${TAG}>
          <${TAG} class="blog-author">
            <img src="imgs/my-profile-picture.jpg" alt="Ibrahim Eltamawy" class="blog-author-img" width="56" height="56" />
            <${TAG} class="blog-author-info">
              <span class="blog-author-name" itemprop="author">Ibrahim Eltamawy</span>
              <span class="blog-author-role">Back-End Developer &amp; Instructor</span>
              <${TAG} class="blog-author-socials">
                <a href="mailto:tamawy.ibrahim@gmail.com" title="Email"><i class="fas fa-envelope"></i></a>
                <a href="https://www.linkedin.com/in/ibrahim-tamawy/" target="_blank" rel="noopener noreferrer" title="LinkedIn"><i class="fab fa-linkedin"></i></a>
                <a href="https://github.com/tamawy" target="_blank" rel="noopener noreferrer" title="GitHub"><i class="fab fa-github"></i></a>
              </${TAG}>
            </${TAG}>
          </${TAG}>
          <${TAG} class="blog-post-content" itemprop="articleBody">${data.content || ""}</${TAG}>
          <a href="blogs.html" class="blog-back-link"><i class="fas fa-arrow-left" aria-hidden="true"></i> Back to Blogs</a>
        </${TAG}>
      </article>
    `;

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
            .map(
              (post) => `
            <${TAG} class="related-item">
              <img src="${escapeHtml(post.cover_image || DEFAULT_COVER_IMAGE)}" alt="" class="related-thumb" loading="lazy" width="48" height="48" />
              <a href="blog.html?slug=${escapeHtml(post.slug)}" class="related-link">${escapeHtml(post.title)}</a>
            </${TAG}>
          `
            )
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
