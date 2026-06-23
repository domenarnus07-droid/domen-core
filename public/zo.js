// ===== BRANDING & THEME =====

const navBar = document.createElement('header');
navBar.className = 'app-navbar';

// Poskrbi za osnovne branding meta oznake v dokumentu.
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

// Posodobi odmik vsebine glede na višino navbarja.
function syncNavOffset() {
  const navHeight = Math.ceil(navBar.getBoundingClientRect().height || 0);
  const offset = Math.max(86, navHeight + 10);
  document.documentElement.style.setProperty('--nav-offset', `${offset}px`);
}

// Uporabi izbrano temo na strani.
function applyTheme(theme) {
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  document.body.setAttribute('data-theme', nextTheme);
  localStorage.setItem('theme', nextTheme);
  const button = document.getElementById('theme-toggle-btn');
  if (button) {
    button.textContent = nextTheme === 'dark' ? 'Light mode' : 'Dark mode';
  }
}

// Inicializira temo iz shranjenih nastavitev.
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  applyTheme(savedTheme);
}

// ===== TOAST =====

// Poskrbi, da obstaja root za toast sporočila.
function ensureToastRoot() {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    document.body.appendChild(root);
  }
  return root;
}

// Prikaže kratko obvestilo uporabniku.
function showToast(message, type = 'info', timeout = 2600) {
  const root = ensureToastRoot();
  root.replaceChildren();
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

// ===== ANALYTICS =====

// Beleži ključne funnel korake.
async function trackFunnel(stage, meta = {}) {
  try {
    const payload = {
      stage: String(stage || '').trim(),
      page: String(window.location.pathname || ''),
      meta: meta && typeof meta === 'object' ? meta : {}
    };
    if (!payload.stage) return;
    await fetch('/api/analytics/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    });
  } catch (_err) {
    // Analytics ne sme prekiniti uporabniške akcije.
  }
}

window.trackFunnel = trackFunnel;

// ===== FORM VALIDATION =====

// Vklopi enoten prikaz validacije na obrazcih.
function initValidationAssistant() {
  const forms = Array.from(document.querySelectorAll('form:not([data-skip-validation-assistant="true"])'));
  if (!forms.length) return;

  const hasConstraintFields = forms.some((form) => form.querySelector('[required], [pattern], [minlength], [maxlength], input[type="email"], input[type="password"]'));
  if (!hasConstraintFields) return;

  document.body.classList.add('has-validation-hint');

  let panel = document.getElementById('validation-hint-panel');
  if (!panel) {
    panel = document.createElement('aside');
    panel.id = 'validation-hint-panel';
    panel.className = 'validation-hint-panel';
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = `
      <p class="validation-hint-title">Preverjanje vnosa</p>
      <p class="validation-hint-main"></p>
      <p class="validation-hint-fix"></p>
    `;
    document.body.appendChild(panel);
  }
  panel.classList.add('is-hidden');

  const titleEl = panel.querySelector('.validation-hint-title');
  const mainEl = panel.querySelector('.validation-hint-main');
  const fixEl = panel.querySelector('.validation-hint-fix');

  // Vrne pravila za posamezno polje.
  function ruleTextForField(field) {
    const id = String(field.id || '').toLowerCase();
    const label = document.querySelector(`label[for="${field.id}"]`);
    const title = String(field.getAttribute('title') || '').trim();
    if (title) return title;

    if (id.includes('email') || field.type === 'email') {
      return 'Vnesi veljaven email, npr. ime@gmail.com.';
    }
    if (id.includes('password') || field.type === 'password') {
      return 'Geslo: vsaj 8 znakov, velika/mala črka, številka in poseben znak.';
    }
    if (field.hasAttribute('minlength')) {
      return `Vnos mora imeti vsaj ${field.getAttribute('minlength')} znakov.`;
    }
    if (field.hasAttribute('required')) {
      const name = label ? label.textContent.replace(':', '').trim() : 'To polje';
      return `${name} je obvezno polje.`;
    }
    return 'Vnesi zahtevane podatke v pravilni obliki.';
  }

  // Pripravi status in sporočilo za polje.
  function evaluateFieldMessage(field) {
    if (!field) {
      return {
        ok: true,
        title: 'Preverjanje vnosa',
        main: 'Vnos je pravilen.',
        fix: 'Nadaljuj z oddajo obrazca.'
      };
    }

    if (!field.checkValidity()) {
      const validity = field.validity;
      let main = 'Vnos ni pravilen.';
      let fix = ruleTextForField(field);

      if (validity.valueMissing) {
        main = 'Polje je prazno.';
        fix = 'Izpolni obvezno polje.';
      } else if (validity.typeMismatch && (field.type === 'email' || String(field.id || '').toLowerCase().includes('email'))) {
        main = 'Email ni v pravilni obliki.';
        fix = 'Uporabi obliko npr. ime@gmail.com.';
      } else if (validity.customError) {
        main = String(field.validationMessage || 'Vnos ni pravilen.');
        fix = 'Preveri obe polji in ponovno vnesi enako vrednost.';
      } else if (validity.tooShort) {
        const min = field.getAttribute('minlength');
        main = `Vnos je prekratek (min ${min} znakov).`;
        fix = `Dodaj še nekaj znakov, najmanj ${min}.`;
      } else if (validity.patternMismatch) {
        main = 'Vnos ne ustreza zahtevanemu formatu.';
        fix = ruleTextForField(field);
      }

      return {
        ok: false,
        title: 'Napaka vnosa',
        main,
        fix
      };
    }

    return {
      ok: true,
      title: 'Pravilno',
      main: 'Vnos je pravilen.',
      fix: 'Lahko nadaljuješ.'
    };
  }

  // Posodobi stanje validacijskega panela.
  function updatePanel(field) {
    const state = evaluateFieldMessage(field);
    panel.classList.remove('is-error', 'is-success');
    panel.classList.add(state.ok ? 'is-success' : 'is-error');
    panel.classList.remove('is-hidden');
    titleEl.textContent = state.title;
    mainEl.textContent = state.main;
    fixEl.textContent = state.fix;
  }
  // Skrije validacijski panel do oddaje obrazca.
  function hidePanel() {
    panel.classList.add('is-hidden');
  }

  // Preveri, ali se gesli ujemata.
  function syncConfirmPasswordValidity(field) {
    if (!field) return;
    const id = String(field.id || '').toLowerCase();
    if (!id.includes('confirm')) return;
    const passwordField = document.getElementById('password');
    if (!passwordField) return;
    if (String(field.value || '') && field.value !== passwordField.value) {
      field.setCustomValidity('Gesli se ne ujemata.');
    } else {
      field.setCustomValidity('');
    }
  }

  forms.forEach((form) => {
    const fields = Array.from(form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select'));
    if (!fields.length) return;

    form.setAttribute('novalidate', 'novalidate');

    fields.forEach((field) => {
      field.addEventListener('focus', () => {
        syncConfirmPasswordValidity(field);
        hidePanel();
      });
      field.addEventListener('input', () => {
        syncConfirmPasswordValidity(field);
        hidePanel();
      });
      field.addEventListener('change', () => {
        syncConfirmPasswordValidity(field);
        hidePanel();
      });
    });

    form.addEventListener('submit', (event) => {
      let firstInvalid = null;
      fields.forEach((field) => {
        syncConfirmPasswordValidity(field);
        if (!firstInvalid && !field.checkValidity()) firstInvalid = field;
      });

      if (firstInvalid) {
        event.preventDefault();
        event.stopImmediatePropagation();
        updatePanel(firstInvalid);
        firstInvalid.focus();
        return;
      }

      hidePanel();
    }, true);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initValidationAssistant, { once: true });
} else {
  initValidationAssistant();
}

// ===== NAVBAR BUILD =====

const brand = document.createElement('button');
brand.type = 'button';
brand.className = 'app-brand';
brand.innerHTML = `
  <img src="photos/domen-core-logo.svg" alt="Domen Core logo" class="brand-logo">
  <span class="brand-text">DOMEN CORE</span>
`;
brand.addEventListener('click', () => {
  window.location.href = '/';
});
navBar.appendChild(brand);

const middleContainer = document.createElement('nav');
middleContainer.className = 'app-nav-center';

// Ustvari gumb za meni v navbarju.
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

// Ustvari enoten dropdown meni.
function createUnifiedDropdown(title, items) {
  const wrap = document.createElement('div');
  wrap.className = 'nav-dropdown';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'nav-link dropdown-trigger';
  trigger.innerHTML = `${title}<span class="dropdown-chevron" aria-hidden="true">&#9660;</span>`;

  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';

  const params = new URLSearchParams(window.location.search);
  const activeCategory = params.get('category') || '';
  const activeSubcategory = params.get('subcategory') || '';
  const activeSort = params.get('sort') || '';

  items.forEach((item) => {
    if (item.type === 'label') {
      const label = document.createElement('p');
      label.className = 'dropdown-label';
      label.textContent = item.label;
      menu.appendChild(label);
      return;
    }

    const link = document.createElement('a');
    link.className = 'dropdown-item';
    if (item.cta) link.classList.add('dropdown-item-cta');
    const imageHtml = item.image
      ? `<img class="dropdown-item-media" src="${String(item.image)}" alt="${String(item.label)}" loading="lazy" decoding="async">`
      : '';
    link.innerHTML = `
      ${imageHtml}
      <span class="dropdown-item-text">${item.label}</span>
    `;
    link.href = item.href;

    const itemUrl = new URL(item.href, window.location.origin);
    const itemCat = itemUrl.searchParams.get('category') || '';
    const itemSub = itemUrl.searchParams.get('subcategory') || '';
    const itemSort = itemUrl.searchParams.get('sort') || '';

    if (
      itemCat === activeCategory
      && itemSub === activeSubcategory
      && (itemSort ? itemSort === activeSort : true)
    ) {
      link.classList.add('is-active');
      trigger.classList.add('is-active');
    }

    menu.appendChild(link);
  });

  let isOpen = false;
  // Odpre dropdown meni.
  const show = () => {
    isOpen = true;
    wrap.classList.add('open');
  };
  // Zapre dropdown meni.
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

// Ustvari shop dropdown meni.
function createShopDropdown() {
  const items = [
    { type: 'label', label: 'Znamke' },
    { label: 'Nike modeli', href: 'index.html?subcategory=Nike', image: 'photos/3.png' },
    { label: 'Adidas modeli', href: 'index.html?subcategory=Adidas', image: 'photos/adidas1.png' },
    { label: 'Jordan modeli', href: 'index.html?subcategory=Jordan', image: 'photos/jordan1.png' },
    { label: 'Asics modeli', href: 'index.html?subcategory=Asics', image: 'photos/asics2.png' },
    { type: 'label', label: 'Hitri skoki' },
    { label: 'Novi modeli', href: 'index.html?sort=newest', image: 'photos/5.png' },
    { label: 'Best seller', href: 'index.html?sort=bestseller', image: 'photos/jordan2.png' },
    { label: 'Najcenejši', href: 'index.html?sort=price_asc', image: 'photos/6.png' },
    { label: 'Najdražji', href: 'index.html?sort=price_desc', image: 'photos/asics4.png' },
    { label: 'Odpri trgovino', href: 'index.html', cta: true }
  ];
  const dropdown = createUnifiedDropdown('Trgovina', items);
  dropdown.classList.add('nav-dropdown-brutal');
  return dropdown;
}

middleContainer.appendChild(createShopDropdown());

const rightContainer = document.createElement('div');
rightContainer.className = 'app-nav-right';

const buttonContainer = document.createElement('div');
buttonContainer.className = 'nav-actions';

// Ustvari akcijski gumb v navbarju.
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

const adminMenuWrap = document.createElement('div');
adminMenuWrap.className = 'admin-menu-wrap';
adminMenuWrap.style.display = 'none';

const adminMenuBtn = document.createElement('button');
adminMenuBtn.type = 'button';
adminMenuBtn.className = 'nav-btn nav-btn-accent admin-nav-trigger';
adminMenuBtn.textContent = 'Admin';

const adminMenu = document.createElement('div');
adminMenu.className = 'admin-menu';
adminMenu.innerHTML = `
  <button type="button" class="admin-menu-item" data-href="admin.html">Nadzorna plosca</button>
  <button type="button" class="admin-menu-item" data-href="admin-upload.html">Upload izdelkov</button>
  <button type="button" class="admin-menu-item" data-href="admin.html#orders">Narocila</button>
`;

let adminMenuOpen = false;
let adminMenuCloseTimer = null;

// Odpre ali zapre admin meni.
function setAdminMenuOpen(nextOpen) {
  adminMenuOpen = Boolean(nextOpen);
  adminMenuWrap.classList.toggle('open', adminMenuOpen);
}

// Z zamikom zapre admin meni.
function scheduleAdminMenuClose() {
  if (adminMenuCloseTimer) clearTimeout(adminMenuCloseTimer);
  adminMenuCloseTimer = setTimeout(() => setAdminMenuOpen(false), 120);
}

adminMenuWrap.addEventListener('mouseenter', () => {
  if (adminMenuCloseTimer) clearTimeout(adminMenuCloseTimer);
  setAdminMenuOpen(true);
});
adminMenuWrap.addEventListener('mouseleave', scheduleAdminMenuClose);
adminMenuWrap.addEventListener('focusin', () => setAdminMenuOpen(true));
adminMenuWrap.addEventListener('focusout', (event) => {
  if (!adminMenuWrap.contains(event.relatedTarget)) scheduleAdminMenuClose();
});
adminMenuBtn.addEventListener('click', () => {
  setAdminMenuOpen(!adminMenuOpen);
});
adminMenu.querySelectorAll('.admin-menu-item[data-href]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const href = String(btn.dataset.href || '').trim();
    if (!href) return;
    window.location.href = href;
  });
});
document.addEventListener('click', (event) => {
  if (!adminMenuWrap.contains(event.target)) setAdminMenuOpen(false);
});

adminMenuWrap.appendChild(adminMenuBtn);
adminMenuWrap.appendChild(adminMenu);

const accountWrap = document.createElement('div');
accountWrap.className = 'account-menu-wrap';
accountWrap.style.display = 'none';

const accountBtn = document.createElement('button');
accountBtn.type = 'button';
accountBtn.className = 'account-avatar-btn account-settings-btn no-avatar';
accountBtn.setAttribute('aria-label', 'Nastavitve racuna');
accountBtn.innerHTML = '';

const accountMenu = document.createElement('div');
accountMenu.className = 'account-menu';
accountMenu.innerHTML = `
  <div class="account-menu-head">
    <p class="account-name" id="account-menu-name">Uporabnik</p>
    <p class="account-email" id="account-menu-email">-</p>
  </div>
  <a class="account-menu-item" href="profile.html">Moj profil</a>
  <a class="account-menu-item" href="my-orders.html">Moja narocila</a>
  <button type="button" class="account-menu-item is-danger" id="account-menu-logout">Odjava</button>
`;

let accountMenuOpen = false;
let accountCloseTimer = null;
const accountMenuName = accountMenu.querySelector('#account-menu-name');
const accountMenuEmail = accountMenu.querySelector('#account-menu-email');

// Odpre ali zapre account meni.
function setAccountMenuOpen(nextOpen) {
  accountMenuOpen = Boolean(nextOpen);
  accountWrap.classList.toggle('open', accountMenuOpen);
}

// Z zamikom zapre account meni.
function scheduleAccountMenuClose() {
  if (accountCloseTimer) clearTimeout(accountCloseTimer);
  accountCloseTimer = setTimeout(() => setAccountMenuOpen(false), 120);
}

accountWrap.addEventListener('mouseenter', () => {
  if (accountCloseTimer) clearTimeout(accountCloseTimer);
  setAccountMenuOpen(true);
});
accountWrap.addEventListener('mouseleave', scheduleAccountMenuClose);
accountWrap.addEventListener('focusin', () => setAccountMenuOpen(true));
accountWrap.addEventListener('focusout', (event) => {
  if (!accountWrap.contains(event.relatedTarget)) scheduleAccountMenuClose();
});
document.addEventListener('click', (event) => {
  if (!accountWrap.contains(event.target)) setAccountMenuOpen(false);
});

// Nastavi avatar v account meniju.
function setAccountAvatar(user) {
  const avatar = String(user?.avatar || '').trim();
  if (accountMenuName) accountMenuName.textContent = String(user?.username || 'Uporabnik');
  if (accountMenuEmail) accountMenuEmail.textContent = String(user?.email || '-');
  if (avatar) {
    accountBtn.innerHTML = `<img class="account-avatar-img" src="${avatar}" alt="Avatar">`;
    accountBtn.classList.remove('no-avatar');
    return;
  }
  accountBtn.innerHTML = '';
  accountBtn.classList.add('no-avatar');
}

accountBtn.addEventListener('click', () => {
  setAccountMenuOpen(!accountMenuOpen);
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
accountWrap.appendChild(accountMenu);

const accountMenuLogoutBtn = accountMenu.querySelector('#account-menu-logout');
if (accountMenuLogoutBtn) {
  accountMenuLogoutBtn.addEventListener('click', () => logout());
}

// Hamburger gumb za mobilni meni (skrit na namizju prek CSS).
const navToggle = document.createElement('button');
navToggle.type = 'button';
navToggle.className = 'nav-hamburger';
navToggle.setAttribute('aria-label', 'Meni');
navToggle.innerHTML = '<span></span><span></span><span></span>';
navToggle.addEventListener('click', () => navBar.classList.toggle('nav-mobile-open'));
rightContainer.appendChild(navToggle);

rightContainer.appendChild(buttonContainer);
rightContainer.appendChild(adminMenuWrap);
rightContainer.appendChild(cartWrap);
rightContainer.appendChild(accountWrap);

navBar.appendChild(middleContainer);
navBar.appendChild(rightContainer);

document.body.prepend(navBar);
document.body.classList.add('has-nav');
ensureBrandingMeta();
syncNavOffset();
let _resizeTimer = null;
window.addEventListener('resize', () => {
  if (_resizeTimer) return;
  _resizeTimer = requestAnimationFrame(() => { syncNavOffset(); _resizeTimer = null; });
}, { passive: true });

// Animira navbar ob scrollanju: skrije se pri pomiku navzdol, prikaže pri navzgor.
function initNavbarScroll() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let lastY = 0;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY || 0;
      navBar.classList.toggle('is-scrolled', y > 60);
      if (y > lastY + 8 && y > 100) navBar.classList.add('is-hidden-nav');
      else if (y < lastY - 5) navBar.classList.remove('is-hidden-nav');
      lastY = y;
      ticking = false;
    });
  }, { passive: true });
}
initNavbarScroll();

const currentPath = String(window.location.pathname || '').toLowerCase();
const isAuthPage = currentPath.endsWith('/prijava.html')
  || currentPath.endsWith('/registracija.html')
  || currentPath.endsWith('/forgot-password.html')
  || currentPath.endsWith('/reset-password.html')
  || currentPath === '/prijava.html'
  || currentPath === '/registracija.html'
  || currentPath === '/forgot-password.html'
  || currentPath === '/reset-password.html';

// Doda globalni footer, če ga še ni.
function ensureGlobalFooter() {
  document.body.classList.add('has-global-footer');
  if (!document.querySelector('.global-footer-spacer')) {
    const spacer = document.createElement('div');
    spacer.className = 'global-footer-spacer';
    document.body.appendChild(spacer);
  }
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

if (!isAuthPage) {
  ensureGlobalFooter();
} else {
  document.body.classList.remove('has-global-footer');
  const existingSpacer = document.querySelector('.global-footer-spacer');
  if (existingSpacer) existingSpacer.remove();
  const existingFooter = document.querySelector('footer.site-footer');
  if (existingFooter) existingFooter.remove();
}

// ===== SESSION & CART SYNC =====

// Globalno shrani stanje prijave — addToCart ga prebere brez dodatnega API klica.
let _zoSessionUser = null;
window._zoSessionUser = null;
let _cartSyncTimer = null;

// Shrani košarico na strežnik (debounced, samo za prijavljene).
function _scheduleCartSync() {
  if (!_zoSessionUser) return;
  if (_cartSyncTimer) clearTimeout(_cartSyncTimer);
  _cartSyncTimer = setTimeout(() => {
    const items = _getCart();
    fetch('/api/cart/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ items }),
    }).catch(() => {});
  }, 600);
}

// Naloži košarico s strežnika in jo shrani v localStorage.
async function _loadServerCart() {
  try {
    const res = await fetch('/api/cart', { credentials: 'same-origin' });
    if (!res.ok) return;
    const serverItems = await res.json();
    if (!Array.isArray(serverItems) || !serverItems.length) return;
    const local = _getCart();
    // Združi: server je avtoritativen, lokalne postavke dodaj le če jih na strežniku ni.
    const merged = [...serverItems];
    local.forEach((localItem) => {
      const key = `${localItem.productId}__${localItem.size}`;
      const exists = merged.some((s) => `${s.productId}__${s.size}` === key);
      if (!exists) merged.push(localItem);
    });
    _saveCart(merged);
    osveziSteviloVKosarici();
    // Obvesti odprto stran košarice, da se ponovno izriše (race: stran se
    // izriše prej, kot strežniška košarica prispe v localStorage).
    window.dispatchEvent(new Event('cart:updated'));
  } catch (_e) {}
}

if (!isAuthPage) {
  fetch('/api/user')
    .then((res) => res.json())
    .then((data) => {
      _zoSessionUser = data.user || null;
      // Izpostavi na window: 'let' globala ni dostopna kot window._zoSessionUser,
      // druge strani (npr. košarica) jo berejo prek window.
      window._zoSessionUser = _zoSessionUser;
      if (!data.user) return;
      loginButton.style.display = 'none';
      registerButton.style.display = 'none';
      themeButton.style.display = 'inline-block';
      accountWrap.style.display = 'block';
      cartIconBtn.style.display = 'grid';
      setAccountAvatar(data.user);
      if (data.user.role === 'admin') {
        adminButton.style.display = 'none';
        adminMenuWrap.style.display = 'block';
      }
      syncNavOffset();
      _loadServerCart();
    })
    .catch(() => { syncNavOffset(); });
}

// ===== AUTH =====

// Pošlje registracijo uporabnika.
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

// Pošlje prijavo uporabnika.
async function login(event) {
  event.preventDefault();

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  const res = await fetch('/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  if (res.ok) {
    window.location.href = 'home.html';
    return;
  }

  const msg = await res.text();
  showToast(msg || 'Prijava ni uspela.', 'error');
}

// Odjavi trenutnega uporabnika.
async function logout() {
  const res = await fetch('/logout');
  if (res.redirected) {
    window.location.href = res.url;
  } else {
    window.location.href = '/prijava.html';
  }
}

// Preveri trenutno prijavo uporabnika.
async function checkAuth() {
  const res = await fetch('/api/user');
  const data = await res.json();
  if (!data.user) {
    window.location.href = '/prijava.html';
  }
}

// ===== CART =====

// In-memory cart cache — izogni se ponavljajočemu localStorage.getItem+parse.
let _cartCache = null;
function _getCart() { return _cartCache || (_cartCache = JSON.parse(localStorage.getItem('kosarica') || '[]')); }
function _saveCart(cart) { _cartCache = cart; localStorage.setItem('kosarica', JSON.stringify(cart)); }

// Doda izdelek v košarico.
async function addToCart(ime, cena, size = '', productId = '', oldCena = 0, hasDiscount = false, image = '') {
  const keepY = window.scrollY || 0;
  const restoreScroll = () => requestAnimationFrame(() => window.scrollTo({ top: keepY, left: 0, behavior: 'auto' }));
  try {
    // Uporabi cached session — brez dodatnega /api/user klica.
    if (!_zoSessionUser) {
      showToast('Najprej se morate prijaviti, da lahko dodate izdelek v kosarico.', 'error');
      return;
    }

    const kosarica = _getCart();
    const safeSize = String(size || 'Univerzalno');
    const safeProductId = String(productId || '').trim();
    const normalizedSafeSize = safeSize.replace(',', '.');
    const existingIndex = kosarica.findIndex((item) => (
      String(item?.productId || '') === safeProductId
      && String(item?.size || 'Univerzalno').replace(',', '.') === normalizedSafeSize
    ));
    const currentQty = existingIndex >= 0 ? Math.max(1, Math.floor(Number(kosarica[existingIndex]?.kolicina || 1))) : 0;

    if (safeProductId) {
      const productRes = await fetch(`/api/products/${encodeURIComponent(safeProductId)}`, { credentials: 'same-origin' });
      if (productRes.ok) {
        const product = await productRes.json().catch(() => ({}));
        const rawSizeStock = (product && typeof product.sizeStock === 'object') ? product.sizeStock : null;
        const normalizedSize = safeSize.replace(',', '.');
        let maxStock = Number(product?.stock || 0);
        if (rawSizeStock) {
          const direct = Number(rawSizeStock[normalizedSize]);
          const alt = Number(rawSizeStock[normalizedSize.replace('.', ',')]);
          if (Number.isFinite(direct)) maxStock = direct;
          else if (Number.isFinite(alt)) maxStock = alt;
        }
        if (currentQty >= Math.max(0, Math.floor(maxStock))) {
          showToast('Ni več zaloge za izbrano številko.', 'error');
          return;
        }
      }
    }

    if (existingIndex >= 0) {
      kosarica[existingIndex] = { ...kosarica[existingIndex], cena, oldCena: Number(oldCena) || 0, hasDiscount: !!hasDiscount, image: String(image || 'photos/1.png'), kolicina: Math.max(1, Math.floor(Number(kosarica[existingIndex].kolicina || 1) + 1)) };
    } else {
      kosarica.push({ ime, cena, oldCena: Number(oldCena) || 0, hasDiscount: !!hasDiscount, image: String(image || 'photos/1.png'), size: safeSize, productId: safeProductId, kolicina: 1 });
    }
    _saveCart(kosarica);
    window.dispatchEvent(new Event('cart:updated'));
    osveziSteviloVKosarici();
    _scheduleCartSync();
    trackFunnel('add_to_cart', {
      productId: safeProductId,
      name: String(ime || ''),
      size: safeSize,
      qty: 1
    });
    showToast('Izdelek je dodan v kosarico.', 'success');
    restoreScroll();
  } catch (_err) {
    showToast('Napaka pri dodajanju v kosarico.', 'error');
    restoreScroll();
  }
}

// Odstrani izdelek iz košarice.
function removeFromCart(index) {
  const kosarica = _getCart();
  if (index >= 0 && index < kosarica.length) {
    kosarica.splice(index, 1);
    _saveCart(kosarica);
    window.dispatchEvent(new Event('cart:updated'));
    _scheduleCartSync();
    showToast('Izdelek je bil odstranjen iz kosarice.', 'info');
    location.reload();
  }
}

// Cached cart UI references.
let _cartCount = null, _previewList = null, _previewTotal = null;
let _cartRafPending = false;

// Osveži števec izdelkov v košarici — throttled z rAF.
function osveziSteviloVKosarici() {
  if (_cartRafPending) return;
  _cartRafPending = true;
  requestAnimationFrame(() => {
    _cartRafPending = false;
    _renderCartUI();
  });
}

function _renderCartUI() {
  const kosarica = _getCart();
  const safeItems = Array.isArray(kosarica) ? kosarica : [];

  if (!_cartCount) _cartCount = document.getElementById('cart-count');
  if (!_previewList) _previewList = document.getElementById('nav-cart-preview-list');
  if (!_previewTotal) _previewTotal = document.getElementById('nav-cart-preview-total');

  const totalQty = safeItems.reduce((acc, item) => acc + Math.max(1, Math.floor(Number(item?.kolicina || 1))), 0);

  if (_cartCount) {
    if (totalQty > 0) { _cartCount.textContent = String(totalQty); _cartCount.style.display = 'inline-flex'; }
    else _cartCount.style.display = 'none';
  }

  if (_previewList) {
    if (!safeItems.length) {
      _previewList.innerHTML = '<p class="nav-cart-preview-empty">Kosarica je prazna.</p>';
    } else {
      const topItems = safeItems.slice(0, 4);
      const html = topItems.map((item, index) => {
        const name = String(item?.ime || 'Izdelek');
        const image = String(item?.image || 'photos/1.png');
        const qty = Math.max(1, Math.floor(Number(item?.kolicina || 1)));
        const price = Number(item?.cena || 0);
        const line = (Number.isFinite(price) ? price : 0) * qty;
        return `<div class="nav-cart-preview-item"><img src="${image}" alt="${name}"><div><p>${name}</p><small>${qty}x - ${line.toFixed(2)} EUR</small><div class="nav-cart-preview-actions"><button type="button" class="nav-cart-preview-btn" data-cart-action="minus" data-cart-index="${index}" aria-label="Zmanjšaj količino">-</button><button type="button" class="nav-cart-preview-btn" data-cart-action="plus" data-cart-index="${index}" aria-label="Povečaj količino">+</button><button type="button" class="nav-cart-preview-btn is-danger" data-cart-action="remove" data-cart-index="${index}" aria-label="Odstrani izdelek">x</button></div></div></div>`;
      }).join('');
      if (_previewList.innerHTML !== html) _previewList.innerHTML = html;
    }
  }

  if (_previewTotal) {
    const totalPrice = safeItems.reduce((acc, item) => {
      const qty = Math.max(1, Math.floor(Number(item?.kolicina || 1)));
      const price = Number(item?.cena || 0);
      return acc + ((Number.isFinite(price) ? price : 0) * qty);
    }, 0);
    const text = `Skupaj: ${totalPrice.toFixed(2)} EUR`;
    if (_previewTotal.textContent !== text) _previewTotal.textContent = text;
  }
}

// Vrne največjo dovoljeno količino za isto vrstico v košarici.
async function getMaxQtyForCartLine(cart, index) {
  const safeIndex = Number(index);
  if (!Array.isArray(cart) || safeIndex < 0 || safeIndex >= cart.length) return Number.POSITIVE_INFINITY;
  const line = cart[safeIndex] || {};
  const productId = String(line?.productId || '').trim();
  const size = String(line?.size || '').trim();
  if (!productId) return Number.POSITIVE_INFINITY;

  try {
    const res = await fetch(`/api/products/${encodeURIComponent(productId)}`, { credentials: 'same-origin' });
    if (!res.ok) return Number.POSITIVE_INFINITY;
    const product = await res.json().catch(() => null);
    if (!product) return Number.POSITIVE_INFINITY;

    const raw = (product && typeof product.sizeStock === 'object') ? product.sizeStock : null;
    const normalized = size.replace(',', '.');
    let maxStock = Number(product?.stock || 0);
    if (raw) {
      const direct = Number(raw[normalized]);
      const alt = Number(raw[normalized.replace('.', ',')]);
      if (Number.isFinite(direct)) maxStock = direct;
      else if (Number.isFinite(alt)) maxStock = alt;
    }
    return Number.isFinite(maxStock) ? Math.max(0, Math.floor(maxStock)) : Number.POSITIVE_INFINITY;
  } catch (_err) {
    return Number.POSITIVE_INFINITY;
  }
}

// Posodobi vrstico v predogledu košarice.
const previewCartLineLocks = new Set();

// Posodobi vrstico v predogledu košarice.
async function updatePreviewCartItem(index, action) {
  const safeIndex = Number(index);
  if (!Number.isInteger(safeIndex) || safeIndex < 0) return;
  const lockKey = String(safeIndex);
  if (previewCartLineLocks.has(lockKey)) return;
  previewCartLineLocks.add(lockKey);

  try {
    const cart = _getCart();
    if (!Array.isArray(cart) || safeIndex >= cart.length) return;

    const current = Math.max(1, Math.floor(Number(cart[safeIndex]?.kolicina || 1)));
    if (action === 'remove') {
      cart.splice(safeIndex, 1);
    } else if (action === 'minus') {
      const next = current - 1;
      if (next <= 0) cart.splice(safeIndex, 1);
      else cart[safeIndex].kolicina = next;
    } else if (action === 'plus') {
      const maxStock = await getMaxQtyForCartLine(cart, safeIndex);
      if (!Number.isFinite(maxStock)) {
        showToast('Zaloge trenutno ni mogoče preveriti.', 'error');
        return;
      }
      const line = cart[safeIndex] || {};
      const productId = String(line?.productId || '').trim();
      const size = String(line?.size || '').trim();
      const normalizedSize = size.replace(',', '.');
      const sameLineQty = cart.reduce((acc, row) => {
        const sameProduct = String(row?.productId || '').trim() === productId;
        const rowSize = String(row?.size || '').trim().replace(',', '.');
        const sameSize = rowSize === normalizedSize;
        if (!sameProduct || !sameSize) return acc;
        return acc + Math.max(1, Math.floor(Number(row?.kolicina || 1)));
      }, 0);
      if (sameLineQty >= maxStock) {
        showToast('Ni več zaloge za izbrano številko.', 'error');
        return;
      }
      cart[safeIndex].kolicina = current + 1;
    } else {
      return;
    }

    _saveCart(cart);
    window.dispatchEvent(new Event('cart:updated'));
    osveziSteviloVKosarici();
    _scheduleCartSync();
  } finally {
    previewCartLineLocks.delete(lockKey);
  }
}

document.addEventListener('DOMContentLoaded', osveziSteviloVKosarici);
window.addEventListener('storage', (e) => {
  if (e.key === 'kosarica') { _cartCache = null; osveziSteviloVKosarici(); }
});
document.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-cart-action][data-cart-index]');
  if (!btn) return;
  event.preventDefault();
  event.stopPropagation();
  updatePreviewCartItem(btn.dataset.cartIndex, btn.dataset.cartAction);
});

// Prepreči premik fokusa/scroll skoke pri hitrem klikanju +/- v mini košarici.
document.addEventListener('mousedown', (event) => {
  const btn = event.target.closest('[data-cart-action][data-cart-index]');
  if (!btn) return;
  event.preventDefault();
  event.stopPropagation();
});
document.addEventListener('DOMContentLoaded', initTheme);

// ===== SHARED HELPER =====
// Izvede povratni klic po dveh animacijskih okvirjih.
function nextFrame(cb) {
  requestAnimationFrame(() => requestAnimationFrame(cb));
}

// ===== COOKIE CONSENT =====
// Prikaže pasico za soglasje s piškotki, če uporabnik še ni potrdil.
function initCookieConsent() {
  if (isAuthPage || sessionStorage.getItem('dc-cookie-consent')) return;
  const banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.innerHTML = `
    <p>Ta stran uporablja piškotke za delovanje seje in shranjevanje košarice. Z nadaljevanjem uporabe se strinjaš z njihovo rabo.</p>
    <button type="button" class="cookie-btn-accept">Sprejmi</button>
  `;
  document.body.appendChild(banner);
  nextFrame(() => banner.classList.add('is-visible'));
  banner.querySelector('.cookie-btn-accept').addEventListener('click', () => {
    sessionStorage.setItem('dc-cookie-consent', '1');
    banner.classList.remove('is-visible');
    setTimeout(() => banner.remove(), 440);
  });
}

// ===== SIZE GUIDE =====
const SIZE_GUIDE_ROWS = [
  ['36', '4',    '5.5', '3',    '22.5'],
  ['37', '4.5',  '6',   '3.5',  '23'],
  ['38', '5.5',  '7',   '4.5',  '24'],
  ['39', '6',    '7.5', '5',    '24.5'],
  ['40', '7',    '8.5', '6',    '25'],
  ['41', '7.5',  '9',   '6.5',  '25.5'],
  ['42', '8.5',  '10',  '7.5',  '26.5'],
  ['43', '9.5',  '11',  '8.5',  '27.5'],
  ['44', '10',   '11.5','9',    '28'],
  ['45', '11',   '12.5','10',   '29'],
  ['46', '12',   '13.5','11',   '30'],
  ['47', '12.5', '14',  '11.5', '30.5'],
  ['48', '13',   '14.5','12',   '31'],
];

// Prikaže prekrivno okno z vodnikom za velikosti čevljev.
function showSizeGuide() {
  let overlay = document.getElementById('size-guide-overlay');
  if (overlay) {
    overlay.classList.add('is-open');
    return;
  }
  overlay = document.createElement('div');
  overlay.id = 'size-guide-overlay';
  overlay.className = 'size-guide-overlay';
  const rows = SIZE_GUIDE_ROWS.map(([eu, usM, usW, uk, cm]) => `
    <tr><td><strong>${eu}</strong></td><td>${usM}</td><td>${usW}</td><td>${uk}</td><td>${cm}</td></tr>
  `).join('');
  overlay.innerHTML = `
    <div class="size-guide-modal" role="dialog" aria-modal="true" aria-label="Vodič za velikosti">
      <button class="size-guide-close" aria-label="Zapri">&#10005;</button>
      <h2>Vodič za velikosti</h2>
      <p class="sg-subtitle">Primerjava EU, US in UK velikosti čevljev</p>
      <table class="size-guide-table">
        <thead><tr><th>EU</th><th>US Moški</th><th>US Ženski</th><th>UK</th><th>CM</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="sg-tip">Nasvet: izmeri stopalo zjutraj. Izmeri od pete do konice najdaljšega prsta in primerjaj z vrednostmi v stolpcu CM.</p>
    </div>
  `;
  document.body.appendChild(overlay);
  nextFrame(() => overlay.classList.add('is-open'));

  let onEsc;
  // Zapre prekrivno okno vodiča za velikosti.
  function closeSizeGuide() {
    overlay.classList.remove('is-open');
    document.removeEventListener('keydown', onEsc);
  }
  onEsc = (e) => { if (e.key === 'Escape') closeSizeGuide(); };

  overlay.querySelector('.size-guide-close').addEventListener('click', closeSizeGuide);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSizeGuide(); });
  document.addEventListener('keydown', onEsc);
}
// Exposed globally so HTML onclick="showSizeGuide()" works from any page
window.showSizeGuide = showSizeGuide;

// ===== SCROLL REVEAL =====
// Postopoma razkrije elemente z razredom scroll-reveal, ko postanejo vidni.
function initScrollReveal() {
  const targets = document.querySelectorAll('.scroll-reveal');
  if (!targets.length) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.1 });
  targets.forEach((el) => observer.observe(el));
}

// Staggered fade-up reveal za produkt kartice z IntersectionObserver.
function initCardReveal(container) {
  const root = container || document;
  const cards = root.querySelectorAll('.product:not(.is-entering)');
  if (!cards.length) return;
  const seen = new WeakSet();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || seen.has(entry.target)) return;
      seen.add(entry.target);
      entry.target.classList.add('is-entering');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.04, rootMargin: '0px 0px 60px 0px' });
  cards.forEach((card) => observer.observe(card));
}
window.initCardReveal = initCardReveal;

// Nastavi animacijo prehoda med stranmi (fade + slide).
function initPageTransitions() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;
    const href = String(link.getAttribute('href') || '');
    if (!href || href.startsWith('#') || href.startsWith('javascript') || link.target === '_blank' || link.hasAttribute('download')) return;
    if (href.startsWith('http') && !href.includes(window.location.hostname)) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    document.body.classList.add('is-navigating');
    setTimeout(() => { window.location.href = href; }, 185);
  });
}

// Vstavi plavajočo delce v hero sekcijo.
function initHeroParticles() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const hero = document.querySelector('.shop-hero-pro');
  if (!hero) return;
  const PARTICLES = [
    { x: 8, y: 20, size: 10, dur: 9, del: 0 },
    { x: 22, y: 65, size: 7, dur: 11, del: 1.2 },
    { x: 38, y: 12, size: 14, dur: 8, del: 0.6 },
    { x: 55, y: 78, size: 9, dur: 13, del: 2.1 },
    { x: 72, y: 35, size: 6, dur: 10, del: 0.9 },
    { x: 84, y: 60, size: 12, dur: 7, del: 1.7 },
    { x: 15, y: 88, size: 8, dur: 12, del: 3.0 },
    { x: 62, y: 15, size: 11, dur: 9.5, del: 0.3 },
    { x: 90, y: 80, size: 7, dur: 14, del: 1.5 },
    { x: 47, y: 50, size: 5, dur: 8.5, del: 2.8 },
    { x: 30, y: 40, size: 13, dur: 11.5, del: 0.4 },
    { x: 78, y: 90, size: 6, dur: 10.5, del: 2.3 },
  ];
  PARTICLES.forEach(({ x, y, size, dur, del }) => {
    const span = document.createElement('span');
    span.className = 'hero-particle';
    span.style.cssText = `--px:${x}%;--py:${y}%;--psize:${size}px;--pdur:${dur}s;--pdel:-${del}s;`;
    hero.appendChild(span);
  });
}

// Typewriter efekt za hero naslov.
function initHeroTypewriter() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const el = document.getElementById('hero-title');
  if (!el) return;
  const text = el.textContent || '';
  el.textContent = '';
  el.style.borderRight = '2px solid #2a63ff';
  el.style.paddingRight = '2px';
  let i = 0;
  const tick = setInterval(() => {
    el.textContent = text.slice(0, ++i);
    if (i >= text.length) {
      clearInterval(tick);
      setTimeout(() => { el.style.borderRight = 'none'; el.style.paddingRight = ''; }, 900);
    }
  }, 55);
}

// Animira število od 0 do ciljne vrednosti z easing funkcijo.
function animateCountUp(el, target, suffix, duration) {
  if (!el) return;
  if (el.dataset.counted) { el.textContent = `${target}${suffix || ''}`; return; }
  el.dataset.counted = '1';
  const start = performance.now();
  const dur = duration || 900;
  function step(now) {
    const p = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = `${Math.round(eased * target)}${suffix || ''}`;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
window.animateCountUp = animateCountUp;

// Parallax efekt na hero bestseller sliki ob scrollu.
function initHeroParallax() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const img = document.getElementById('shop-hero-bestseller-image');
  if (!img) return;
  img.style.willChange = 'transform';
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      img.style.transform = `translateY(${(window.scrollY || 0) * 0.08}px)`;
      ticking = false;
    });
  }, { passive: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { initCookieConsent(); initScrollReveal(); initPageTransitions(); initHeroParticles(); initHeroTypewriter(); initHeroParallax(); }, { once: true });
} else {
  initCookieConsent();
  initScrollReveal();
  initPageTransitions();
  initHeroParticles();
  initHeroTypewriter();
  initHeroParallax();
}

// ===== SHARED GLOBALS za vse HTML strani =====
// Omogoča HTML datotekam dostop brez ponovnega definiranja.

window.escapeHtml = function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

window.formatPrice = function formatPrice(v) {
  return Number(v || 0).toFixed(2);
};

window.getDisplayPrices = function getDisplayPrices(product) {
  const price = Number(product?.price);
  const oldPrice = Number(product?.oldPrice);
  if (Number.isFinite(price) && Number.isFinite(oldPrice) && oldPrice > 0 && price > 0) {
    const regular = Math.max(price, oldPrice);
    const discounted = Math.min(price, oldPrice);
    return { regular, discounted, hasDiscount: regular > discounted };
  }
  return { regular: Number.isFinite(price) ? price : 0, discounted: Number.isFinite(price) ? price : 0, hasDiscount: false };
};

window.isOldPriceVisible = function isOldPriceVisible(product) {
  const pricing = window.getDisplayPrices(product);
  if (!pricing.hasDiscount) return false;
  const until = new Date(product?.oldPriceVisibleUntil || product?.discountUntil || '').getTime();
  return Number.isFinite(until) && until > Date.now();
};

// Paralelen fetch za vec URL-jev hkrati.
window.fetchAll = function fetchAll(urls, opts = {}) {
  return Promise.all(urls.map((url) => fetch(url, { credentials: 'same-origin', ...opts }).then((r) => r.ok ? r.json().catch(() => null) : null)));
};
