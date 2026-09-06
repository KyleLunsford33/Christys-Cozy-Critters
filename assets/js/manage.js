(function () {
  "use strict";

  // The manager (web service) address. If you ever rename that Render service, update this.
  var API_BASE = "https://christys-cozycritters.onrender.com";
  var TOKEN_KEY = "ccc_token";
  var DEFAULT_CREDIT = { name: "The Cozy Company", url: "http://www.TheCozyCompanyNH.com" };

  var grid = document.getElementById("product-grid");
  var filtersEl = document.getElementById("filters");
  var companyListEl = document.getElementById("company-list");
  var onShop = !!grid;
  var onCredits = !!companyListEl;

  var state = { categories: [], products: [], companies: [] };
  var previewUrls = {}; // path -> temporary object URL for photos uploaded this session
  var loginModal = null;
  var editModal = null;
  var companyModal = null;
  var toolbar = null;
  var editingIndex = -1;
  var editingCompanyIndex = -1;
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

  function slugify(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function findCompanyByName(name) {
    var n = String(name || "").trim().toLowerCase();
    return state.companies.find(function (c) { return String(c.name || "").trim().toLowerCase() === n; });
  }

  function findCompanyById(id) {
    return state.companies.find(function (c) { return c.id === id; });
  }

  function uniqueCompanyId(name) {
    var base = slugify(name) || "company";
    var id = base;
    var n = 2;
    while (state.companies.some(function (c) { return c.id === id; })) {
      id = base + "-" + n;
      n += 1;
    }
    return id;
  }

  function upsertCompany(name, url) {
    var existing = findCompanyByName(name);
    if (existing) {
      if (url) existing.url = url;
      return existing.id;
    }
    var company = { id: uniqueCompanyId(name), name: name, url: url || "" };
    state.companies.push(company);
    return company.id;
  }

  function applyCatalog(data) {
    state.categories = data.categories || [];
    state.products = data.products || [];
    state.companies = data.companies || [];
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
    if (onShop) { enterShopEditMode(); }
    else if (onCredits) { enterCreditsEditMode(); }
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
          if (onShop) { enterShopEditMode(); }
          else if (onCredits) { enterCreditsEditMode(); }
          else { window.location.href = "shop.html"; }
        } else {
          openLogin();
        }
      });
    });
  }

  /* ---------- Shared save ---------- */
  function toolbarMsg(text, isError) {
    if (!toolbar) return;
    var m = toolbar.querySelector("#ccc-toolbar-msg");
    m.textContent = text || "";
    m.className = "ccc-msg" + (isError ? " error" : (text ? " success" : ""));
  }

  function exitEditMode() {
    window.__cccEditActive = false;
    window.location.reload();
  }

  async function saveAll() {
    var saveBtn = toolbar.querySelector("#ccc-save");
    saveBtn.disabled = true;
    toolbarMsg("Saving...");
    try {
      await apiFetch("/api/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: state.categories,
          products: state.products,
          companies: state.companies,
        }),
      });
      toolbarMsg("Saved! Your website will update in about a minute.");
    } catch (e) {
      if (!loggedIn()) { openLogin(); toolbarMsg("Your session ended — please sign in again.", true); }
      else { toolbarMsg("Save failed: " + e.message, true); }
    } finally {
      saveBtn.disabled = false;
    }
  }

  function makeToolbar(container, addId, addLabel, onAdd, onReload) {
    if (toolbar) return;
    toolbar = document.createElement("div");
    toolbar.className = "ccc-toolbar";
    toolbar.hidden = true;
    toolbar.innerHTML =
      '<div class="ccc-toolbar-row">' +
      '<span class="ccc-toolbar-title">Edit mode</span>' +
      '<div class="ccc-toolbar-actions">' +
      '<button class="btn btn-primary" id="' + addId + '">' + addLabel + "</button>" +
      '<button class="btn btn-save" id="ccc-save">Save &amp; Update Site</button>' +
      '<button class="btn btn-ghost" id="ccc-reload">Reload</button>' +
      '<button class="btn btn-ghost" id="ccc-exit">Exit</button>' +
      '<button class="btn btn-ghost" id="ccc-logout">Sign Out</button>' +
      "</div></div>" +
      '<p class="ccc-msg" id="ccc-toolbar-msg" role="status" aria-live="polite"></p>';
    container.insertBefore(toolbar, container.firstChild);

    toolbar.querySelector("#" + addId).addEventListener("click", onAdd);
    toolbar.querySelector("#ccc-save").addEventListener("click", saveAll);
    toolbar.querySelector("#ccc-reload").addEventListener("click", onReload);
    toolbar.querySelector("#ccc-exit").addEventListener("click", exitEditMode);
    toolbar.querySelector("#ccc-logout").addEventListener("click", function () { setToken(""); window.location.reload(); });
  }

  /* ---------- Shop edit mode ---------- */
  function enterShopEditMode() {
    if (!onShop) { window.location.href = "shop.html"; return; }
    window.__cccEditActive = true;
    if (filtersEl) filtersEl.style.display = "none";
    ensureShopToolbar();
    toolbar.hidden = false;
    toolbarMsg("Loading your critters...");
    apiFetch("/api/products")
      .then(function (data) {
        applyCatalog(data);
        toolbarMsg("");
        renderEditable();
      })
      .catch(function () {
        if (!loggedIn()) { exitEditMode(); openLogin(); return; }
        toolbarMsg("Couldn't load — the manager may be waking up (up to a minute). Click Reload.", true);
      });
  }

  function ensureShopToolbar() {
    makeToolbar(grid.parentNode, "ccc-add", "+ Add Critter", function () { openEditor(-1); }, enterShopEditMode);
  }

  function categoryLabel(id) {
    var c = state.categories.find(function (x) { return x.id === id; });
    return c ? c.label : id;
  }

  function productSeasons(p) {
    if (Array.isArray(p.seasons) && p.seasons.length) return p.seasons;
    if (p.category) return [p.category]; // older listings
    return ["year-round"];
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
        productSeasons(p).map(categoryLabel).join(" · ") + (p.featured ? " · Featured" : "");

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

  /* ---------- Critter credits ---------- */
  function creditRowsFromProduct(p) {
    if (p && Array.isArray(p.credits) && p.credits.length) {
      return p.credits.map(function (id) {
        var c = findCompanyById(id);
        return c ? { name: c.name, url: c.url || "" } : null;
      }).filter(Boolean);
    }
    if (p && p.credit) {
      return [{ name: p.credit, url: p.creditUrl || "" }];
    }
    return [{ name: DEFAULT_CREDIT.name, url: DEFAULT_CREDIT.url }];
  }

  function addCreditRow(name, url) {
    var list = editModal.querySelector("#ccc-credits");
    var row = document.createElement("div");
    row.className = "ccc-credit-row";
    row.innerHTML =
      '<input type="text" class="ccc-credit-name" placeholder="The Cozy Company" />' +
      '<input type="url" class="ccc-credit-url" placeholder="http://www.TheCozyCompanyNH.com" />' +
      '<button type="button" class="btn btn-ghost ccc-credit-remove">Remove</button>';
    row.querySelector(".ccc-credit-name").value = name || "";
    row.querySelector(".ccc-credit-url").value = url || "";
    row.querySelector(".ccc-credit-remove").addEventListener("click", function () {
      var rows = list.querySelectorAll(".ccc-credit-row");
      if (rows.length <= 1) {
        row.querySelector(".ccc-credit-name").value = "";
        row.querySelector(".ccc-credit-url").value = "";
        return;
      }
      row.remove();
    });
    list.appendChild(row);
  }

  function fillCreditRows(rows) {
    var list = editModal.querySelector("#ccc-credits");
    list.innerHTML = "";
    (rows.length ? rows : [{ name: DEFAULT_CREDIT.name, url: DEFAULT_CREDIT.url }]).forEach(function (r) {
      addCreditRow(r.name, r.url);
    });
  }

  function collectCreditIds() {
    var rows = editModal.querySelectorAll(".ccc-credit-row");
    var ids = [];
    Array.prototype.forEach.call(rows, function (row) {
      var name = row.querySelector(".ccc-credit-name").value.trim();
      var url = row.querySelector(".ccc-credit-url").value.trim();
      if (!name) return;
      var id = upsertCompany(name, url);
      if (ids.indexOf(id) === -1) ids.push(id);
    });
    if (ids.length === 0) ids.push(upsertCompany(DEFAULT_CREDIT.name, DEFAULT_CREDIT.url));
    return ids;
  }

  /* ---------- Editor modal ---------- */
  function ensureEditModal() {
    if (editModal) return;
    editModal = document.createElement("div");
    editModal.className = "ccc-modal";
    editModal.hidden = true;
    editModal.innerHTML =
      '<div class="ccc-modal-card ccc-modal-card-wide" role="dialog" aria-modal="true" aria-label="Edit critter">' +
      '<h2 id="ccc-edit-title">Add Critter</h2>' +
      '<form id="ccc-edit-form">' +
      '<div class="field"><label for="ccc-name">Name</label><input type="text" id="ccc-name" required /></div>' +
      '<div class="field"><span class="ccc-label">Seasons &amp; holidays</span>' +
      '<p class="ccc-hint">Tick every one it belongs to. A pumpkin can be both Fall and Halloween.</p>' +
      '<div class="ccc-checks" id="ccc-seasons"></div></div>' +
      '<div class="field"><label for="ccc-price">Price (dollars)</label>' +
      '<input type="number" id="ccc-price" min="0" step="1" placeholder="Leave blank to show Ask" /></div>' +
      '<div class="field"><label for="ccc-desc">Description</label><textarea id="ccc-desc" rows="3" required></textarea></div>' +
      '<div class="field"><span class="ccc-label">Pattern designers</span>' +
      '<p class="ccc-hint">Add every company whose pattern you used. New names also appear on the Credits page.</p>' +
      '<div id="ccc-credits" class="ccc-credit-list"></div>' +
      '<button type="button" class="btn btn-ghost" id="ccc-add-credit">+ Add another designer</button></div>' +
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
    editModal.querySelector("#ccc-add-credit").addEventListener("click", function () { addCreditRow("", ""); });
    editModal.querySelector("#ccc-photo").addEventListener("change", onPhotoChosen);
    editModal.querySelector("#ccc-edit-form").addEventListener("submit", onEditorSubmit);
  }

  function fillSeasonChecks(selected) {
    var wrap = editModal.querySelector("#ccc-seasons");
    wrap.innerHTML = "";
    state.categories
      .filter(function (c) { return c.id !== "all"; })
      .forEach(function (c) {
        var label = document.createElement("label");
        label.className = "ccc-check";
        var input = document.createElement("input");
        input.type = "checkbox";
        input.value = c.id;
        if (selected.indexOf(c.id) !== -1) input.checked = true;
        label.appendChild(input);
        label.appendChild(document.createTextNode(" " + c.label));
        wrap.appendChild(label);
      });
  }

  function openEditor(index) {
    ensureEditModal();
    editingIndex = index;
    currentImage = "";
    editModal.querySelector("#ccc-edit-form").reset();
    var upMsg = editModal.querySelector("#ccc-upload-msg");
    upMsg.textContent = "";
    upMsg.className = "ccc-msg";
    var preview = editModal.querySelector("#ccc-preview");
    preview.hidden = true;
    preview.removeAttribute("src");

    if (index >= 0) {
      var p = state.products[index];
      editModal.querySelector("#ccc-edit-title").textContent = "Edit Critter";
      editModal.querySelector("#ccc-name").value = p.name || "";
      editModal.querySelector("#ccc-price").value = (p.price === null || p.price === undefined) ? "" : p.price;
      editModal.querySelector("#ccc-desc").value = p.description || "";
      editModal.querySelector("#ccc-status").value = p.status || "available";
      editModal.querySelector("#ccc-featured").checked = !!p.featured;
      fillSeasonChecks(productSeasons(p));
      fillCreditRows(creditRowsFromProduct(p));
      currentImage = p.image || "";
      if (currentImage) { preview.hidden = false; preview.src = imgSrc(currentImage); }
    } else {
      editModal.querySelector("#ccc-edit-title").textContent = "Add Critter";
      fillSeasonChecks(["year-round"]);
      fillCreditRows([{ name: DEFAULT_CREDIT.name, url: DEFAULT_CREDIT.url }]);
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

  function onEditorSubmit(e) {
    e.preventDefault();
    var priceRaw = editModal.querySelector("#ccc-price").value.trim();
    var name = editModal.querySelector("#ccc-name").value.trim();
    var checked = editModal.querySelectorAll("#ccc-seasons input:checked");
    var seasons = Array.prototype.map.call(checked, function (i) { return i.value; });
    if (seasons.length === 0) seasons = ["year-round"]; // never let a critter fall out of the shop
    var record = {
      id: (editingIndex >= 0 && state.products[editingIndex].id)
        ? state.products[editingIndex].id
        : slugify(name) + "-" + Date.now().toString(36),
      name: name,
      seasons: seasons,
      price: priceRaw === "" ? null : Number(priceRaw),
      description: editModal.querySelector("#ccc-desc").value.trim(),
      credits: collectCreditIds(),
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

  /* ---------- Credits page edit mode ---------- */
  function enterCreditsEditMode() {
    if (!onCredits) { window.location.href = "credits.html"; return; }
    window.__cccEditActive = true;
    ensureCreditsToolbar();
    toolbar.hidden = false;
    toolbarMsg("Loading companies...");
    apiFetch("/api/products")
      .then(function (data) {
        applyCatalog(data);
        toolbarMsg("");
        renderEditableCompanies();
      })
      .catch(function () {
        if (!loggedIn()) { exitEditMode(); openLogin(); return; }
        toolbarMsg("Couldn't load — the manager may be waking up (up to a minute). Click Reload.", true);
      });
  }

  function ensureCreditsToolbar() {
    makeToolbar(companyListEl.parentNode, "ccc-add-company", "+ Add Company", function () {
      openCompanyEditor(-1);
    }, enterCreditsEditMode);
  }

  function renderEditableCompanies() {
    companyListEl.innerHTML = "";
    if (state.companies.length === 0) {
      companyListEl.innerHTML = '<p class="shop-empty">No companies yet. Click "+ Add Company" to add one.</p>';
      return;
    }
    state.companies.forEach(function (c, index) {
      var card = document.createElement("article");
      card.className = "company-card edit-card";
      var title = document.createElement("h2");
      title.textContent = c.name || "(no name)";
      card.appendChild(title);
      if (c.url) {
        var url = document.createElement("p");
        url.className = "company-url";
        url.textContent = c.url;
        card.appendChild(url);
      }
      var actions = document.createElement("div");
      actions.className = "edit-card-actions";
      var edit = document.createElement("button");
      edit.className = "btn btn-primary";
      edit.textContent = "Edit";
      edit.addEventListener("click", function () { openCompanyEditor(index); });
      var del = document.createElement("button");
      del.className = "btn btn-ghost";
      del.textContent = "Delete";
      del.addEventListener("click", function () { deleteCompany(index); });
      actions.appendChild(edit);
      actions.appendChild(del);
      card.appendChild(actions);
      companyListEl.appendChild(card);
    });
  }

  function deleteCompany(index) {
    var c = state.companies[index];
    if (!c) return;
    if (!confirm('Remove "' + (c.name || "this company") + '" from the credits list?')) return;
    var id = c.id;
    state.companies.splice(index, 1);
    state.products.forEach(function (p) {
      if (Array.isArray(p.credits)) {
        p.credits = p.credits.filter(function (cid) { return cid !== id; });
      }
    });
    renderEditableCompanies();
    toolbarMsg("Removed. Click Save & Update Site to make it live.");
  }

  function ensureCompanyModal() {
    if (companyModal) return;
    companyModal = document.createElement("div");
    companyModal.className = "ccc-modal";
    companyModal.hidden = true;
    companyModal.innerHTML =
      '<div class="ccc-modal-card" role="dialog" aria-modal="true" aria-label="Edit company">' +
      '<h2 id="ccc-company-title">Add Company</h2>' +
      '<form id="ccc-company-form">' +
      '<div class="field"><label for="ccc-company-name">Company name</label>' +
      '<input type="text" id="ccc-company-name" required placeholder="The Cozy Company" /></div>' +
      '<div class="field"><label for="ccc-company-url">Website</label>' +
      '<input type="url" id="ccc-company-url" placeholder="http://www.TheCozyCompanyNH.com" /></div>' +
      '<div class="ccc-modal-actions"><button type="button" class="btn btn-ghost" id="ccc-company-cancel">Cancel</button>' +
      '<button type="submit" class="btn btn-primary">Done</button></div>' +
      "</form></div>";
    document.body.appendChild(companyModal);

    companyModal.addEventListener("click", function (e) { if (e.target === companyModal) companyModal.hidden = true; });
    companyModal.querySelector("#ccc-company-cancel").addEventListener("click", function () { companyModal.hidden = true; });
    companyModal.querySelector("#ccc-company-form").addEventListener("submit", onCompanySubmit);
  }

  function openCompanyEditor(index) {
    ensureCompanyModal();
    editingCompanyIndex = index;
    companyModal.querySelector("#ccc-company-form").reset();
    if (index >= 0) {
      var c = state.companies[index];
      companyModal.querySelector("#ccc-company-title").textContent = "Edit Company";
      companyModal.querySelector("#ccc-company-name").value = c.name || "";
      companyModal.querySelector("#ccc-company-url").value = c.url || "";
    } else {
      companyModal.querySelector("#ccc-company-title").textContent = "Add Company";
    }
    companyModal.hidden = false;
    companyModal.querySelector("#ccc-company-name").focus();
  }

  function onCompanySubmit(e) {
    e.preventDefault();
    var name = companyModal.querySelector("#ccc-company-name").value.trim();
    var url = companyModal.querySelector("#ccc-company-url").value.trim();
    if (!name) return;
    if (editingCompanyIndex >= 0) {
      var current = state.companies[editingCompanyIndex];
      current.name = name;
      current.url = url;
    } else {
      upsertCompany(name, url);
    }
    companyModal.hidden = true;
    renderEditableCompanies();
    toolbarMsg("Saved to the list. Click Save & Update Site to publish.");
  }

  /* ---------- Boot ---------- */
  function boot() {
    wireManageLinks();
    // If already signed in, drop straight into the matching edit mode.
    if (loggedIn() && (onShop || onCredits)) {
      apiFetch("/api/session")
        .then(function (s) {
          if (s && s.authed) {
            if (onShop) enterShopEditMode();
            else enterCreditsEditMode();
          } else {
            setToken("");
          }
        })
        .catch(function () { /* offline / asleep: stay on public view, link still works */ });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
