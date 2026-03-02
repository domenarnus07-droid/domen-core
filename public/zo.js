const navBar = document.createElement('header');
navBar.className = 'app-navbar';

// Funkcija ensureBrandingMeta skrbi za pomemben del logike aplikacije.
function ensureBrandingMeta() {
  const oldTitle = String(document.title || '').trim();
  if (!oldTitle || /street core|spletna trgovina/i.test(oldTitle)) {
    document.title = 'Domen Core';
  }

  let icon = document.querySelector('link[rel="icon"]');
  if (!icon) {
    icon = document.createElement('link');
    icon.setAttribute('rel', 'icon');
    document.head.appendChild(icon);
  }
  if (!icon.getAttribute('href')) {
    icon.setAttribute('href', 'photos/domen-core-logo.svg');
    icon.setAttribute('type', 'image/svg+xml');
  }
}

// Funkcija syncNavOffset skrbi za pomemben del logike aplikacije.
function syncNavOffset() {
  const navHeight = Math.ceil(navBar.getBoundingClientRect().height || 0);
  const offset = Math.max(86, navHeight + 10);
  document.documentElement.style.setProperty('--nav-offset', `${offset}px`);
}

// Funkcija applyTheme skrbi za pomemben del logike aplikacije.
function applyTheme(theme) {
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  document.body.setAttribute('data-theme', nextTheme);
  localStorage.setItem('theme', nextTheme);
  const button = document.getElementById('theme-toggle-btn');
  if (button) {
    button.textContent = nextTheme === 'dark' ? 'Light mode' : 'Dark mode';
  }
}

// Funkcija initTheme skrbi za pomemben del logike aplikacije.
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  applyTheme(savedTheme);
}

// Funkcija ensureToastRoot skrbi za pomemben del logike aplikacije.
function ensureToastRoot() {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    document.body.appendChild(root);
  }
  return root;
}

// Funkcija showToast skrbi za pomemben del logike aplikacije.
function showToast(message, type = 'info', timeout = 2600) {
  const root = ensureToastRoot();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  root.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('is-visible');
  });

  setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 220);
  }, timeout);
}

window.showToast = showToast;

const brand = document.createElement('button');
brand.type = 'button';
brand.className = 'app-brand';
brand.innerHTML = `
  <span class="brand-mark" aria-hidden="true">DC</span>
  <span class="brand-text">DOMEN CORE</span>
`;
brand.addEventListener('click', () => {
  window.location.href = '/';
});
navBar.appendChild(brand);

const middleContainer = document.createElement('nav');
middleContainer.className = 'app-nav-center';

// Funkcija createMenuButton skrbi za pomemben del logike aplikacije.
function createMenuButton(label, href) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'nav-link';
  button.textContent = label;
  button.addEventListener('click', () => {
    window.location.href = href;
  });
  return button;
}

// Funkcija createUnifiedDropdown skrbi za pomemben del logike aplikacije.
function createUnifiedDropdown(title, items) {
  const wrap = document.createElement('div');
  wrap.className = 'nav-dropdown';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'nav-link dropdown-trigger';
  trigger.textContent = title;

  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';

  const params = new URLSearchParams(window.location.search);
  const activeCategory = params.get('category') || '';
  const activeSubcategory = params.get('subcategory') || '';

  items.forEach((item) => {
    const link = document.createElement('a');
    link.className = 'dropdown-item';
    link.textContent = item.label;
    link.href = item.href;

    const itemUrl = new URL(item.href, window.location.origin);
    const itemCat = itemUrl.searchParams.get('category') || '';
    const itemSub = itemUrl.searchParams.get('subcategory') || '';

    if (itemCat === activeCategory && itemSub === activeSubcategory) {
      link.classList.add('is-active');
      trigger.classList.add('is-active');
    }

    menu.appendChild(link);
  });

  let isOpen = false;
  // Funkcija show skrbi za pomemben del logike aplikacije.
  const show = () => {
    isOpen = true;
    wrap.classList.add('open');
  };
  // Funkcija hide skrbi za pomemben del logike aplikacije.
  const hide = () => {
    isOpen = false;
    wrap.classList.remove('open');
  };

  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOpen) hide(); else show();
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) hide();
  });

  wrap.addEventListener('mouseenter', show);
  wrap.addEventListener('mouseleave', hide);

  wrap.appendChild(trigger);
  wrap.appendChild(menu);
  return wrap;
}

middleContainer.appendChild(createMenuButton('Trgovina', 'index.html'));

const rightContainer = document.createElement('div');
rightContainer.className = 'app-nav-right';

const buttonContainer = document.createElement('div');
buttonContainer.className = 'nav-actions';

// Funkcija createActionButton skrbi za pomemben del logike aplikacije.
function createActionButton(label, className, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

const loginButton = createActionButton('Login', 'nav-btn nav-btn-light', () => {
  window.location.href = 'prijava.html';
});
buttonContainer.appendChild(loginButton);

const registerButton = createActionButton('Register', 'nav-btn nav-btn-accent', () => {
  window.location.href = 'registracija.html';
});
buttonContainer.appendChild(registerButton);

const logoutButton = createActionButton('Odjava', 'nav-btn nav-btn-danger account-logout-btn', () => {
  logout();
});
logoutButton.style.display = 'none';

const themeButton = createActionButton('Dark mode', 'nav-btn nav-btn-light', () => {
  const current = document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
});
themeButton.id = 'theme-toggle-btn';
buttonContainer.appendChild(themeButton);

const adminButton = createActionButton('Admin', 'nav-btn nav-btn-accent', () => {
  window.location.href = '/admin.html';
});
adminButton.style.display = 'none';
buttonContainer.appendChild(adminButton);

const accountWrap = document.createElement('div');
accountWrap.className = 'account-menu-wrap';
accountWrap.style.display = 'none';

const accountBtn = document.createElement('button');
accountBtn.type = 'button';
accountBtn.className = 'account-avatar-btn account-settings-btn no-avatar';
accountBtn.setAttribute('aria-label', 'Nastavitve racuna');
accountBtn.innerHTML = '';

// Funkcija setAccountAvatar skrbi za pomemben del logike aplikacije.
function setAccountAvatar(user) {
  const avatar = String(user?.avatar || '').trim();
  if (avatar) {
    accountBtn.innerHTML = `<img class="account-avatar-img" src="${avatar}" alt="Avatar">`;
    accountBtn.classList.remove('no-avatar');
    return;
  }
  accountBtn.innerHTML = '';
  accountBtn.classList.add('no-avatar');
}

accountBtn.addEventListener('click', () => {
  window.location.href = 'profile.html';
});

const cartIconBtn = document.createElement('button');
cartIconBtn.type = 'button';
cartIconBtn.className = 'account-avatar-btn nav-cart-icon-btn';
cartIconBtn.setAttribute('aria-label', 'Kosarica');
cartIconBtn.innerHTML = `
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path fill="currentColor" d="M7 7V6a5 5 0 0 1 10 0v1h2a1 1 0 0 1 1 1l-1 11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 8a1 1 0 0 1 1-1h2zm2 0h6V6a3 3 0 0 0-6 0v1z"/>
  </svg>
  <span id="cart-count" class="nav-cart-count" style="display:none;">0</span>
`;
cartIconBtn.style.display = 'none';
cartIconBtn.addEventListener('click', () => {
  window.location.href = 'kosarica.html';
});

const cartWrap = document.createElement('div');
cartWrap.className = 'nav-cart-wrap';

const cartPreview = document.createElement('div');
cartPreview.className = 'nav-cart-preview';
cartPreview.innerHTML = `
  <p class="nav-cart-preview-title">Kosarica</p>
  <div class="nav-cart-preview-list" id="nav-cart-preview-list"></div>
  <div class="nav-cart-preview-footer">
    <strong id="nav-cart-preview-total">Skupaj: 0.00 EUR</strong>
    <a href="kosarica.html">Pojdi v kosarico</a>
  </div>
`;

cartWrap.appendChild(cartIconBtn);
cartWrap.appendChild(cartPreview);

accountWrap.appendChild(accountBtn);

rightContainer.appendChild(buttonContainer);
rightContainer.appendChild(logoutButton);
rightContainer.appendChild(cartWrap);
rightContainer.appendChild(accountWrap);

navBar.appendChild(middleContainer);
navBar.appendChild(rightContainer);

document.body.prepend(navBar);
document.body.classList.add('has-nav');
ensureBrandingMeta();
syncNavOffset();
window.addEventListener('resize', syncNavOffset);

// Funkcija ensureGlobalFooter skrbi za pomemben del logike aplikacije.
function ensureGlobalFooter() {
  if (document.querySelector('footer.site-footer')) return;
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `
    <div class="site-footer-inner">
      <nav class="site-footer-links" aria-label="Podpora">
        <a href="podpora.html#pomoc">Pomoc</a>
        <a href="podpora.html#dostava">Dostava</a>
        <a href="podpora.html#kontakt">Kontakt</a>
      </nav>
      <p class="site-footer-motto">Lace up. Rule the streets.</p>
      <div class="site-footer-meta">
        <p>&copy; 2025 Domen Core. Vse pravice pridrzane.</p>
      </div>
    </div>
  `;
  document.body.appendChild(footer);
}

ensureGlobalFooter();

if (!window.location.pathname.includes('registracija.html') && !window.location.pathname.includes('prijava.html')) {
  fetch('/api/user')
    .then((res) => res.json())
    .then((data) => {
      if (!data.user) return;

      loginButton.style.display = 'none';
      registerButton.style.display = 'none';
      logoutButton.style.display = 'inline-block';
      themeButton.style.display = 'inline-block';
      accountWrap.style.display = 'block';
      cartIconBtn.style.display = 'grid';
      setAccountAvatar(data.user);
      if (data.user.role === 'admin') {
        adminButton.style.display = 'inline-block';
      }
      syncNavOffset();
    })
    .catch(() => {
      // Napake pri preverjanju prijave v navigaciji tukaj varno ignoriramo.
      syncNavOffset();
    });
}

async function register(event) {
  event.preventDefault();

  const username = String(document.getElementById('username').value || '').trim();
  const email = String(document.getElementById('email').value || '').trim().toLowerCase();
  const password = String(document.getElementById('password').value || '');
  const confirmPassword = String(document.getElementById('confirmPassword').value || '');
  const usernamePattern = /^[a-zA-Z0-9_]{3,24}$/;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const strongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

  if (!usernamePattern.test(username)) {
    showToast('Uporabnisko ime: 3-24 znakov (crke, stevilke, _).', 'error');
    return;
  }
  if (!emailPattern.test(email)) {
    showToast('Vnesi veljaven email naslov (npr. ime@gmail.com).', 'error');
    return;
  }
  if (!strongPasswordPattern.test(password)) {
    showToast('Geslo: min 8 znakov + velika, mala crka, stevilka in poseben znak.', 'error');
    return;
  }
  if (password !== confirmPassword) {
    showToast('Gesli se ne ujemata. Prosim preveri vnos.', 'error');
    return;
  }

  const res = await fetch('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password })
  });

  if (res.ok) {
    window.location.replace('/prijava.html');
    return;
  }

  const msg = await res.text();
  showToast(msg || 'Registracija ni uspela. Poskusi znova.', 'error');
}

async function login(event) {
  event.preventDefault();

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  const res = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  if (res.ok) {
    window.location.href = 'index.html';
    return;
  }

  const msg = await res.text();
  showToast(msg || 'Prijava ni uspela.', 'error');
}

async function logout() {
  localStorage.removeItem('kosarica');
  const res = await fetch('/logout');
  if (res.redirected) {
    window.location.href = res.url;
  } else {
    window.location.href = '/prijava.html';
  }
}

async function checkAuth() {
  const res = await fetch('/api/user');
  const data = await res.json();
  if (!data.user) {
    window.location.href = '/prijava.html';
  }
}

// Funkcija addToCart skrbi za pomemben del logike aplikacije.
function addToCart(ime, cena, size = '', productId = '', oldCena = 0, hasDiscount = false, image = '') {
  fetch('/api/user')
    .then((res) => res.json())
    .then((data) => {
      if (!data.user) {
        showToast('Najprej se morate prijaviti, da lahko dodate izdelek v kosarico.', 'error');
        return;
      }

      const kosarica = JSON.parse(localStorage.getItem('kosarica')) || [];
      const safeSize = size || 'Univerzalno';
      const safeProductId = String(productId || '');
      const existingIndex = kosarica.findIndex((item) => (
        String(item?.productId || '') === safeProductId
        && String(item?.size || 'Univerzalno') === safeSize
      ));
      if (existingIndex >= 0) {
        const nextQty = Math.max(1, Math.floor(Number(kosarica[existingIndex].kolicina || 1) + 1));
        kosarica[existingIndex] = {
          ...kosarica[existingIndex],
          cena,
          oldCena: Number(oldCena) || 0,
          hasDiscount: !!hasDiscount,
          image: String(image || 'photos/dunks.png'),
          kolicina: nextQty
        };
      } else {
        kosarica.push({
          ime,
          cena,
          oldCena: Number(oldCena) || 0,
          hasDiscount: !!hasDiscount,
          image: String(image || 'photos/dunks.png'),
          size: safeSize,
          productId: safeProductId,
          kolicina: 1
        });
      }
      localStorage.setItem('kosarica', JSON.stringify(kosarica));
      osveziSteviloVKosarici();
      showToast('Izdelek je dodan v kosarico.', 'success');
    });
}

// Funkcija removeFromCart skrbi za pomemben del logike aplikacije.
function removeFromCart(index) {
  const kosarica = JSON.parse(localStorage.getItem('kosarica')) || [];

  if (index >= 0 && index < kosarica.length) {
    kosarica.splice(index, 1);
    localStorage.setItem('kosarica', JSON.stringify(kosarica));
    showToast('Izdelek je bil odstranjen iz kosarice.', 'info');
    location.reload();
  }
}

// Funkcija osveziSteviloVKosarici skrbi za pomemben del logike aplikacije.
function osveziSteviloVKosarici() {
  const kosarica = JSON.parse(localStorage.getItem('kosarica')) || [];
  const countSpans = [document.getElementById('cart-count')].filter(Boolean);
  const previewList = document.getElementById('nav-cart-preview-list');
  const previewTotal = document.getElementById('nav-cart-preview-total');
  const safeItems = Array.isArray(kosarica) ? kosarica : [];
  if (!countSpans.length) return;
  const totalQty = safeItems.reduce((acc, item) => acc + Math.max(1, Math.floor(Number(item?.kolicina || 1))), 0);
  const totalPrice = safeItems.reduce((acc, item) => {
    const qty = Math.max(1, Math.floor(Number(item?.kolicina || 1)));
    const price = Number(item?.cena || 0);
    return acc + ((Number.isFinite(price) ? price : 0) * qty);
  }, 0);

  countSpans.forEach((countSpan) => {
    if (totalQty > 0) {
      countSpan.textContent = String(totalQty);
      countSpan.style.display = 'inline-flex';
    } else {
      countSpan.style.display = 'none';
    }
  });

  if (previewList) {
    if (!safeItems.length) {
      previewList.innerHTML = '<p class="nav-cart-preview-empty">Kosarica je prazna.</p>';
    } else {
      const topItems = safeItems.slice(0, 4);
      previewList.innerHTML = topItems.map((item) => {
        const name = String(item?.ime || 'Izdelek');
        const image = String(item?.image || 'photos/dunks.png');
        const qty = Math.max(1, Math.floor(Number(item?.kolicina || 1)));
        const price = Number(item?.cena || 0);
        const line = (Number.isFinite(price) ? price : 0) * qty;
        return `
          <div class="nav-cart-preview-item">
            <img src="${image}" alt="${name}">
            <div>
              <p>${name}</p>
              <small>${qty}x - ${line.toFixed(2)} EUR</small>
            </div>
          </div>
        `;
      }).join('');
    }
  }
  if (previewTotal) {
    previewTotal.textContent = `Skupaj: ${totalPrice.toFixed(2)} EUR`;
  }
}

document.addEventListener('DOMContentLoaded', osveziSteviloVKosarici);
window.addEventListener('storage', (e) => {
  if (e.key === 'kosarica') osveziSteviloVKosarici();
});
document.addEventListener('DOMContentLoaded', initTheme);




