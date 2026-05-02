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
  trigger.textContent = title;

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

function setAdminMenuOpen(nextOpen) {
  adminMenuOpen = Boolean(nextOpen);
  adminMenuWrap.classList.toggle('open', adminMenuOpen);
}

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
window.addEventListener('resize', syncNavOffset);

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

if (!isAuthPage) {
  fetch('/api/user')
    .then((res) => res.json())
    .then((data) => {
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
    })
    .catch(() => {
      // Napake pri preverjanju prijave v navigaciji tukaj varno ignoriramo.
      syncNavOffset();
    });
}

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

// Doda izdelek v košarico.
async function addToCart(ime, cena, size = '', productId = '', oldCena = 0, hasDiscount = false, image = '') {
  const keepX = window.scrollX || window.pageXOffset || 0;
  const keepY = window.scrollY || window.pageYOffset || 0;
  const restoreScroll = () => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: keepY, left: keepX, behavior: 'auto' });
    });
  };
  try {
    const authRes = await fetch('/api/user', { credentials: 'same-origin' });
    const authData = await authRes.json().catch(() => ({}));
    if (!authData.user) {
      showToast('Najprej se morate prijaviti, da lahko dodate izdelek v kosarico.', 'error');
      return;
    }

    const kosarica = JSON.parse(localStorage.getItem('kosarica')) || [];
    const safeSize = String(size || 'Univerzalno');
    const safeProductId = String(productId || '').trim();
    const normalizedSafeSize = safeSize.replace(',', '.');
    const existingIndex = kosarica.findIndex((item) => (
      String(item?.productId || '') === safeProductId
      && String(item?.size || 'Univerzalno').replace(',', '.') === normalizedSafeSize
    ));
    const currentQty = existingIndex >= 0
      ? Math.max(1, Math.floor(Number(kosarica[existingIndex]?.kolicina || 1)))
      : 0;

    if (safeProductId) {
      const productRes = await fetch(`/api/products/${encodeURIComponent(safeProductId)}`, { credentials: 'same-origin' });
      if (productRes.ok) {
        const product = await productRes.json().catch(() => ({}));
        const rawSizeStock = product && typeof product.sizeStock === 'object' && product.sizeStock ? product.sizeStock : null;
        const normalizedSize = safeSize.replace(',', '.');
        let maxStock = Number(product?.stock || 0);
        if (rawSizeStock && normalizedSize) {
          const direct = Number(rawSizeStock[normalizedSize]);
          const alt = Number(rawSizeStock[String(normalizedSize).replace('.', ',')]);
          if (Number.isFinite(direct)) maxStock = direct;
          else if (Number.isFinite(alt)) maxStock = alt;
        }
        maxStock = Number.isFinite(maxStock) ? Math.max(0, Math.floor(maxStock)) : 0;
        if (currentQty >= maxStock) {
          showToast('Ni več zaloge za izbrano številko.', 'error');
          return;
        }
      }
    }

    if (existingIndex >= 0) {
      const nextQty = Math.max(1, Math.floor(Number(kosarica[existingIndex].kolicina || 1) + 1));
      kosarica[existingIndex] = {
        ...kosarica[existingIndex],
        cena,
        oldCena: Number(oldCena) || 0,
        hasDiscount: !!hasDiscount,
        image: String(image || 'photos/1.png'),
        kolicina: nextQty
      };
    } else {
      kosarica.push({
        ime,
        cena,
        oldCena: Number(oldCena) || 0,
        hasDiscount: !!hasDiscount,
        image: String(image || 'photos/1.png'),
        size: safeSize,
        productId: safeProductId,
        kolicina: 1
      });
    }
    localStorage.setItem('kosarica', JSON.stringify(kosarica));
    window.dispatchEvent(new Event('cart:updated'));
    osveziSteviloVKosarici();
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
  const kosarica = JSON.parse(localStorage.getItem('kosarica')) || [];

  if (index >= 0 && index < kosarica.length) {
    kosarica.splice(index, 1);
    localStorage.setItem('kosarica', JSON.stringify(kosarica));
    window.dispatchEvent(new Event('cart:updated'));
    showToast('Izdelek je bil odstranjen iz kosarice.', 'info');
    location.reload();
  }
}

// Osveži števec izdelkov v košarici.
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
      previewList.innerHTML = topItems.map((item, index) => {
        const name = String(item?.ime || 'Izdelek');
        const image = String(item?.image || 'photos/1.png');
        const qty = Math.max(1, Math.floor(Number(item?.kolicina || 1)));
        const price = Number(item?.cena || 0);
        const line = (Number.isFinite(price) ? price : 0) * qty;
        return `
          <div class="nav-cart-preview-item">
            <img src="${image}" alt="${name}">
            <div>
              <p>${name}</p>
              <small>${qty}x - ${line.toFixed(2)} EUR</small>
              <div class="nav-cart-preview-actions">
                <button type="button" class="nav-cart-preview-btn" data-cart-action="minus" data-cart-index="${index}" aria-label="Zmanjšaj količino">-</button>
                <button type="button" class="nav-cart-preview-btn" data-cart-action="plus" data-cart-index="${index}" aria-label="Povečaj količino">+</button>
                <button type="button" class="nav-cart-preview-btn is-danger" data-cart-action="remove" data-cart-index="${index}" aria-label="Odstrani izdelek">x</button>
              </div>
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

// Vrne največjo dovoljeno količino za isto vrstico v košarici.
async function getMaxQtyForCartLine(cart, index) {
  const safeIndex = Number(index);
  if (!Array.isArray(cart) || safeIndex < 0 || safeIndex >= cart.length) return Number.POSITIVE_INFINITY;
  const line = cart[safeIndex] || {};
  const productId = String(line?.productId || '').trim();
  const size = String(line?.size || '').trim();
  const itemName = String(line?.ime || '').trim().toLowerCase();
  if (!productId && !itemName) return Number.POSITIVE_INFINITY;

  try {
    let product = null;
    if (productId) {
      const res = await fetch(`/api/products/${encodeURIComponent(productId)}`, { credentials: 'same-origin' });
      if (res.ok) {
        product = await res.json().catch(() => null);
      }
    }
    if (!product && itemName) {
      const listRes = await fetch('/api/products', { credentials: 'same-origin' });
      if (listRes.ok) {
        const list = await listRes.json().catch(() => []);
        if (Array.isArray(list)) {
          product = list.find((p) => String(p?.name || '').trim().toLowerCase() === itemName) || null;
          if (product && product._id && !productId) {
            cart[safeIndex] = { ...line, productId: String(product._id) };
          }
        }
      }
    }
    if (!product) return Number.POSITIVE_INFINITY;

    const raw = product && typeof product.sizeStock === 'object' && product.sizeStock ? product.sizeStock : null;
    const normalized = String(size || '').replace(',', '.');
    let maxStock = Number(product?.stock || 0);
    if (raw) {
      const direct = Number(raw[normalized]);
      const alt = Number(raw[String(normalized).replace('.', ',')]);
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
    const cart = JSON.parse(localStorage.getItem('kosarica') || '[]');
    if (!Array.isArray(cart)) return;
    if (safeIndex >= cart.length) return;

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

    localStorage.setItem('kosarica', JSON.stringify(cart));
    window.dispatchEvent(new Event('cart:updated'));
    osveziSteviloVKosarici();
  } finally {
    previewCartLineLocks.delete(lockKey);
  }
}

document.addEventListener('DOMContentLoaded', osveziSteviloVKosarici);
window.addEventListener('storage', (e) => {
  if (e.key === 'kosarica') osveziSteviloVKosarici();
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
function nextFrame(cb) {
  requestAnimationFrame(() => requestAnimationFrame(cb));
}

// ===== COOKIE CONSENT =====
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { initCookieConsent(); initScrollReveal(); }, { once: true });
} else {
  initCookieConsent();
  initScrollReveal();
}
