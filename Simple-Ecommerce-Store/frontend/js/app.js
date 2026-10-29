const API_HOST = window.location.hostname === "127.0.0.1" ? "127.0.0.1" : "localhost";
const API_BASE = `http://${API_HOST}:5000`;
const CART_KEY = "shopease_cart_v1";
let products = [];
let catalogueProducts = [];
let cart = loadCart();

const productGrid = document.getElementById("productGrid");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const cartCount = document.getElementById("cartCount");
const cartButton = document.getElementById("cartButton");
const searchSuggestions = document.getElementById("searchSuggestions");
const searchButton = document.getElementById("searchButton");
let highlightedSuggestion = -1;
const navLinks = document.querySelectorAll(".nav-link[data-filter]");

function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || "{}"); }
  catch { return {}; }
}
function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartCount();
}
function getValidCartItems() {
  return Object.values(cart).filter(item => {
    if (!item || typeof item !== "object") return false;
    const id = Number(item.productId);
    const qty = Number(item.quantity);
    return Number.isSafeInteger(id) && id >= 1 && Number.isSafeInteger(qty) && qty >= 1 && qty <= 20;
  });
}
function money(value) {
  return Number(value).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}
const SEARCH_SYNONYMS = {
  shoes: "sneakers", shoe: "sneakers", footwear: "sneakers", sneaker: "sneakers",
  watch: "smart watch", watches: "smart watch", headset: "headphones", earphones: "headphones", earbuds: "headphones",
  shirt: "t-shirt", tee: "t-shirt", tshirt: "t-shirt", "t shirt": "t-shirt",
  bag: "backpack", rucksack: "backpack", eyewear: "sunglasses", shades: "sunglasses",
  spectacles: "sunglasses", laptop: "laptop", computer: "laptop", phone: "smartphone", mobile: "smartphone"
};
function normalizedSearch(query) {
  const q = String(query || "").trim().toLowerCase().replace(/\s+/g, " ");
  return SEARCH_SYNONYMS[q] || q;
}
async function fetchProducts({ category = "all" } = {}) {
  if (!productGrid) return;
  productGrid.innerHTML = '<p class="state-message">Loading products…</p>';
  const params = new URLSearchParams();
  if (category && category !== "all") params.set("category", category);
  try {
    const response = await fetch(`${API_BASE}/api/products${params.size ? `?${params}` : ""}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    products = await response.json();
    catalogueProducts = products;
    applyLocalSearch();
  } catch (error) {
    console.error("Product request failed:", error);
    productGrid.innerHTML = '<p class="state-message error-message">Could not load products. Check that the backend and MySQL are running, then refresh.</p>';
  }
}
function renderProducts(items) {
  if (!items.length) {
    productGrid.innerHTML = '<p class="state-message">No products found. Try another keyword or category.</p>';
    return;
  }
  productGrid.innerHTML = items.map(product => `
    <article class="product-card" role="listitem">
      <a class="product-image-container" href="product.html?id=${Number(product.id)}" aria-label="View ${escapeHTML(product.name)}">
        <div class="product-image-wrap"><img class="product-image" src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}" loading="lazy"></div>
        <span class="product-category-badge">${escapeHTML(product.category)}</span>
      </a>
      <div class="product-info"><h3><a href="product.html?id=${Number(product.id)}">${escapeHTML(product.name)}</a></h3>
        <p class="product-desc">${escapeHTML(product.description)}</p>
        <div class="product-bottom"><span class="product-price">${money(product.price)}</span>
          <button class="add-button" data-add="${Number(product.id)}" ${Number(product.stock) < 1 ? "disabled" : ""}>${Number(product.stock) < 1 ? "Out of stock" : "Add to Cart"}</button>
        </div>
      </div>
    </article>`).join("");
}
function getVisibleProducts() {
  const query = normalizedSearch(searchInput?.value || "");
  const category = categoryFilter?.value || "all";
  return catalogueProducts.filter(p => {
    const inCategory = category === "all" || p.category.toLowerCase() === category.toLowerCase();
    const haystack = `${p.name} ${p.description} ${p.category}`.toLowerCase();
    const words = query.split(" ").filter(Boolean);
    return inCategory && (!query || haystack.includes(query) || words.every(word => haystack.includes(word)));
  });
}
function applyLocalSearch() { renderProducts(getVisibleProducts()); renderSuggestions(); }
function applyFilters() {
  // Reload the category from the API; text matching remains local for instant results.
  fetchProducts({ category: categoryFilter?.value || "all" });
}
function openProduct(product) {
  if (!product) return;
  window.location.href = `product.html?id=${encodeURIComponent(product.id)}`;
}
function renderSuggestions() {
  if (!searchSuggestions || !searchInput) return;
  const query = searchInput.value.trim();
  if (!query) { searchSuggestions.hidden = true; searchInput.setAttribute("aria-expanded", "false"); return; }
  const results = getVisibleProducts().slice(0, 6);
  if (!results.length) {
    searchSuggestions.innerHTML = '<div class="search-suggestion-empty">No matching products found</div>';
  } else {
    searchSuggestions.innerHTML = results.map((p, i) => `<button type="button" class="search-suggestion" role="option" aria-selected="${i === highlightedSuggestion}" data-suggestion="${Number(p.id)}"><img src="${escapeHTML(p.image)}" alt=""><span>${escapeHTML(p.name)}<small>${money(p.price)} · ${escapeHTML(p.category)}</small></span></button>`).join("");
  }
  searchSuggestions.hidden = false;
  searchInput.setAttribute("aria-expanded", "true");
}
function submitSearch() {
  const query = searchInput?.value.trim();
  if (!query) { searchInput?.focus(); return; }
  const matches = getVisibleProducts();
  if (matches.length === 1) { openProduct(matches[0]); return; }
  if (matches.length > 1) {
    // If a product name is an exact match, open it; otherwise show filtered results.
    const exact = matches.find(p => p.name.toLowerCase() === normalizedSearch(query));
    if (exact) { openProduct(exact); return; }
    searchSuggestions?.setAttribute("hidden", "");
    document.getElementById("products")?.scrollIntoView({ behavior: "smooth" });
    return;
  }
  renderSuggestions();
}
function updateCartCount() {
  if (cartCount) cartCount.textContent = getValidCartItems().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}
function addToCart(product) {
  const id = String(product.id);
  if (!cart[id]) cart[id] = { productId: Number(product.id), name: product.name, price: Number(product.price), image: product.image, quantity: 0 };
  if (cart[id].quantity >= 20) return alert("Maximum quantity per product is 20.");
  cart[id].quantity += 1;
  saveCart();
}
if (productGrid) {
  productGrid.addEventListener("click", event => {
    const button = event.target.closest("[data-add]");
    if (!button) return;
    const product = products.find(p => Number(p.id) === Number(button.dataset.add));
    if (!product) return;
    addToCart(product);
    button.textContent = "✓ Added!";
    button.classList.add("added");
    setTimeout(() => { button.textContent = "Add to Cart"; button.classList.remove("added"); }, 800);
  });
}
searchInput?.addEventListener("input", () => { highlightedSuggestion = -1; applyLocalSearch(); });
searchInput?.addEventListener("keydown", event => {
  const options = [...(searchSuggestions?.querySelectorAll("[data-suggestion]") || [])];
  if (event.key === "ArrowDown" && options.length) { event.preventDefault(); highlightedSuggestion = (highlightedSuggestion + 1) % options.length; renderSuggestions(); }
  else if (event.key === "ArrowUp" && options.length) { event.preventDefault(); highlightedSuggestion = (highlightedSuggestion - 1 + options.length) % options.length; renderSuggestions(); }
  else if (event.key === "Enter") { event.preventDefault(); const selected = options[highlightedSuggestion]; if (selected) openProduct(catalogueProducts.find(p => Number(p.id) === Number(selected.dataset.suggestion))); else submitSearch(); }
  else if (event.key === "Escape") { if (searchSuggestions) searchSuggestions.hidden = true; searchInput.setAttribute("aria-expanded", "false"); }
});
searchButton?.addEventListener("click", submitSearch);
searchSuggestions?.addEventListener("click", event => { const option = event.target.closest("[data-suggestion]"); if (option) openProduct(catalogueProducts.find(p => Number(p.id) === Number(option.dataset.suggestion))); });
document.addEventListener("click", event => { if (!event.target.closest(".search-wrapper") && searchSuggestions) { searchSuggestions.hidden = true; searchInput?.setAttribute("aria-expanded", "false"); } });
categoryFilter?.addEventListener("change", () => {
  navLinks.forEach(link => link.classList.toggle("active", link.dataset.filter === categoryFilter.value));
  applyFilters();
});
navLinks.forEach(link => link.addEventListener("click", event => {
  event.preventDefault();
  navLinks.forEach(item => item.classList.toggle("active", item === link));
  if (categoryFilter) categoryFilter.value = link.dataset.filter;
  applyFilters();
  document.getElementById("products")?.scrollIntoView({ behavior: "smooth" });
}));
cartButton?.addEventListener("click", () => { window.location.href = "cart.html"; });
updateCartCount();
if (productGrid) fetchProducts();

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function showNotice(element, message, isError = false) {
  if (!element) return;
  element.textContent = message;
  element.className = `notice ${isError ? "notice-error" : "notice-success"}`;
}
function renderCartPage() {
  const host = document.getElementById("cartItems");
  const totalEl = document.getElementById("cartTotal");
  if (!host) return;
  const items = getValidCartItems();
  const checkoutBtn = document.querySelector('a[href="checkout.html"]');
  if (!items.length) {
    host.innerHTML = '<div class="empty-state"><h2>Your cart is empty</h2><p>Discover something you love.</p><a class="btn btn-primary" href="index.html#products">Continue shopping</a></div>';
    if (totalEl) totalEl.textContent = money(0);
    if (checkoutBtn) checkoutBtn.style.display = "none";
    return;
  }
  if (checkoutBtn) checkoutBtn.style.display = "";
  host.innerHTML = items.map(item => `
    <article class="cart-item">
      <img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.name)}">
      <div class="cart-item-info"><h3>${escapeHTML(item.name)}</h3><p>${money(item.price)} each</p>
      <div class="quantity-controls">
        <button type="button" data-qty="${item.productId}" data-delta="-1" aria-label="Decrease quantity">−</button>
        <span>${item.quantity}</span>
        <button type="button" data-qty="${item.productId}" data-delta="1" aria-label="Increase quantity">+</button>
        <button type="button" class="remove-button" data-remove="${item.productId}">Remove</button>
      </div></div><strong>${money(item.price * item.quantity)}</strong>
    </article>`).join("");
  if (totalEl) totalEl.textContent = money(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
}
document.getElementById("cartItems")?.addEventListener("click", event => {
  const qty = event.target.closest("[data-qty]");
  const remove = event.target.closest("[data-remove]");
  if (remove) delete cart[remove.dataset.remove];
  if (qty) {
    const item = cart[qty.dataset.qty];
    if (item) {
      item.quantity += Number(qty.dataset.delta);
      if (item.quantity <= 0) delete cart[qty.dataset.qty];
      if (item.quantity > 20) item.quantity = 20;
    }
  }
  saveCart(); renderCartPage();
});
renderCartPage();

const productDetailHost = document.getElementById("productDetail");
if (productDetailHost) {
  (async () => {
    const id = new URLSearchParams(location.search).get("id");
    try {
      const product = await apiRequest(`/api/products/${encodeURIComponent(id)}`);
      productDetailHost.innerHTML = `
        <div class="detail-image"><img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}"></div>
        <div class="detail-info"><p class="eyebrow">${escapeHTML(product.category)}</p><h1>${escapeHTML(product.name)}</h1>
        <p>${escapeHTML(product.description)}</p><p class="detail-price">${money(product.price)}</p>
        <p>${product.stock > 0 ? `${product.stock} available` : "Out of stock"}</p>
        <button class="btn btn-primary" id="detailAdd" ${product.stock < 1 ? "disabled" : ""}>Add to Cart</button>
        <a class="btn btn-secondary" href="index.html#products">Back to products</a></div>`;
      document.getElementById("detailAdd")?.addEventListener("click", () => { addToCart(product); showNotice(document.getElementById("detailNotice"), "Added to your cart."); });
    } catch (error) { productDetailHost.innerHTML = `<p class="state-message error-message">${escapeHTML(error.message)}</p>`; }
  })();
}

const authForm = document.getElementById("authForm");
if (authForm) {
  const nextParam = new URLSearchParams(location.search).get("next");
  const formNotice = document.getElementById("formNotice");
  if (nextParam === "checkout") {
    if (formNotice) showNotice(formNotice, "Please sign in to proceed with your checkout.");
    const regLink = authForm.querySelector('a[href*="register.html"]');
    if (regLink) regLink.href = "register.html?next=checkout";
    const loginLink = authForm.querySelector('a[href*="login.html"]');
    if (loginLink) loginLink.href = "login.html?next=checkout";
  }

  authForm.addEventListener("submit", async event => {
    event.preventDefault();
    const notice = document.getElementById("formNotice");
    const formData = new FormData(authForm);
    const mode = authForm.dataset.mode;
    const payload = Object.fromEntries(formData.entries());
    try {
      const result = await apiRequest(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify(payload) });
      if (!result.user) throw new Error("The server did not confirm your session. Please try again.");
      const sessionCheck = await apiRequest("/api/auth/me");
      if (!sessionCheck.user || Number(sessionCheck.user.id) !== Number(result.user.id)) throw new Error("Login succeeded but your session was not retained. Use the same host for Live Server and API, then try again.");
      showNotice(notice, mode === "register" ? "Account created. You are now logged in." : "Login successful.");
      const allowedTargets = ["checkout", "profile", "orders", "cart"];
      const target = allowedTargets.includes(nextParam) ? `${nextParam}.html` : "profile.html";
      setTimeout(() => location.href = target, 500);
    } catch (error) { showNotice(notice, error.message, true); }
  });
}
document.getElementById("logoutButton")?.addEventListener("click", async () => {
  try { await apiRequest("/api/auth/logout", { method: "POST", body: "{}" }); location.href = "index.html"; }
  catch (error) { showNotice(document.getElementById("formNotice"), error.message, true); }
});

const checkoutForm = document.getElementById("checkoutForm");
if (checkoutForm) {
  const summary = document.getElementById("checkoutSummary");
  const notice = document.getElementById("formNotice");
  const emptyState = document.getElementById("checkoutEmptyState");

  async function initCheckout() {
    try {
      const session = await apiRequest("/api/auth/me");
      if (!session || !session.user) {
        location.href = "login.html?next=checkout";
        return;
      }
    } catch (err) {
      showNotice(notice, "Could not verify your session. Check that the backend is running and log in.", true);
      return;
    }

    const validItems = getValidCartItems();
    if (!validItems.length) {
      checkoutForm.style.display = "none";
      if (emptyState) emptyState.style.display = "block";
      return;
    }

    if (validItems.length !== Object.values(cart).length) {
      const cleaned = {};
      validItems.forEach(item => { cleaned[item.productId] = item; });
      cart = cleaned;
      saveCart();
    }

    const total = validItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (summary) summary.textContent = `Order total: ${money(total)}`;
  }

  initCheckout();

  checkoutForm.addEventListener("submit", async event => {
    event.preventDefault();
    const validItems = getValidCartItems();
    if (!validItems.length) {
      showNotice(notice, "Your cart is empty. Please add items before checking out.", true);
      checkoutForm.style.display = "none";
      if (emptyState) emptyState.style.display = "block";
      return;
    }

    const form = Object.fromEntries(new FormData(checkoutForm).entries());
    const items = validItems.map(item => ({ productId: item.productId, quantity: item.quantity }));
    const submitBtn = checkoutForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const result = await apiRequest("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          items,
          shipping: {
            name: form.name,
            phone: form.phone,
            address: form.address,
            city: form.city,
            postalCode: form.postalCode
          }
        })
      });
      localStorage.removeItem(CART_KEY);
      cart = {};
      updateCartCount();
      showNotice(notice, `Order #${result.order.id} placed successfully. Total: ${money(result.order.total)}.`);
      checkoutForm.reset();
      if (summary) summary.textContent = `Order total: ${money(0)}`;
      const footerLink = checkoutForm.querySelector(".form-footer");
      if (footerLink) {
        footerLink.innerHTML = '<a href="profile.html">View in My Profile</a> · <a href="index.html#products">Continue shopping</a>';
      }
    } catch (error) {
      if (submitBtn) submitBtn.disabled = false;
      const msg = error.message || "";
      if (msg.includes("log in") || msg.includes("401")) {
        showNotice(notice, "Your session has expired. Please log in again to complete your order.", true);
        setTimeout(() => location.href = "login.html?next=checkout", 1200);
      } else {
        showNotice(notice, msg || "An error occurred while placing your order. Please try again.", true);
      }
    }
  });
}
const profileName = document.getElementById("profileName");
const profileEmail = document.getElementById("profileEmail");
const profileOrderHistory = document.getElementById("orderHistory");
async function loadProfileAndOrders() {
  if (!profileOrderHistory) return;
  try {
    const session = await apiRequest("/api/auth/me");
    if (!session.user) {
      const nextTarget = location.pathname.includes("orders") || !profileName ? "orders" : "profile";
      location.href = `login.html?next=${nextTarget}`;
      return;
    }
    if (profileName) profileName.textContent = session.user.name;
    if (profileEmail) profileEmail.textContent = session.user.email;
    const orders = await apiRequest("/api/orders");
    if (!orders.length) { profileOrderHistory.innerHTML = '<p class="empty-state">No orders yet. Your future purchases will appear here.</p>'; return; }
    profileOrderHistory.innerHTML = orders.map(order => `
      <article class="order-card"><div class="order-heading"><div><strong>Order #${order.id}</strong><span class="order-status status-${escapeHTML(order.status)}">${escapeHTML(order.status)}</span></div><strong>${money(order.total)}</strong></div>
      <p>${new Date(order.created_at).toLocaleString()}</p>
      <ul>${order.items.map(item => `<li>${escapeHTML(item.product_name)} × ${item.quantity} — ${money(item.subtotal)}</li>`).join("")}</ul>
      <p>${escapeHTML(order.shipping_address)}, ${escapeHTML(order.shipping_city)} ${escapeHTML(order.shipping_postal_code)}</p>
      ${order.status === "placed" ? `<button type="button" class="btn btn-secondary" data-cancel-order="${Number(order.id)}">Cancel order</button>` : ""}
    </article>`).join("");
  } catch (error) {
    profileOrderHistory.innerHTML = `<p class="error-message">${escapeHTML(error.message)}. Please log in again if your session has expired.</p>`;
  }
}
loadProfileAndOrders();
profileOrderHistory?.addEventListener("click", async event => {
  const button = event.target.closest("[data-cancel-order]");
  if (!button) return;
  if (!confirm(`Cancel order #${button.dataset.cancelOrder}?`)) return;
  button.disabled = true;
  try {
    await apiRequest(`/api/orders/${button.dataset.cancelOrder}/cancel`, { method: "POST", body: "{}" });
    showNotice(document.getElementById("formNotice"), `Order #${button.dataset.cancelOrder} was cancelled.`);
    await loadProfileAndOrders();
  } catch (error) {
    showNotice(document.getElementById("formNotice"), error.message, true);
    button.disabled = false;
  }
});
