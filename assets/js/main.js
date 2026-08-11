(function () {
  "use strict";

  const IG_URL = "https://www.instagram.com/christyscozycritters/";

  /* ---------- Footer year ---------- */
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Mobile nav ---------- */
  const toggle = document.querySelector(".nav-toggle");
  const menu = document.getElementById("nav-menu");
  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      const open = menu.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    menu.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        menu.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- Helpers ---------- */
  function formatPrice(price) {
    if (price === null || price === undefined || price === "") return "Ask";
    const n = Number(price);
    if (Number.isNaN(n)) return "Ask";
    return "$" + n.toFixed(0);
  }

  function inquire(product) {
    // Carry the product name over to the Contact page.
    window.location.href = "contact.html?product=" + encodeURIComponent(product.name);
  }

  function createCard(product) {
    const card = document.createElement("article");
    card.className = "product-card";

    const isSold = product.status === "sold";

    const media = document.createElement("div");
    media.className = "product-media";
    const img = document.createElement("img");
    img.src = product.image;
    img.alt = product.name;
    img.loading = "lazy";
    media.appendChild(img);
    if (isSold) {
      const badge = document.createElement("span");
      badge.className = "badge badge-sold";
      badge.textContent = "Sold";
      media.appendChild(badge);
    }

    const body = document.createElement("div");
    body.className = "product-body";

    const titleRow = document.createElement("div");
    titleRow.className = "product-title-row";
    const name = document.createElement("h3");
    name.className = "product-name";
    name.textContent = product.name;
    const price = document.createElement("span");
    price.className = "product-price";
    price.textContent = formatPrice(product.price);
    titleRow.appendChild(name);
    titleRow.appendChild(price);

    const desc = document.createElement("p");
    desc.className = "product-desc";
    desc.textContent = product.description;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-primary";
    if (isSold) {
      btn.textContent = "Sold Out";
      btn.disabled = true;
    } else {
      btn.textContent = "Order / Inquire";
      btn.addEventListener("click", function () { inquire(product); });
    }

    body.appendChild(titleRow);
    body.appendChild(desc);
    body.appendChild(btn);

    card.appendChild(media);
    card.appendChild(body);
    return card;
  }

  /* ---------- Shop page ---------- */
  const grid = document.getElementById("product-grid");
  const filtersEl = document.getElementById("filters");
  const emptyEl = document.getElementById("shop-empty");
  const featuredGrid = document.getElementById("featured-grid");

  let allProducts = [];
  let categories = [];
  let activeCategory = "all";

  function renderGrid() {
    if (!grid) return;
    grid.innerHTML = "";
    const list = activeCategory === "all"
      ? allProducts
      : allProducts.filter(function (p) { return p.category === activeCategory; });

    if (list.length === 0) {
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    list.forEach(function (p) { grid.appendChild(createCard(p)); });
  }

  function renderFilters() {
    if (!filtersEl) return;
    filtersEl.innerHTML = "";
    categories.forEach(function (cat) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "filter-chip";
      chip.textContent = cat.label;
      chip.setAttribute("role", "tab");
      chip.setAttribute("aria-selected", String(cat.id === activeCategory));
      chip.addEventListener("click", function () {
        activeCategory = cat.id;
        Array.prototype.forEach.call(filtersEl.children, function (c) {
          c.setAttribute("aria-selected", "false");
        });
        chip.setAttribute("aria-selected", "true");
        renderGrid();
      });
      filtersEl.appendChild(chip);
    });
  }

  function renderFeatured() {
    if (!featuredGrid) return;
    featuredGrid.innerHTML = "";
    const available = allProducts.filter(function (p) { return p.status !== "sold"; });
    const featured = available.filter(function (p) { return p.featured; });
    const others = available.filter(function (p) { return !p.featured; });
    // Prefer items Christy flagged as featured, then fill up to 3 with other available critters.
    featured.concat(others).slice(0, 3).forEach(function (p) {
      featuredGrid.appendChild(createCard(p));
    });
  }

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function initShop(data) {
    allProducts = Array.isArray(data.products) ? data.products : [];
    categories = Array.isArray(data.categories) && data.categories.length
      ? data.categories
      : [{ id: "all", label: "All" }];

    // Preselect a category from ?category= if it's valid.
    const requested = getParam("category");
    if (requested && categories.some(function (c) { return c.id === requested; })) {
      activeCategory = requested;
    }

    renderFilters();
    renderGrid();
    renderFeatured();
  }

  function showLoadError() {
    const target = grid || featuredGrid;
    if (target) {
      target.innerHTML =
        '<p class="shop-empty">We couldn\'t load the shop right now. ' +
        'Please <a href="' + IG_URL + '" target="_blank" rel="noopener">visit Instagram</a> ' +
        'or use the <a href="contact.html">contact page</a>.</p>';
    }
  }

  // Only fetch products on pages that actually show them.
  if (grid || featuredGrid) {
    fetch("products.json")
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(initShop)
      .catch(function (err) {
        console.error("Failed to load products:", err);
        showLoadError();
      });
  }

  /* ---------- Contact page ---------- */
  const form = document.getElementById("contact-form");
  const status = document.getElementById("form-status");

  // Prefill "Interested in" + message from ?product= (set by the shop's Inquire button).
  if (form) {
    const product = getParam("product");
    if (product) {
      const productField = document.getElementById("product");
      const messageField = document.getElementById("message");
      if (productField) productField.value = product;
      if (messageField && !messageField.value) {
        messageField.value = "Hi! I'm interested in the " + product + ". ";
      }
    }
  }

  function showInstagramFallback() {
    if (status) {
      status.innerHTML =
        "Couldn't send the message here. Please DM me on " +
        '<a href="' + IG_URL + '" target="_blank" rel="noopener">Instagram</a> instead.';
      status.className = "form-status error";
    }
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const action = form.getAttribute("action") || "";
      // The form endpoint hasn't been configured yet.
      if (!action || action.indexOf("YOUR_FORM_ID") !== -1) {
        showInstagramFallback();
        return;
      }

      if (status) { status.textContent = "Sending..."; status.className = "form-status"; }

      fetch(action, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form),
      })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          form.reset();
          if (status) {
            status.textContent = "Thank you! Your message is on its way — I'll get back to you soon.";
            status.className = "form-status success";
          }
        })
        .catch(showInstagramFallback);
    });
  }
})();
