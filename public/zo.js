//(Navbar)
const navBar = document.createElement('div');
navBar.style.display = 'flex';
navBar.style.justifyContent = 'space-between';
navBar.style.alignItems = 'center';
navBar.style.padding = '10px 0px';
navBar.style.backgroundColor = '#333';
navBar.style.color = 'white';
navBar.style.position = 'fixed';
navBar.style.top = '0';
navBar.style.width = '100%';
navBar.style.zIndex = '1000';

const logo = document.createElement('img');
logo.src = 'photos/logo.jpg';
logo.height = 50;
logo.width = 50;
logo.style.cursor = 'pointer';
logo.addEventListener('click', () => {
  window.location.href = 'index.html';
});
navBar.appendChild(logo);

const buttonContainer = document.createElement('div');

const loginButton = document.createElement('button');
loginButton.textContent = 'Login';
loginButton.style.marginRight = '10px';
loginButton.style.padding = '8px 15px';
loginButton.style.cursor = 'pointer';
loginButton.style.border = 'none';
loginButton.style.borderRadius = '5px';
loginButton.style.backgroundColor = '#555';
loginButton.style.color = 'white';
loginButton.addEventListener('click', () => {
  window.location.href = 'prijava.html';
});
buttonContainer.appendChild(loginButton);

const registerButton = document.createElement('button');
registerButton.textContent = 'Register';
registerButton.style.padding = '8px 15px';
registerButton.style.margin = '8px';
registerButton.style.cursor = 'pointer';
registerButton.style.border = 'none';
registerButton.style.borderRadius = '5px';
registerButton.style.backgroundColor = '#007BFF';
registerButton.style.color = 'white';
registerButton.addEventListener('click', () => {
  window.location.href = 'registracija.html';
});
buttonContainer.appendChild(registerButton);

const userInfo = document.createElement('span');
userInfo.style.marginLeft = '10px';
userInfo.style.color = 'white';

navBar.appendChild(buttonContainer);
navBar.appendChild(userInfo);
document.body.prepend(navBar);
document.body.style.marginTop = '70px'; 

// preveri prijavo
if (!window.location.pathname.includes('registracija.html') && !window.location.pathname.includes('prijava.html')) {
  fetch('/api/user')
    .then(res => res.json())
    .then(data => {
      if (data.user) {
        loginButton.style.display = 'none';
        registerButton.style.display = 'none';
        userInfo.textContent = 'Prijavljen:' + data.user.username;
        document.getElementById('kosarica-gumb').style.display = 'inline-block';

        //klepet
        const chatButton = document.createElement('button');
        chatButton.textContent = 'Klepet';
        chatButton.style.padding = '8px 15px';
        chatButton.style.margin = '8px';
        chatButton.style.cursor = 'pointer';
        chatButton.style.border = 'none';
        chatButton.style.position = 'center';
        chatButton.style.borderRadius = '5px';
        chatButton.style.backgroundColor = '#007BFF';
        chatButton.style.color = 'white';
        chatButton.style.display = 'inline-block';
        chatButton.addEventListener('click', () => {
          window.location.href = 'chat.html';
        });
        buttonContainer.appendChild(chatButton);

        //odjava
        const logoutButton = document.createElement('button');
        logoutButton.textContent = 'Odjava';
        logoutButton.style.padding = '8px 15px';
        logoutButton.style.margin = '8px';
        logoutButton.style.cursor = 'pointer';
        logoutButton.style.border = 'none';
        logoutButton.style.borderRadius = '5px';
        logoutButton.style.backgroundColor = '#FF4136';
        logoutButton.style.color = 'white';
        logoutButton.addEventListener('click', logout);

        buttonContainer.appendChild(logoutButton);
      }
    });
}


// FUNKCIJA ZA REGISTRACIJO
async function register(event) {
  event.preventDefault();

  const username = document.getElementById('username').value;
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (password.length < 7) {
    alert('Geslo mora imeti vsaj 7 znakov.');
    return;
  }
  if (password !== confirmPassword) {
    alert('Gesli se ne ujemata!');
    return;
  }

  const res = await fetch('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password })
  });

  const data = await res.text();
 // alert(data);

  if (res.ok) {
    window.location.href = 'prijava.html';
  }
}

// FUNKCIJA ZA PRIJAVO
async function login(event) {
  event.preventDefault();

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  const res = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  const data = await res.text();
  //alert(data);

  if (res.ok) {
    window.location.href = 'index.html';
  }
}

// ✅ FUNKCIJA ZA ODJAVO
async function logout() {
  const res = await fetch('/logout');
  if (res.redirected) {
    window.location.href = res.url;
  }
}

// ✅ FUNKCIJA ZA ZAŠČITO STRANI (če uporabnik ni prijavljen)
async function checkAuth() {
  const res = await fetch('/api/user');
  const data = await res.json();
  if (!data.user) {
    window.location.href = '/prijava.html';
  }
}

// Shrani izdelek v localStorage
function addToCart(ime, cena) {
  fetch('/api/user')
    .then(res => res.json())
    .then(data => {
      if (!data.user) {
        alert('❌ Najprej se morate prijaviti, da lahko dodate izdelek v košarico.');
        return;
      }

      // Uporabnik je prijavljen – shrani v košarico
      let kosarica = JSON.parse(localStorage.getItem('kosarica')) || [];
      kosarica.push({ ime, cena });
      localStorage.setItem('kosarica', JSON.stringify(kosarica));
      osveziSteviloVKosarici();
    })
    
}
 
// Funkcija za odstranjevanje izdelka iz košarice
function removeFromCart(index) {
  let kosarica = JSON.parse(localStorage.getItem('kosarica')) || [];

  if (index >= 0 && index < kosarica.length) {
    // Odštej ceno odstranjenega izdelka (če želiš)
    kosarica.splice(index, 1); // Odstrani iz seznama
    localStorage.setItem('kosarica', JSON.stringify(kosarica)); // Shrani novo stanje
    alert("Izdelek je bil odstranjen iz košarice!");
    location.reload(); // Osveži stran, da se prikaz posodobi
  }
}

function osveziSteviloVKosarici() {
  const kosarica = JSON.parse(localStorage.getItem('kosarica')) || [];
  const countSpan = document.getElementById('cart-count');
  if (!countSpan) return;

  if (kosarica.length > 0) {
    countSpan.textContent = kosarica.length;
    countSpan.style.display = 'inline-block';
  } else {
    countSpan.style.display = 'none';
  }
}
 
document.addEventListener("DOMContentLoaded", osveziSteviloVKosarici);

function submitReview(btn) {
  const comment = btn.previousElementSibling.value;
  alert("✅ Hvala za mnenje:\n" + comment);
  btn.previousElementSibling.value = "";
}





