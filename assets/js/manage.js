(function () {
  "use strict";

  // The manager (web service) address. If you ever rename that Render service, update this.
  var API_BASE = "https://christys-cozycritters.onrender.com";
  var TOKEN_KEY = "ccc_token";

  var grid = document.getElementById("product-grid");
  var filtersEl = document.getElementById("filters");
  var onShop = !!grid;

  var state = { categories: [], products: [] };
  var previewUrls = {}; // path -> temporary object URL for photos uploaded this session
  var loginModal = null;
  var editModal = null;
  var toolbar = null;
  var editingIndex = -1;
  var currentImage = "";

  function token() { return localStorage.getItem(TOKEN_KEY) || ""; }
  function setToken(t) { if (t) { localStorage.setItem(TOKEN_KEY, t); } else { localStorage.removeItem(TOKEN_KEY); } }
  function loggedIn() { return !!token(); }

  /* ---------- API ---------- */
  async function apiFetch(path, options) {
    options = options || {};
    options.headers = options.headers || {};
    if (token()) options.headers["Authorization"] = "Bearer " + token();
    var res = await fetch(API_BASE + path, options);
    var data = {};
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (res.status === 401) { setToken(""); throw new Error(data.error || "Please sign in again."); }
    if (!res.ok) throw new Error(data.error || "Request failed (" + res.status + ")");
    return data;
  }

  function imgSrc(pth) {
    if (!pth) return "assets/images/placeholder-custom.svg";
    return previewUrls[pth] || pth;
  }

  /* ---------- Login modal ---------- */
  function ensureLoginModal() {
    if (loginModal) return;
    loginModal = document.createElement("div");
    loginModal.className = "ccc-modal";
    loginModal.hidden = true;
    loginModal.innerHTML =
      '<div class="ccc-modal-card" role="dialog" aria-modal="true" aria-label="Sign in">' +
      '<h2>Sign in to manage the shop</h2>' +
      '<form id="ccc-login-form">' +
      '<div class="field"><label for="ccc-pass">Password</label>' +
      '<input type="password" id="ccc-pass" autocomplete="current-password" required /></div>' +
      '<div class="ccc-modal-actions">' +
      '<button type="button" class="btn btn-ghost" id="ccc-login-cancel">Cancel</button>' +
      '<button type="submit" class="btn btn-primary">Sign In</button></div>' +
      '<p class="ccc-msg" id="ccc-login-msg" role="status" aria-live="polite"></p>' +
      "</form></div>";
    document.body.appendChild(loginModal);

    loginModal.addEventListener("click", function (e) { if (e.target === loginModal) closeLogin(); });
    loginModal.querySelector("#ccc-login-cancel").addEventListener("click", closeLogin);
    loginModal.querySelector("#ccc-login-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      var msg = loginModal.querySelector("#ccc-login-msg");
      msg.textContent = "Checking...";
      msg.className = "ccc-msg";
      try {
        var d = await apiFetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: loginModal.querySelector("#ccc-pass").value }),
        });
        setToken(d.token);
        loginModal.querySelector("#ccc-pass").value = "";
        closeLogin();
        afterLogin();
      } catch (err) {
        msg.textContent = err.message;
        msg.className = "ccc-msg error";
      }
    });
  }
  function openLogin() { ensureLoginModal(); loginModal.hidden = false; loginModal.querySelector("#ccc-pass").focus(); }
  function closeLogin() { if (loginModal) loginModal.hidden = true; }

  function afterLogin() {
    if (onShop) { enterEditMode(); }
    else { window.location.href = "shop.html"; }
  }

  /* ---------- Manage links ---------- */
  function wireManageLinks() {
    var links = document.querySelectorAll("#manage-link, .footer-admin");
    Array.prototype.forEach.call(links, function (a) {
      a.setAttribute("href", "#");
      a.addEventListener("click", function (e) {
        e.preventDefault();
        if (loggedIn()) {
          if (onShop) { enterEditMode(); }
          else { window.location.href = "shop.html"; }
        } else {
          openLogin();
        }
      });
    });
  }

  /* ---------- Edit mode ---------- */
  function enterEditMode() {
    if (!onShop) { window.location.href = "shop.html"; return; }
    window.__cccEditActive = true;
    if (filtersEl) filtersEl.style.display = "none";
    ensureToolbar();
    toolbar.hidden = false;
    toolbarMsg("Loading your critters...");
    apiFetch("/api/products")
      .then(function (data) {
        state.categories = data.categories || [];
        state.products = data.products || [];
        toolbarMsg("");
        renderEditable();
      })
      .catch(function (err) {
        if (!loggedIn()) { exitEditMode(); openLogin(); return; }
        toolbarMsg("Couldn't load — the manager may be waking up (up to a minute). Click Reload.", true);
      });
  }

  function exitEditMode() {
    window.__cccEditActive = false;
    window.location.reload();
  }

  function ensureToolbar() {
    if (toolbar) return;
    var container = grid.parentNode;
    toolbar = document.createElement("div");
    toolbar.className = "ccc-toolbar";
    toolbar.hidden = true;
    toolbar.innerHTML =
      '<div class="ccc-toolbar-row">' +
      '<span class="ccc-toolbar-title">Edit mode</span>' +
      '<div class="ccc-toolbar-actions">' +
      '<button class="btn btn-primary" id="ccc-add">+ Add Critter</button>' +
      '<button class="btn btn-save" id="ccc-save">Save &amp; Update Site</button>' +
      '<button class="btn btn-ghost" id="ccc-reload">Reload</button>' +
      '<button class="btn btn-ghost" id="ccc-exit">Exit</button>' +
      '<button class="btn btn-ghost" id="ccc-logout">Sign Out</button>' +
      "</div></div>" +
      '<p class="ccc-msg" id="ccc-toolbar-msg" role="status" aria-live="polite"></p>';
    container.insertBefore(toolbar, container.firstChild);

    toolbar.querySelector("#ccc-add").addEventListener("click", function () { openEditor(-1); });
    toolbar.querySelector("#ccc-save").addEventListener("click", saveAll);
    toolbar.querySelector("#ccc-reload").addEventListener("click", function () { enterEditMode(); });
    toolbar.querySelector("#ccc-exit").addEventListener("click", exitEditMode);
    toolbar.querySelector("#ccc-logout").addEventListener("click", function () { setToken(""); window.location.reload(); });
  }

  function toolbarMsg(text, isError) {
    if (!toolbar) return;
    var m = toolbar.querySelector("#ccc-toolbar-msg");
    m.textContent = text || "";
    m.className = "ccc-msg" + (isError ? " error" : (text ? " success" : ""));
  }

  function categoryLabel(id) {
    var c = state.categories.find(function (x) { return x.id === id; });
    return c ? c.label : id;
  }

  function renderEditable() {
    grid.innerHTML = "";
    if (state.products.length === 0) {
      grid.innerHTML = '<p class="shop-empty">No critters yet. Click "+ Add Critter" to create one.</p>';
      return;
    }
    state.products.forEach(function (p, index) {
      var card = document.createElement("article");
      card.className = "product-card edit-card";

      var media = document.createElement("div");
      media.className = "product-media";
      var img = document.createElement("img");
      img.src = imgSrc(p.image);
      img.alt = p.name || "";
      media.appendChild(img);
      if (p.status === "sold") {
        var b = document.createElement("span");
        b.className = "badge badge-sold";
        b.textContent = "Sold";
        media.appendChild(b);
      }

      var body = document.createElement("div");
      body.className = "product-body";
      var priceText = (p.price === null || p.price === undefined || p.price === "") ? "Ask" : "$" + p.price;
      body.innerHTML =
        '<div class="product-title-row"><h3 class="product-name"></h3>' +
        '<span class="product-price"></span></div>' +
        '<p class="product-desc"></p>';
      body.querySelector(".product-name").textContent = p.name || "(no name)";
      body.querySelector(".product-price").textContent = priceText;
      body.querySelector(".product-desc").textContent =
        categoryLabel(p.category) + (p.featured ? " · Featured" : "");

      var actions = document.createElement("div");
      actions.className = "edit-card-actions";
      var edit = document.createElement("button");
      edit.className = "btn btn-primary";
      edit.textContent = "Edit";
      edit.addEventListener("click", function () { openEditor(index); });
      var del = document.createElement("button");
      del.className = "btn btn-ghost";
      del.textContent = "Delete";
      del.addEventListener("click", function () {
        if (confirm('Delete "' + (p.name || "this critter") + '"?')) {
          state.products.splice(index, 1);
          renderEditable();
          toolbarMsg("Removed. Click Save & Update Site to make it live.");
        }
      });
      actions.appendChild(edit);
      actions.appendChild(del);
      body.appendChild(actions);

      card.appendChild(media);
      card.appendChild(body);
      grid.appendChild(card);
    });
  }

  /* ---------- Editor modal ---------- */
  function ensureEditModal() {
    if (editModal) return;
    editModal = document.createElement("div");
    editModal.className = "ccc-modal";
    editModal.hidden = true;
    editModal.innerHTML =
      '<div class="ccc-modal-card" role="dialog" aria-modal="true" aria-label="Edit critter">' +
      '<h2 id="ccc-edit-title">Add Critter</h2>' +
      '<form id="ccc-edit-form">' +
      '<div class="field"><label for="ccc-name">Name</label><input type="text" id="ccc-name" required /></div>' +
      '<div class="field"><label for="ccc-cat">Category</label><select id="ccc-cat"></select></div>' +
      '<div class="field"><label for="ccc-price">Price (dollars)</label>' +
      '<input type="number" id="ccc-price" min="0" step="1" placeholder="Leave blank to show Ask" /></div>' +
      '<div class="field"><label for="ccc-desc">Description</label><textarea id="ccc-desc" rows="3" required></textarea></div>' +
      '<div class="field"><label for="ccc-photo">Photo</label><input type="file" id="ccc-photo" accept="image/*" />' +
      '<p class="ccc-msg" id="ccc-upload-msg"></p><img id="ccc-preview" class="ccc-preview" alt="" hidden /></div>' +
      '<div class="field-row"><div class="field"><label for="ccc-status">Status</label>' +
      '<select id="ccc-status"><option value="available">Available</option><option value="sold">Sold</option></select></div>' +
      '<label class="ccc-check"><input type="checkbox" id="ccc-featured" /> Feature on home page</label></div>' +
      '<div class="ccc-modal-actions"><button type="button" class="btn btn-ghost" id="ccc-edit-cancel">Cancel</button>' +
      '<button type="submit" class="btn btn-primary">Done</button></div>' +
      "</form></div>";
    document.body.appendChild(editModal);

    editModal.addEventListener("click", function (e) { if (e.target === editModal) editModal.hidden = true; });
    editModal.querySelector("#ccc-edit-cancel").addEventListener("click", function () { editModal.hidden = true; });
    editModal.querySelector("#ccc-photo").addEventListener("change", onPhotoChosen);
    editModal.querySelector("#ccc-edit-form").addEventListener("submit", onEditorSubmit);
  }

  function fillCategoryOptions() {
    var sel = editModal.querySelector("#ccc-cat");
    sel.innerHTML = "";
    state.categories
      .filter(function (c) { return c.id !== "all"; })
      .forEach(function (c) {
        var o = document.createElement("option");
        o.value = c.id;
        o.textContent = c.label;
        sel.appendChild(o);
      });
  }

  function openEditor(index) {
    ensureEditModal();
    fillCategoryOptions();
    editingIndex = index;
    currentImage = "";
    var upMsg = editModal.querySelector("#ccc-upload-msg");
    upMsg.textContent = "";
    upMsg.className = "ccc-msg";
    editModal.querySelector("#ccc-photo").value = "";
    var preview = editModal.querySelector("#ccc-preview");

    if (index >= 0) {
      var p = state.products[index];
      editModal.querySelector("#ccc-edit-title").textContent = "Edit Critter";
      editModal.querySelector("#ccc-name").value = p.name || "";
      editModal.querySelector("#ccc-cat").value = p.category || "";
      editModal.querySelector("#ccc-price").value = (p.price === null || p.price === undefined) ? "" : p.price;
      editModal.querySelector("#ccc-desc").value = p.description || "";
      editModal.querySelector("#ccc-status").value = p.status || "available";
      editModal.querySelector("#ccc-featured").checked = !!p.featured;
      currentImage = p.image || "";
      if (currentImage) { preview.hidden = false; preview.src = imgSrc(currentImage); }
      else { preview.hidden = true; preview.removeAttribute("src"); }
    } else {
      editModal.querySelector("#ccc-edit-title").textContent = "Add Critter";
      editModal.querySelector("#ccc-edit-form").reset();
      preview.hidden = true;
      preview.removeAttribute("src");
    }
    editModal.hidden = false;
    editModal.querySelector("#ccc-name").focus();
  }

  async function onPhotoChosen() {
    var input = editModal.querySelector("#ccc-photo");
    var file = input.files && input.files[0];
    if (!file) return;
    var upMsg = editModal.querySelector("#ccc-upload-msg");
    var preview = editModal.querySelector("#ccc-preview");
    // Instant local preview.
    var localUrl = URL.createObjectURL(file);
    preview.hidden = false;
    preview.src = localUrl;
    upMsg.textContent = "Uploading photo...";
    upMsg.className = "ccc-msg";
    try {
      var fd = new FormData();
      fd.append("file", file);
      var d = await apiFetch("/api/upload", { method: "POST", body: fd });
      currentImage = d.path;
      previewUrls[d.path] = localUrl; // so it previews before the site redeploys
      upMsg.textContent = "Photo added.";
      upMsg.className = "ccc-msg success";
    } catch (e) {
      upMsg.textContent = "Upload failed: " + e.message;
      upMsg.className = "ccc-msg error";
    }
  }

  function slugify(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function onEditorSubmit(e) {
    e.preventDefault();
    var priceRaw = editModal.querySelector("#ccc-price").value.trim();
    var name = editModal.querySelector("#ccc-name").value.trim();
    var record = {
      id: (editingIndex >= 0 && state.products[editingIndex].id)
        ? state.products[editingIndex].id
        : slugify(name) + "-" + Date.now().toString(36),
      name: name,
      category: editModal.querySelector("#ccc-cat").value,
      price: priceRaw === "" ? null : Number(priceRaw),
      description: editModal.querySelector("#ccc-desc").value.trim(),
      image: currentImage || "assets/images/placeholder-custom.svg",
      status: editModal.querySelector("#ccc-status").value,
      featured: editModal.querySelector("#ccc-featured").checked,
    };
    if (editingIndex >= 0) { state.products[editingIndex] = record; }
    else { state.products.push(record); }
    editModal.hidden = true;
    renderEditable();
    toolbarMsg("Saved to the list. Click Save & Update Site to publish.");
  }

  async function saveAll() {
    var saveBtn = toolbar.querySelector("#ccc-save");
    saveBtn.disabled = true;
    toolbarMsg("Saving...");
    try {
      await apiFetch("/api/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories: state.categories, products: state.products }),
      });
      toolbarMsg("Saved! Your website will update in about a minute.");
    } catch (e) {
      if (!loggedIn()) { openLogin(); toolbarMsg("Your session ended — please sign in again.", true); }
      else { toolbarMsg("Save failed: " + e.message, true); }
    } finally {
      saveBtn.disabled = false;
    }
  }

  /* ---------- Boot ---------- */
  function boot() {
    wireManageLinks();
    // If already signed in and on the shop page, drop straight into edit mode.
    if (loggedIn() && onShop) {
      apiFetch("/api/session")
        .then(function (s) { if (s && s.authed) { enterEditMode(); } else { setToken(""); } })
        .catch(function () { /* offline / asleep: stay on public view, link still works */ });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
