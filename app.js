const categories = ["Latest", "Local", "World", "Politics", "Business", "Culture", "Sport"];
const categoryLabels = {
  Latest: "ताज़ा",
  Local: "देश",
  World: "दुनिया",
  Politics: "राजनीति",
  Business: "कारोबार",
  Culture: "मनोरंजन",
  Sport: "खेल",
};
const allowedMediaTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"]);
const dateFormatter = new Intl.DateTimeFormat("hi-IN", { month: "long", day: "numeric", year: "numeric" });

function formatDate(value) {
  return dateFormatter.format(new Date(value));
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...options.headers } : options.headers,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Something went wrong. Please try again.");
  return result;
}

function addMedia(container, media, className) {
  if (!media?.url || !allowedMediaTypes.has(media.type)) {
    container.append(makeElement("div", "media-placeholder", "✳"));
    return;
  }
  const mediaElement = document.createElement(media.type.startsWith("video/") ? "video" : "img");
  mediaElement.className = className || "";
  mediaElement.src = media.url;
  if (mediaElement instanceof HTMLVideoElement) {
    mediaElement.controls = true;
    mediaElement.preload = "metadata";
    mediaElement.playsInline = true;
    mediaElement.setAttribute("aria-label", "Watch this news story");
  } else {
    mediaElement.alt = "Photo accompanying this news story";
    mediaElement.loading = "lazy";
  }
  container.append(mediaElement);
}

function renderLead(article) {
  const section = document.querySelector("#lead-story");
  section.replaceChildren();
  const layout = makeElement("article", "lead-article");
  const visual = makeElement("div", "lead-visual");
  addMedia(visual, article.media);
  const copy = makeElement("div", "lead-article-copy");
  const kicker = makeElement("span", "lead-kicker", categoryLabels[article.category] || "ताज़ा");
  const dot = makeElement("span", "live-dot");
  dot.setAttribute("aria-hidden", "true");
  kicker.prepend(dot);
  const title = makeElement("h2", "", article.title);
  const body = makeElement("p", "", article.body);
  const link = makeElement("a", "text-link", "Read the full story");
  link.href = "#story-" + article.id;
  const byline = makeElement("span", "lead-byline", `HARAPPA NEWSROOM  ·  ${formatDate(article.createdAt)}`);
  copy.append(kicker, title, body, link, byline);
  layout.append(visual, copy);
  section.append(layout);
}

function renderCard(article) {
  const card = makeElement("article", "story-card");
  card.id = "story-" + article.id;
  const visual = makeElement("div", "story-image");
  addMedia(visual, article.media);
  const category = makeElement("span", "story-category", categoryLabels[article.category] || article.category);
  const title = makeElement("h3", "story-title", article.title);
  const excerpt = makeElement("p", "story-excerpt", article.body);
  const metadata = makeElement("div", "story-meta");
  metadata.append(makeElement("time", "", formatDate(article.createdAt)));
  if (article.media?.type?.startsWith("video/")) metadata.append(makeElement("span", "story-video-label", "▶  वीडियो देखें"));
  card.append(visual, category, title, excerpt, metadata);
  return card;
}

let stories = [];
let selectedCategory = "All";

function renderStories() {
  const grid = document.querySelector("#stories-grid");
  grid.replaceChildren();
  const visibleStories = stories.filter((story) => selectedCategory === "All" || story.category === selectedCategory);
  if (visibleStories.length === 0) {
    grid.append(makeElement("p", "empty-stories", stories.length
      ? "इस श्रेणी में अभी खबरें नहीं हैं। दूसरी श्रेणी चुनें।"
      : "जल्द आ रही हैं नई खबरें।"));
    return;
  }
  visibleStories.forEach((story) => grid.append(renderCard(story)));
}

function renderAdminStories() {
  const container = document.querySelector("#published-stories");
  const count = document.querySelector("#published-count");
  container.replaceChildren();
  count.textContent = String(stories.length);
  if (!stories.length) {
    container.append(makeElement("p", "admin-empty", "No stories yet. Your published stories will appear here."));
    return;
  }
  stories.forEach((story) => {
    const item = makeElement("article", "published-item");
    const thumbnail = makeElement("div", "published-thumb");
    addMedia(thumbnail, story.media);
    const copy = makeElement("div", "published-copy");
    copy.append(makeElement("strong", "", story.title));
    copy.append(makeElement("span", "", `${story.category}  ·  ${formatDate(story.createdAt)}`));
    const remove = makeElement("button", "delete-button", "Remove story");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove story: ${story.title}`);
    remove.addEventListener("click", async () => {
      if (!window.confirm(`Remove "${story.title}" from the news site?`)) return;
      remove.disabled = true;
      try {
        await api(`/api/admin/news/${story.id}`, { method: "DELETE" });
        await loadStories();
        showToast("Story removed from the news site.");
      } catch (error) {
        showFormError(error.message);
        remove.disabled = false;
      }
    });
    item.append(thumbnail, copy, remove);
    container.append(item);
  });
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 3200);
}

function showFormError(message) {
  const error = document.querySelector("#admin-error");
  if (!error) return;
  error.textContent = message;
  error.hidden = false;
}

function hideFormError() {
  const error = document.querySelector("#admin-error");
  if (!error) return;
  error.textContent = "";
  error.hidden = true;
}

async function loadStories() {
  stories = await api("/api/news");
  const breakingHeadline = document.querySelector("#breaking-headline");
  if (breakingHeadline && stories.length) {
    breakingHeadline.textContent = stories[0].title;
    breakingHeadline.href = `#story-${stories[0].id}`;
  }
  const filter = document.querySelector("#category-filter");
  if (filter) renderStories();
  const adminStories = document.querySelector("#published-stories");
  if (adminStories) renderAdminStories();
  const lead = document.querySelector("#lead-story");
  if (lead && stories.length) renderLead(stories[0]);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error("Unable to read this file. Please choose it again.")));
    reader.readAsDataURL(file);
  });
}

function showLogin(username = "admin") {
  document.body.className = "admin-body";
  document.body.replaceChildren();
  const main = makeElement("main", "login-panel");
  const logo = makeElement("a", "login-logo");
  logo.href = "/";
  const mark = makeElement("span", "login-mark", "H");
  const eyebrow = makeElement("div", "eyebrow", "HARAPPA NEWSROOM");
  const title = makeElement("h1", "", "Welcome back.");
  const description = makeElement("p", "", "Sign in to share the stories your readers need to know about.");
  const form = makeElement("form");
  form.id = "login-form";
  const error = makeElement("p", "admin-form-error");
  error.id = "admin-error";
  error.hidden = true;
  form.append(
    makeField("Username", "username", { value: username, autocomplete: "username", required: true }),
    makeField("Password", "password", { type: "password", autocomplete: "current-password", required: true }),
    error,
  );
  const submit = makeElement("button", "primary-button", "Sign in to the newsroom");
  submit.type = "submit";
  form.append(submit);
  logo.append(mark);
  main.append(logo, eyebrow, title, description, form);
  document.body.append(main);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideFormError();
    submit.disabled = true;
    try {
      await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({
          username: new FormData(form).get("username"),
          password: new FormData(form).get("password"),
        }),
      });
      renderDashboard();
    } catch (error) {
      showFormError(error.message);
      submit.disabled = false;
    }
  });
}

function makeField(labelText, name, options = {}) {
  const wrapper = makeElement("div", "form-field");
  const input = document.createElement("input");
  input.id = name;
  input.name = name;
  input.autocomplete = options.autocomplete || "off";
  input.required = Boolean(options.required);
  if (options.type) input.type = options.type;
  if (options.value) input.value = options.value;
  if (options.placeholder) input.placeholder = options.placeholder;
  const label = makeElement("label", "", labelText);
  label.htmlFor = name;
  wrapper.append(label, input);
  return wrapper;
}

function makeDashboard() {
  document.body.className = "admin-body";
  document.body.replaceChildren();
  const header = makeElement("header", "admin-header");
  const logo = makeElement("a", "wordmark");
  logo.href = "/";
  logo.setAttribute("aria-label", "Harappa News home");
  const mark = makeElement("span", "wordmark-icon", "H");
  const wordmark = makeElement("span", "wordmark-copy", "HARAPPA");
  wordmark.append(makeElement("span", "wordmark-tagline", "NEWS · हर खबर पर नज़र"));
  logo.append(mark, wordmark);
  const headerRight = makeElement("div", "admin-header-right");
  headerRight.append(makeElement("span", "admin-context", "EDITOR WORKSPACE"));
  const previewLink = makeElement("a", "back-link", "View live site ↗");
  previewLink.href = "/";
  const signout = makeElement("button", "signout-button", "Sign out");
  signout.type = "button";
  signout.addEventListener("click", async () => {
    try {
      await api("/api/admin/logout", { method: "POST" });
      const session = await api("/api/admin/session");
      showLogin(session.username);
    } catch (error) {
      showFormError(error.message);
    }
  });
  headerRight.append(previewLink, signout);
  header.append(logo, headerRight);

  const main = makeElement("main", "admin-wrap");
  const heading = makeElement("div", "admin-heading");
  heading.append(
    makeElement("div", "eyebrow", "YOUR EDITORIAL DESK"),
    makeElement("h1", "", "Make a little news."),
    makeElement("p", "", "Put a new story out into the world. Add a photo or video to bring readers closer."),
  );

  const panel = makeElement("section", "admin-panel");
  panel.append(makeElement("h2", "", "Publish a story"));
  const notice = makeElement("div", "admin-notice", "This news site does not yet have a public web address. Stories published here are saved on this server. Set up a publicly accessible, always-on host before sharing the site with your readers.");
  notice.id = "deployment-notice";
  notice.hidden = !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const form = makeElement("form");
  form.id = "story-form";
  const fieldGrid = makeElement("div", "field-grid");
  const titleField = makeField("Headline", "title", { required: true, placeholder: "A clear, compelling headline", autocomplete: "off" });
  const categoryWrapper = makeElement("div", "form-field");
  const categoryLabel = makeElement("label", "", "Section");
  categoryLabel.htmlFor = "category";
  const categorySelect = document.createElement("select");
  categorySelect.id = "category";
  categorySelect.name = "category";
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categorySelect.append(option);
  });
  categoryWrapper.append(categoryLabel, categorySelect);
  fieldGrid.append(titleField, categoryWrapper);

  const bodyWrapper = makeElement("div", "form-field");
  const bodyLabel = makeElement("label", "", "The story");
  bodyLabel.htmlFor = "body";
  const body = document.createElement("textarea");
  body.id = "body";
  body.name = "body";
  body.placeholder = "Share the details, add context, and give your readers the full picture.";
  body.maxLength = 12000;
  body.required = true;
  const bodyHelp = makeElement("span", "field-help", "Up to 12,000 characters.");
  bodyWrapper.append(bodyLabel, body, bodyHelp);

  const uploadField = makeElement("div", "form-field");
  const uploadLabel = makeElement("label", "", "Add a photo or video");
  uploadLabel.htmlFor = "media";
  const input = document.createElement("input");
  input.className = "upload-input";
  input.type = "file";
  input.id = "media";
  input.name = "media";
  input.accept = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm";
  const drop = makeElement("label", "upload-drop");
  drop.htmlFor = "media";
  const uploadIcon = makeElement("span", "upload-icon", "＋");
  const uploadCopy = makeElement("span", "upload-drop-copy");
  const uploadPrompt = makeElement("strong", "", "Choose a photo or video");
  const uploadDetail = makeElement("span", "", "JPG, PNG, GIF, WebP · MP4 or WebM, up to 90 MB");
  uploadCopy.append(uploadPrompt, uploadDetail);
  drop.append(uploadIcon, uploadCopy);
  const preview = document.createElement("div");
  preview.id = "media-preview";
  input.addEventListener("change", () => {
    preview.replaceChildren();
    const file = input.files?.[0];
    if (!file) {
      uploadDetail.textContent = "JPG, PNG, GIF, WebP · MP4 or WebM, up to 90 MB";
      uploadPrompt.textContent = "Choose a photo or video";
      return;
    }
    uploadPrompt.textContent = file.name;
    uploadDetail.textContent = `${(file.size / (1024 * 1024)).toFixed(1)} MB · ready to upload`;
    const objectUrl = URL.createObjectURL(file);
    const media = document.createElement(file.type.startsWith("video/") ? "video" : "img");
    media.className = "upload-preview";
    media.src = objectUrl;
    if (media instanceof HTMLVideoElement) media.controls = true;
    else media.alt = "Selected photo preview";
    preview.append(media);
  });
  uploadField.append(uploadLabel, input, drop, preview, makeElement("span", "field-help", "Photos up to 15 MB. Videos up to 90 MB. Formats: JPG, PNG, GIF, WebP, MP4, WebM."));

  const error = makeElement("p", "admin-form-error");
  error.id = "admin-error";
  error.hidden = true;
  const publish = makeElement("button", "primary-button", "Publish story");
  publish.type = "submit";
  const submitIcon = makeElement("span", "", "↗");
  publish.append(submitIcon);
  form.append(fieldGrid, bodyWrapper, uploadField, error, publish);
  panel.append(notice, form);

  const publishedSection = makeElement("section", "published-list");
  const publishedHeading = makeElement("div", "published-heading");
  const publishedTitle = makeElement("div");
  publishedTitle.append(makeElement("div", "eyebrow", "YOUR NEWSROOM"));
  publishedTitle.append(makeElement("h2", "", "Published stories"));
  const count = makeElement("span");
  count.id = "published-count";
  count.textContent = "0";
  publishedHeading.append(publishedTitle, count);
  const published = document.createElement("div");
  published.id = "published-stories";
  publishedSection.append(publishedHeading, published);
  const bottom = makeElement("div", "admin-bottom");
  const footerLink = makeElement("a", "footer-admin-link", "←  Back to the public site");
  footerLink.href = "/";
  bottom.append(footerLink);
  main.append(heading, panel, publishedSection, bottom);
  document.body.append(header, main);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideFormError();
    const file = input.files?.[0];
    if (file && !allowedMediaTypes.has(file.type)) {
      showFormError("Choose a JPG, PNG, GIF, WebP, MP4, or WebM file.");
      return;
    }
    if (file && file.size > (file.type.startsWith("video/") ? 90 : 15) * 1024 * 1024) {
      showFormError(file.type.startsWith("video/") ? "Videos must be 90 MB or smaller." : "Photos must be 15 MB or smaller.");
      return;
    }
    publish.disabled = true;
    publish.firstChild.textContent = "Publishing… ";
    try {
      const media = file ? { type: file.type, data: await readFileAsDataUrl(file) } : null;
      await api("/api/admin/news", {
        method: "POST",
        body: JSON.stringify({
          title: new FormData(form).get("title"),
          body: new FormData(form).get("body"),
          category: new FormData(form).get("category"),
          media,
        }),
      });
      form.reset();
      preview.replaceChildren();
      uploadPrompt.textContent = "Choose a photo or video";
      uploadDetail.textContent = "JPG, PNG, GIF, WebP · MP4 or WebM, up to 90 MB";
      await loadStories();
      showToast("Your story is live on the public news page.");
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    } catch (error) {
      showFormError(error.message);
    } finally {
      publish.disabled = false;
      publish.firstChild.textContent = "Publish story ";
    }
  });
}

async function renderDashboard() {
  try {
    const session = await api("/api/admin/session");
    if (!session.authenticated) {
      showLogin(session.username);
      return;
    }
    makeDashboard();
    await loadStories();
  } catch (error) {
    showLogin();
    showFormError(error.message);
  }
}

async function initPublicPage() {
  const now = new Date();
  document.querySelector("#today-date").textContent = formatDate(now);
  document.querySelector("#current-year").textContent = String(now.getFullYear());
  document.querySelector("#category-filter").addEventListener("change", (event) => {
    selectedCategory = event.target.value;
    document.querySelectorAll(".topic-nav a").forEach((link) => {
      link.classList.toggle("active", link.dataset.category === selectedCategory);
    });
    renderStories();
  });
  document.querySelectorAll(".topic-nav a").forEach((link) => {
    link.addEventListener("click", () => {
      selectedCategory = link.dataset.category;
      document.querySelector("#category-filter").value = selectedCategory;
      document.querySelectorAll(".topic-nav a").forEach((item) => item.classList.toggle("active", item === link));
      renderStories();
    });
  });
  try {
    await loadStories();
  } catch {
    const error = document.querySelector("#feed-error");
    error.textContent = "We couldn't load the latest stories. Please refresh the page to try again.";
    error.hidden = false;
  }
}

if (window.location.pathname === "/admin" || window.location.pathname === "/admin/") {
  renderDashboard();
} else {
  initPublicPage();
}
