(function () {
  "use strict";

  const loginView = document.getElementById("login-view");
  const appView = document.getElementById("app-view");
  const loginForm = document.getElementById("login-form");
  const loginMsg = document.getElementById("login-msg");

  const listEl = document.getElementById("product-list");
  const saveHint = document.getElementById("save-hint");
  const dirtyBanner = document.getElementById("dirty-banner");
  const saveBtn = document.getElementById("save-btn");

  const modal = document.getElementById("modal");
  const modalTitle = document.getElementById("modal-title");
  const productForm = document.getElementById("product-form");
  const fName = document.getElementById("f-name");
  const fCategory = document.getElementById("f-category");
  const fPrice = document.getElementById("f-price");
  const fDescription = document.getElementById("f-description");
  const fPhoto = document.getElementById("f-photo");
  const fPreview = document.getElementById("f-preview");
  const fStatus = document.getElementById("f-status");
  const fFeatured = document.getElementById("f-featured");
  const uploadMsg = document.getElementById("upload-msg");

  let categories = [];
  let products = [];
  let editingIndex = -1; // -1 means adding a new critter
  let currentImage = ""; // image path for the item being edited
  let dirty = false;

  /* ---------- API helpers ---------- */

  async function api(path, options) {
    const res = await fetch(path, Object.assign({ credentials: "same-origin" }, options));
    let data = {};
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) throw new Error(data.error || "Request failed (" + res.status + ")");
    return data;
  }

  /* ---------- Auth ---------- */

  async function checkSession() {
    try {
      const s = await api("/api/session");
      if (s.authed) {
        showApp();
        await loadProducts();
      } else {
        showLogin(s);
      }
    } catch (e) {
      showLogin({});
    }
  }

  function showLogin(session) {
    loginView.hidden = false;
    appView.hidden = true;
    if (session && session.passwordSet === false) {
      loginMsg.textContent = "Server note: no password is set yet. Ask your setup helper.";
      loginMsg.className = "msg error";
    }
  }

  function showApp() {
    loginView.hidden = true;
    appView.hidden = false;
  }

  loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    loginMsg.textContent = "Checking...";
    loginMsg.className = "msg";
    try {
      await api("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: document.getElementById("password").value }),
      });
      document.getElementById("password").value = "";
      showApp();
      await loadProducts();
    } catch (err) {
      loginMsg.textContent = err.message;
      loginMsg.className = "msg error";
    }
  });

  document.getElementById("logout-btn").addEventListener("click", async function () {
    if (dirty && !confirm("You have unsaved changes. Sign out anyway?")) return;
    await api("/api/logout", { method: "POST" }).catch(function () {});
    window.location.reload();
  });

  /* ---------- Load + render ---------- */

  async function loadProducts() {
    saveHint.textContent = "Loading...";
    saveHint.className = "save-hint";
    try {
      const data = await api("/api/products");
      categories = data.categories || [];
      products = data.products || [];
      setDirty(false);
      renderCategoryOptions();
      renderList();
      saveHint.textContent = "";
    } catch (e) {
      saveHint.textContent = "Couldn't load products: " + e.message;
      saveHint.className = "save-hint error";
    }
  }

  function renderCategoryOptions() {
    fCategory.innerHTML = "";
    categories
      .filter(function (c) { return c.id !== "all"; })
      .forEach(function (c) {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.label;
        fCategory.appendChild(opt);
      });
  }

  function categoryLabel(id) {
    const found = categories.find(function (c) { return c.id === id; });
    return found ? found.label : id;
  }

  function renderList() {
    listEl.innerHTML = "";
    if (products.length === 0) {
      listEl.innerHTML = '<p class="save-hint">No critters yet. Click "+ Add Critter" to create your first one.</p>';
      return;
    }
    products.forEach(function (p, index) {
      const item = document.createElement("div");
      item.className = "admin-item";

      const thumb = document.createElement("img");
      thumb.className = "admin-thumb";
      thumb.src = p.image ? "/preview-image?path=" + encodeURIComponent(p.image) : "";
      thumb.alt = p.name || "";
      thumb.onerror = function () { thumb.style.visibility = "hidden"; };

      const body = document.createElement("div");
      body.className = "admin-item-body";
      const h3 = document.createElement("h3");
      h3.textContent = p.name || "(no name)";
      if (p.status === "sold") h3.appendChild(tag("Sold", "tag-sold"));
      if (p.featured) h3.appendChild(tag("Featured", "tag-featured"));
      const meta = document.createElement("div");
      meta.className = "admin-item-meta";
      const priceText = (p.price === null || p.price === undefined || p.price === "") ? "Ask" : "$" + p.price;
      meta.textContent = categoryLabel(p.category) + " · " + priceText;
      body.appendChild(h3);
      body.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "admin-item-actions";
      const editBtn = document.createElement("button");
      editBtn.className = "icon-btn";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", function () { openModal(index); });
      const delBtn = document.createElement("button");
      delBtn.className = "icon-btn danger";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", function () {
        if (confirm("Delete \"" + (p.name || "this critter") + "\"?")) {
          products.splice(index, 1);
          setDirty(true);
          renderList();
        }
      });
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      item.appendChild(thumb);
      item.appendChild(body);
      item.appendChild(actions);
      listEl.appendChild(item);
    });
  }

  function tag(text, cls) {
    const span = document.createElement("span");
    span.className = "admin-tag " + cls;
    span.textContent = text;
    return span;
  }

  function setDirty(value) {
    dirty = value;
    dirtyBanner.hidden = !value;
  }

  /* ---------- Modal (add / edit) ---------- */

  function openModal(index) {
    editingIndex = typeof index === "number" ? index : -1;
    uploadMsg.textContent = "";
    uploadMsg.className = "upload-msg";
    fPhoto.value = "";

    if (editingIndex >= 0) {
      const p = products[editingIndex];
      modalTitle.textContent = "Edit Critter";
      fName.value = p.name || "";
      fCategory.value = p.category || (categories[1] && categories[1].id) || "";
      fPrice.value = (p.price === null || p.price === undefined) ? "" : p.price;
      fDescription.value = p.description || "";
      fStatus.value = p.status || "available";
      fFeatured.checked = Boolean(p.featured);
      currentImage = p.image || "";
    } else {
      modalTitle.textContent = "Add Critter";
      productForm.reset();
      currentImage = "";
    }
    updatePreview();
    modal.hidden = false;
    fName.focus();
  }

  function closeModal() { modal.hidden = true; }

  document.getElementById("add-btn").addEventListener("click", function () { openModal(-1); });
  document.getElementById("cancel-btn").addEventListener("click", closeModal);
  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });

  function updatePreview() {
    if (currentImage) {
      fPreview.hidden = false;
      fPreview.src = "/preview-image?path=" + encodeURIComponent(currentImage);
    } else {
      fPreview.hidden = true;
      fPreview.removeAttribute("src");
    }
  }

  fPhoto.addEventListener("change", async function () {
    const file = fPhoto.files && fPhoto.files[0];
    if (!file) return;
    uploadMsg.textContent = "Uploading photo...";
    uploadMsg.className = "upload-msg";
    const fd = new FormData();
    fd.append("file", file);
    try {
      const data = await api("/api/upload", { method: "POST", body: fd });
      currentImage = data.path;
      updatePreview();
      uploadMsg.textContent = "Photo uploaded.";
    } catch (e) {
      uploadMsg.textContent = "Upload failed: " + e.message;
      uploadMsg.className = "upload-msg error";
    }
  });

  function slugify(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  productForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const priceRaw = fPrice.value.trim();
    const record = {
      id: editingIndex >= 0 && products[editingIndex].id
        ? products[editingIndex].id
        : slugify(fName.value) + "-" + Date.now().toString(36),
      name: fName.value.trim(),
      category: fCategory.value,
      price: priceRaw === "" ? null : Number(priceRaw),
      description: fDescription.value.trim(),
      image: currentImage || "assets/images/placeholder-custom.svg",
      status: fStatus.value,
      featured: fFeatured.checked,
    };
    if (editingIndex >= 0) {
      products[editingIndex] = record;
    } else {
      products.push(record);
    }
    setDirty(true);
    closeModal();
    renderList();
  });

  /* ---------- Save ---------- */

  saveBtn.addEventListener("click", async function () {
    saveBtn.disabled = true;
    saveHint.textContent = "Saving...";
    saveHint.className = "save-hint";
    try {
      await api("/api/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories: categories, products: products }),
      });
      setDirty(false);
      saveHint.textContent = "Saved! Your website will update in about a minute.";
      saveHint.className = "save-hint success";
    } catch (e) {
      saveHint.textContent = "Save failed: " + e.message;
      saveHint.className = "save-hint error";
    } finally {
      saveBtn.disabled = false;
    }
  });

  window.addEventListener("beforeunload", function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ""; }
  });

  checkSession();
})();
