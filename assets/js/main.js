(function () {
  "use strict";

  const IG_URL = "https://www.instagram.com/christyscozycritters/";

  // Every critter is knit from a pattern by The Cozy Company. If a listing has no
  // credit of its own, this one is shown so the designer is never left off.
  const DEFAULT_CREDIT = { name: "The Cozy Company", url: "http://www.TheCozyCompanyNH.com" };
  let companies = [];

  // Icon and blurb for each season/holiday. The home page cards are built from the
  // same category list the shop uses, so the two pages can't drift apart.
  const CATEGORY_LOOK = {
    "year-round": { icon: "\uD83E\uDDF8", blurb: "Snuggly critters for any time of year." },
    "spring": { icon: "\uD83C\uDF37", blurb: "Fresh blooms and new little friends." },
    "summer": { icon: "\u2600\uFE0F", blurb: "Bright, sunny critters for warm days." },
    "fall": { icon: "\uD83C\uDF42", blurb: "Warm colors and cozy autumn favorites." },
    "winter": { icon: "\u2744\uFE0F", blurb: "Snug knits for the coldest months." },
    "new-year": { icon: "\uD83C\uDF89", blurb: "Ring in the new year in style." },
    "lunar-new-year": { icon: "\uD83D\uDC09", blurb: "Celebrate the Lunar New Year." },
    "valentines": { icon: "\u2764\uFE0F", blurb: "Handmade love for your valentine." },
    "st-patricks": { icon: "\uD83C\uDF40", blurb: "A little luck of the Irish." },
    "easter": { icon: "\uD83D\uDC30", blurb: "Bunnies, chicks, and basket fillers." },
    "mothers-day": { icon: "\uD83D\uDC90", blurb: "Something special for mom." },
    "fathers-day": { icon: "\uD83D\uDC54", blurb: "A cozy gift for dad." },
    "fourth-of-july": { icon: "\uD83C\uDF86", blurb: "Red, white, and handmade." },
    "halloween": { icon: "\uD83C\uDF83", blurb: "Spooky-cute critters for trick-or-treat." },
    "thanksgiving": { icon: "\uD83E\uDD83", blurb: "Gather-round gifts and table charm." },
    "hanukkah": { icon: "\uD83D\uDD4E", blurb: "Handmade warmth for the Festival of Lights." },
    "christmas": { icon: "\uD83C\uDF84", blurb: "Stockings and holiday critters." },
    "kwanzaa": { icon: "\uD83D\uDD6F\uFE0F", blurb: "Celebrate with something handmade." },
  };

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

  function productSeasons(product) {
    if (Array.isArray(product.seasons) && product.seasons.length) return product.seasons;
    if (product.category) return [product.category]; // older listings
    return ["year-round"];
  }

  function findCompany(id) {
    return companies.find(function (c) { return c.id === id; });
  }

  function nameFromCompanyId(id) {
    return String(id || "").split("-").filter(Boolean).map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join(" ") || "Unknown";
  }

  function resolveCompany(id) {
    return findCompany(id) || { name: nameFromCompanyId(id), url: "" };
  }

  function resolveCredits(product) {
    if (Array.isArray(product.credits) && product.credits.length) {
      return product.credits.map(resolveCompany);
    }
    if (product.credit) {
      return [{ name: product.credit, url: product.creditUrl || "" }];
    }
    return [DEFAULT_CREDIT];
  }

  function companiesForCreditsPage() {
    if (companies.length) return companies;
    const seen = {};
    const derived = [];
    allProducts.forEach(function (p) {
      if (Array.isArray(p.credits)) {
        p.credits.forEach(function (id) {
          if (!id || seen[id]) return;
          seen[id] = true;
          derived.push(resolveCompany(id));
        });
      } else if (p.credit && !seen[p.credit]) {
        seen[p.credit] = true;
        derived.push({ name: p.credit, url: p.creditUrl || "" });
      }
    });
    return derived;
  }

  function appendCreditName(parent, credit) {
    if (credit.url) {
      const link = document.createElement("a");
      link.href = credit.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = credit.name;
      parent.appendChild(link);
    } else {
      parent.appendChild(document.createTextNode(credit.name));
    }
  }

  function createCredit(product) {
    const wrap = document.createElement("p");
    wrap.className = "product-credit";
    wrap.appendChild(document.createTextNode("Pattern design: "));
    const list = resolveCredits(product);
    list.forEach(function (credit, i) {
      if (i > 0) {
        const sep = i === list.length - 1
          ? (list.length === 2 ? " and " : ", and ")
          : ", ";
        wrap.appendChild(document.createTextNode(sep));
      }
      appendCreditName(wrap, credit);
    });
    return wrap;
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
    body.appendChild(createCredit(product));
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
  const categoryCards = document.getElementById("category-cards");
  const companyList = document.getElementById("company-list");

  let allProducts = [];
  let categories = [];
  let activeCategory = "all";

  function renderGrid() {
    if (!grid) return;
    if (window.__cccEditActive) return; // manager is showing editable cards
    grid.innerHTML = "";
    const list = activeCategory === "all"
      ? allProducts
      : allProducts.filter(function (p) {
          return productSeasons(p).indexOf(activeCategory) !== -1;
        });

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

  function renderCategoryCards() {
    if (!categoryCards) return;
    categoryCards.innerHTML = "";
    categories
      .filter(function (cat) { return cat.id !== "all"; })
      .forEach(function (cat) {
        const look = CATEGORY_LOOK[cat.id] || {};
        const card = document.createElement("a");
        card.className = "category-card";
        card.href = "shop.html?category=" + encodeURIComponent(cat.id);

        const icon = document.createElement("span");
        icon.className = "category-emoji";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = look.icon || "\uD83E\uDDF6";

        const title = document.createElement("h3");
        title.textContent = cat.label;

        const blurb = document.createElement("p");
        blurb.textContent = look.blurb || "";

        card.appendChild(icon);
        card.appendChild(title);
        card.appendChild(blurb);
        categoryCards.appendChild(card);
      });
  }

  function renderFeatured() {
    if (!featuredGrid) return;
    featuredGrid.innerHTML = "";
    if (allProducts.length === 0) {
      featuredGrid.innerHTML =
        '<p class="shop-empty">New critters are on the way — follow along on ' +
        '<a href="' + IG_URL + '" target="_blank" rel="noopener">Instagram</a> for the latest.</p>';
      return;
    }
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

  function renderCompanyList() {
    if (!companyList) return;
    if (window.__cccEditActive) return;
    companyList.innerHTML = "";
    const list = companiesForCreditsPage();
    if (list.length === 0) {
      companyList.innerHTML = '<p class="shop-empty">No companies listed yet.</p>';
      return;
    }
    list.forEach(function (c) {
      const card = document.createElement("article");
      card.className = "company-card";
      const title = document.createElement("h2");
      if (c.url) {
        const link = document.createElement("a");
        link.href = c.url;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = c.name;
        title.appendChild(link);
      } else {
        title.textContent = c.name;
      }
      card.appendChild(title);
      if (c.url) {
        const url = document.createElement("p");
        url.className = "company-url";
        url.textContent = c.url;
        card.appendChild(url);
      }
      companyList.appendChild(card);
    });
  }

  function initShop(data) {
    allProducts = Array.isArray(data.products) ? data.products : [];
    categories = Array.isArray(data.categories) && data.categories.length
      ? data.categories
      : [{ id: "all", label: "All" }];
    companies = Array.isArray(data.companies) ? data.companies : [];

    // Preselect a category from ?category= if it's one we know about.
    const requested = getParam("category");
    if (requested && categories.some(function (c) { return c.id === requested; })) {
      activeCategory = requested;
    }

    renderFilters();
    renderGrid();
    renderCategoryCards();
    renderFeatured();
    renderCompanyList();
  }

  function showLoadError() {
    const target = grid || featuredGrid || companyList;
    if (target) {
      target.innerHTML =
        '<p class="shop-empty">We couldn\'t load this page right now. ' +
        'Please <a href="' + IG_URL + '" target="_blank" rel="noopener">visit Instagram</a> ' +
        'or use the <a href="contact.html">contact page</a>.</p>';
    }
  }

  // Only fetch catalog data on pages that actually show it.
  if (grid || featuredGrid || categoryCards || companyList) {
    // The unique query string skips the browser and CDN caches. Without it a saved
    // change can take several minutes to appear, which looks like the save failed.
    fetch("products.json?v=" + Date.now(), { cache: "no-store" })
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
