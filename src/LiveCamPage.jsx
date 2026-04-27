import { useEffect, useMemo } from 'react';
import { filmStocks } from './engine/filmProfiles';
import { PROFILE_GROUP_TABS } from './engine/profileCatalog';
import './liveCamPage.css';

const CATEGORY_TABS = [{ id: 'all', label: 'Wszystkie' }, ...PROFILE_GROUP_TABS];

function buildLiveCamMarkup() {
  const categoryButtons = CATEGORY_TABS.map(
    (tab, index) =>
      `<button class="cat-tab${index === 0 ? ' active' : ''} interactive-el" onclick="filterCat('${tab.id}',this)">${tab.label}</button>`
  ).join('');

  return `
<div id="appToast"></div>
<div class="cursor" id="cursor"></div>
<div class="cursor-dot" id="cursorDot"></div>

<div class="scroll-progress" id="scrollProgress"></div>
<button id="scrollBtn" class="scroll-indicator-btn interactive-el" type="button">
  <div class="scroll-indicator__mouse"></div>
  <span id="scrollText" class="scroll-indicator__text">Przewiń</span>
</button>

<nav class="nav" id="mainNav"><div class="nav-inner">
<a class="nav-logo" id="logoBtn"><img src="/logo.png" alt="Mindfullens">Mindfullens</a>
<div class="nav-links" id="navLinks">
  <a href="https://mindfullens.pl/" class="nav-link interactive-el">Strona Główna</a>
  <div class="nav-dropdown" id="toolsDropdown">
    <button class="nav-dropdown-trigger interactive-el" onclick="event.stopPropagation();document.getElementById('toolsDropdown').classList.toggle('open')" type="button">
      Narzędzia <span class="nav-dropdown-arrow">▾</span>
    </button>
    <div class="mega-menu">
      <div class="mega-menu-grid">
        <a href="https://mindfullens.pl/film-lab/" class="mega-item interactive-el"><div class="mega-item-icon">⚗️</div><div class="mega-item-text"><div class="mega-item-name">Film Lab <span class="mega-item-tag mega-item-tag-free">Free</span></div><div class="mega-item-desc">Wgraj zdjęcie i nakładaj symulacje klisz</div></div></a>
        <a href="https://mindfullens.pl/live/" class="mega-item interactive-el" style="background:var(--surface2);border-color:var(--border)"><div class="mega-item-icon">📸</div><div class="mega-item-text"><div class="mega-item-name">Live Cam <span class="mega-item-tag mega-item-tag-free">Free</span></div><div class="mega-item-desc">Testuj profile na żywo kamerą</div></div></a>
        <a href="https://mindfullens.pl/matcher/" class="mega-item interactive-el"><div class="mega-item-icon">🧠</div><div class="mega-item-text"><div class="mega-item-name">AI Matcher <span class="mega-item-tag mega-item-tag-pro">AI</span></div><div class="mega-item-desc">AI dopasuje idealny profil</div></div></a>
        <a href="https://mindfullens.pl/timemachine/" class="mega-item interactive-el"><div class="mega-item-icon">⏳</div><div class="mega-item-text"><div class="mega-item-name">Time Machine <span class="mega-item-tag mega-item-tag-new">Nowe</span></div><div class="mega-item-desc">Symulacja starzenia kliszy</div></div></a>
        <a href="https://mindfullens.pl/ciemnia/" class="mega-item interactive-el"><div class="mega-item-icon">🧪</div><div class="mega-item-text"><div class="mega-item-name">Wirtualna Ciemnia <span class="mega-item-tag mega-item-tag-new">Nowe</span></div><div class="mega-item-desc">Stwórz recepturę filmową od zera</div></div></a>
        <a href="https://mindfullens.pl/blendstudio/" class="mega-item interactive-el"><div class="mega-item-icon">⚗️</div><div class="mega-item-text"><div class="mega-item-name">Blend Studio <span class="mega-item-tag mega-item-tag-new">Nowe</span></div><div class="mega-item-desc">Miksuj dwie klisze w jedno zdjęcie</div></div></a>
        <a href="https://mindfullens.pl/contact-sheet/" class="mega-item interactive-el"><div class="mega-item-icon">🎞️</div><div class="mega-item-text"><div class="mega-item-name">Contact Sheet</div><div class="mega-item-desc">55 profili na jednym arkuszu</div></div></a>
        <a href="https://mindfullens.pl/color-sync/" class="mega-item interactive-el"><div class="mega-item-icon">🔄</div><div class="mega-item-text"><div class="mega-item-name">Color Sync <span class="mega-item-tag mega-item-tag-pro">Pro</span></div><div class="mega-item-desc">Zrównaj kolory z 2-3 aparatów</div></div></a>
      </div>
      <div class="mega-footer"><span class="mega-footer-text">Wszystkie narzędzia w jednym pakiecie</span><a href="https://mindfullens.pl/cennik/" class="mega-footer-btn interactive-el">Complete Studio →</a></div>
    </div>
  </div>
  <a href="https://mindfullens.pl/analog-signature/" class="nav-link nav-link-red interactive-el">Analog Signature</a>
</div>
<div style="display:flex;align-items:center;gap:10px"><button class="nav-mobile-toggle interactive-el" onclick="document.getElementById('navLinks').classList.toggle('active')">☰</button><button class="nav-cta interactive-el" onclick="toggleCart()">Koszyk <span class="cart-count" id="cartCount">0</span></button></div>
</div></nav>

<div class="live-cam-wrapper">
<div class="section-header">
<span class="section-tag">✦ Profile zsynchronizowane z Film Lab</span>
<h1 class="section-title">Mindfullens <em>Live Cam</em></h1>
<p class="section-desc">Te same profile co w Film Lab. Zezwól na aparat i testuj je na żywo w czasie rzeczywistym.</p>
</div>

<div class="workspace">
<div class="permission-screen" id="permScreen">
<h2>Zezwól na aparat</h2>
<p>Edycja odbywa się w 100% na Twoim urządzeniu — nic nie jest wysyłane na serwer.</p>
<button class="btn-allow interactive-el" onclick="initCamera()">Włącz Aparat</button>
</div>

<div class="viewfinder" id="viewfinder">
<div class="hud-top">
<div class="hud-info"><div class="rec-dot"></div><span id="currentLabel">Zdjęcie wejściowe</span></div>
<div class="hud-buttons">
<button class="btn-hud interactive-el" id="btnChromAb" onclick="toggleChromAb()" title="Aberracja chromatyczna 🔒" style="font-size:0.6rem">CA</button>
<button class="btn-hud interactive-el" id="btnGlow" onclick="toggleGlow()" title="Glow / Bloom 🔒" style="font-size:0.6rem">GL</button>
<button class="btn-hud interactive-el" id="btnGrid" onclick="toggleGrid()" title="Siatka">⊞</button>
<button class="btn-hud interactive-el" onclick="switchCamera()" title="Odwróć kamerę">↻</button>
</div>
</div>
<video id="cameraVideo" autoplay playsinline muted></video>
<canvas id="outputCanvas"></canvas>
<div class="grid-lines" id="gridLines"></div>
<div class="focus-ring"></div>
<div class="flash-overlay" id="flash"></div>
<div class="ai-hint" id="aiHint"><button class="ai-hint-close interactive-el" onclick="closeAIHint()">✕</button><div class="ai-hint-title">✦ AI Podpowiedź</div><div class="ai-hint-text" id="aiHintText"></div></div>
<div class="strength-bar"><span class="strength-label" id="strLabel">60%</span><input type="range" class="strength-slider interactive-el" min="0" max="100" value="60" id="strSlider" oninput="updateStrength()"></div>
</div>

<div class="bottom-panel">
<div class="cat-tabs">${categoryButtons}</div>
<div class="film-selector" id="filmCarousel"></div>
<div class="shutter-row">
<button class="shutter-side-btn interactive-el" onclick="prevFilm()">◂</button>
<button class="shutter-btn interactive-el" onclick="takePhoto()"></button>
<button class="shutter-side-btn interactive-el" onclick="nextFilm()">▸</button>
</div>
</div>

<div class="lock-screen" id="lockScreen">
<h2>Zablokowane 🔒</h2>
<p>Ten profil premium jest dostępny w pełnej kolekcji Mindfullens.</p>
<button class="btn-unlock interactive-el" onclick="document.getElementById('premium-offer').scrollIntoView({behavior:'smooth'});closeLock()">Zobacz Pakiety</button>
<button class="btn-close-lock interactive-el" onclick="closeLock()">Wróć do darmowych</button>
</div>

<div class="photo-result" id="photoResult">
<img id="resultImg" src="" alt="Zdjęcie">
<div class="photo-result-info" id="photoInfo"></div>
<div class="ios-hint" id="iosHint">👇 Przytrzymaj zdjęcie palcem i wybierz „Zapisz w Zdjęciach" 👇</div>
<div class="photo-actions"><div style="display:flex;gap:10px;width:100%">
<button class="btn-photo btn-photo-back interactive-el" onclick="closeResult()">Wróć</button>
<button class="btn-photo btn-photo-save interactive-el" onclick="sharePhoto()">Udostępnij</button>
<button class="btn-photo btn-photo-save interactive-el" onclick="downloadPhoto()">Pobierz</button>
</div></div>
</div>
</div>
</div>

<section id="premium-offer" class="fade-element">
  <div class="offer-banner-wrapper">
    <div class="offer-banner tilt-element interactive-el">
      <div class="offer-content">
        <span class="offer-tag">✦ Odblokuj Pełną Moc</span>
        <h3>Wybierz swój pakiet</h3>
        <div class="offer-highlight">Profile Lightroom, receptury Camera App, system Analog Signature i 9 narzędzi AI.</div>
        <p>Wybierz rozwiązanie idealne dla siebie. Kup pakiet <strong>Complete Studio</strong> i otrzymaj wszystkie nasze produkty w jednym: potężny ekosystem do edycji plików RAW (.xmp), gotowe ustawienia JPEG prosto z aparatu oraz dożywotni dostęp do wszystkich narzędzi webowych.</p>
      </div>
      <button class="offer-btn interactive-el" onclick="window.location.href='https://mindfullens.pl/cennik/'">Zobacz pakiety →</button>
    </div>
  </div>
</section>

<footer class="footer"><div class="footer-inner">
<div class="footer-brand"><a href="https://mindfullens.pl/" class="nav-logo interactive-el"><img src="/logo.png" alt="Mindfullens">Mindfullens</a><p class="footer-desc">Profile filmowe i narzędzia AI dla fotografów.</p></div>
<div class="footer-col"><div class="footer-col-title">Narzędzia</div><a href="https://mindfullens.pl/produkty/" class="interactive-el">Presety</a><a href="https://mindfullens.pl/film-lab/" class="interactive-el">Film Lab</a><a href="https://mindfullens.pl/live/" class="interactive-el">Live Cam</a></div>
<div class="footer-col"><div class="footer-col-title">Wsparcie</div><a href="https://mindfullens.pl/#faq" class="interactive-el">FAQ</a><a href="https://mindfullens.pl/#kontakt" class="interactive-el">Kontakt</a></div>
<div class="footer-col"><div class="footer-col-title">Bezpieczeństwo</div><div style="font-size:0.8rem;color:var(--t2);margin-bottom:5px">✔️ 30-dniowa gwarancja</div><div style="font-size:0.8rem;color:var(--t2)">🔒 Bezpieczne płatności</div></div>
</div><div class="footer-bottom"><div>© 2026 Mindfullens.</div><div class="footer-legal"><a href="https://mindfullens.pl/regulamin/" class="interactive-el">Regulamin</a><a href="https://mindfullens.pl/polityka-prywatnosci/" class="interactive-el">Prywatność</a></div></div></footer>

<div class="cart-drawer" id="cartDrawer"><div class="cart-drawer-header"><div class="cart-drawer-title">Koszyk</div><button class="modal-close interactive-el" onclick="toggleCart()">✕</button></div><div class="cart-items" id="cartItems"><div class="cart-empty">Koszyk pusty.</div></div><div class="cart-footer"><div class="cart-total"><span style="font-family:'Outfit',sans-serif;font-size:0.85rem;color:var(--t2)">Razem</span><span id="cartTotal">0 PLN</span></div><button class="btn-footer-checkout interactive-el" onclick="checkout()">Przejdź do kasy →</button></div></div>
`;
}

function clamp(value, min = 0, max = 255) {
  return Math.min(max, Math.max(min, value));
}

function buildLUT(points, interpolation = 'smooth') {
  const lut = new Uint8Array(256);

  if (!Array.isArray(points) || points.length < 2) {
    for (let index = 0; index < 256; index += 1) {
      lut[index] = index;
    }
    return lut;
  }

  const sortedPoints = [...points].sort((a, b) => a[0] - b[0]);
  const useLinear = interpolation === 'linear' || sortedPoints.length === 2;

  for (let index = 0; index < 256; index += 1) {
    if (index <= sortedPoints[0][0]) {
      lut[index] = clamp(sortedPoints[0][1], 0, 255);
      continue;
    }

    if (index >= sortedPoints[sortedPoints.length - 1][0]) {
      lut[index] = clamp(sortedPoints[sortedPoints.length - 1][1], 0, 255);
      continue;
    }

    for (let pointIndex = 0; pointIndex < sortedPoints.length - 1; pointIndex += 1) {
      const current = sortedPoints[pointIndex];
      const next = sortedPoints[pointIndex + 1];

      if (index >= current[0] && index <= next[0]) {
        const t = (index - current[0]) / (next[0] - current[0]);
        const blend = useLinear ? t : t * t * (3 - 2 * t);
        lut[index] = clamp(Math.round(current[1] + (next[1] - current[1]) * blend), 0, 255);
        break;
      }
    }
  }

  return lut;
}

function mapFilmStocksToLiveProfiles() {
  const identityCurves = {
    rgb: [
      [0, 0],
      [255, 255],
    ],
    r: [
      [0, 0],
      [255, 255],
    ],
    g: [
      [0, 0],
      [255, 255],
    ],
    b: [
      [0, 0],
      [255, 255],
    ],
  };

  return filmStocks.map((profile) => ({
    n: profile.name,
    s: profile.sub || 'Master',
    c: profile.cat || 'all',
    f: profile.free !== false,
    bw: Boolean(profile.bw),
    cr: profile.curves || identityCurves,
    vib: Number(profile.vibrance) || 0,
    sat: Number(profile.saturation) || 0,
    con: Number(profile.contrast) || 0,
    exp: Number(profile.exposure) || 0,
    temp: Number(profile.temperature) || 0,
    tint: Number(profile.tint) || 0,
    highlights: Number(profile.highlights) || 0,
    shadows: Number(profile.shadows) || 0,
    whites: Number(profile.whites) || 0,
    blacks: Number(profile.blacks) || 0,
    gm: profile.grayMixer || null,
  }));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export default function LiveCamPage() {
  const markup = useMemo(() => buildLiveCamMarkup(), []);

  useEffect(() => {
    document.title = 'Mindfullens — Live Cam Pro';

    const listeners = [];
    const cleanupFns = [];
    const rafIds = [];
    let logoTimer = null;

    const addListener = (target, type, handler, options) => {
      if (!target) {
        return;
      }
      target.addEventListener(type, handler, options);
      listeners.push(() => target.removeEventListener(type, handler, options));
    };

    const showToast = (msg) => {
      let toast = document.getElementById('appToast');
      if (!toast) {
        return;
      }

      toast.textContent = msg;
      toast.style.transform = 'translateX(-50%) translateY(0)';
      toast.style.opacity = '1';

      if (toast._timer) {
        clearTimeout(toast._timer);
      }

      toast._timer = setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(100px)';
        toast.style.opacity = '0';
      }, 2600);
    };

    const cursor = document.getElementById('cursor');
    const cursorDot = document.getElementById('cursorDot');
    let mouseX = 0;
    let mouseY = 0;
    let cursorX = 0;
    let cursorY = 0;
    let dotX = 0;
    let dotY = 0;

    addListener(document, 'mousemove', (event) => {
      mouseX = event.clientX;
      mouseY = event.clientY;
    });

    const animateCursor = () => {
      cursorX += (mouseX - cursorX) * 0.15;
      cursorY += (mouseY - cursorY) * 0.15;

      if (cursor) {
        cursor.style.left = `${cursorX}px`;
        cursor.style.top = `${cursorY}px`;
      }

      dotX += (mouseX - dotX) * 0.25;
      dotY += (mouseY - dotY) * 0.25;

      if (cursorDot) {
        cursorDot.style.left = `${dotX}px`;
        cursorDot.style.top = `${dotY}px`;
      }

      const id = requestAnimationFrame(animateCursor);
      rafIds[0] = id;
    };

    animateCursor();

    const bindCursorHover = () => {
      const interactiveElements = document.querySelectorAll(
        'a, button, .interactive-el, input, .film-item, .cta-banner, .offer-banner'
      );
      interactiveElements.forEach((element) => {
        const onEnter = () => cursor?.classList.add('hover');
        const onLeave = () => cursor?.classList.remove('hover');
        addListener(element, 'mouseenter', onEnter);
        addListener(element, 'mouseleave', onLeave);
      });
    };

    bindCursorHover();

    const scrollProgress = document.getElementById('scrollProgress');
    const scrollBtn = document.getElementById('scrollBtn');
    const scrollText = document.getElementById('scrollText');
    const mainNav = document.getElementById('mainNav');

    const handleScrollLogic = () => {
      const totalHeight = document.documentElement.scrollHeight;
      const scrollTotal = totalHeight - window.innerHeight;
      const scrollCurrent = window.scrollY;
      const scrollPercent = scrollTotal > 0 ? scrollCurrent / scrollTotal : 0;

      if (scrollProgress) {
        scrollProgress.style.width = `${scrollPercent * 100}%`;
      }

      if (mainNav) {
        mainNav.classList.toggle('scrolled', scrollCurrent > 48);
      }

      if (!scrollBtn) {
        return;
      }

      if (scrollCurrent + window.innerHeight >= totalHeight - 50) {
        scrollBtn.classList.add('is-flipped');
        if (scrollText) {
          scrollText.textContent = 'DO GÓRY';
        }
      } else {
        scrollBtn.classList.remove('is-flipped');
        if (scrollText) {
          scrollText.textContent = 'PRZEWIŃ';
        }
      }
    };

    addListener(window, 'scroll', handleScrollLogic);
    addListener(scrollBtn, 'click', () => {
      if (!scrollBtn) {
        return;
      }

      if (scrollBtn.classList.contains('is-flipped')) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
      }
    });

    handleScrollLogic();

    const initTiltEffect = () => {
      document.querySelectorAll('.tilt-element').forEach((card) => {
        const onMove = (event) => {
          const rect = card.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;
          const rotateX = ((y - centerY) / centerY) * -5;
          const rotateY = ((x - centerX) / centerX) * 5;
          card.style.transition = 'transform 0.1s ease-out';
          card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.01)`;
        };

        const onLeave = () => {
          card.style.transition = 'transform 0.45s ease';
          card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)';
        };

        addListener(card, 'mousemove', onMove);
        addListener(card, 'mouseleave', onLeave);
      });
    };

    initTiltEffect();

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    const iosHint = document.getElementById('iosHint');
    if (!isIOS && iosHint) {
      iosHint.style.display = 'none';
    }

    let cart = [];

    const toggleCart = () => {
      document.getElementById('cartDrawer')?.classList.toggle('open');
    };

    const updateCartUI = () => {
      const container = document.getElementById('cartItems');
      const totalElement = document.getElementById('cartTotal');
      const cartCount = document.getElementById('cartCount');

      if (!container || !totalElement || !cartCount) {
        return;
      }

      cartCount.textContent = String(cart.length);

      if (!cart.length) {
        container.innerHTML = '<div class="cart-empty">Koszyk pusty.</div>';
        totalElement.textContent = '0 PLN';
        return;
      }

      let total = 0;
      container.innerHTML = cart
        .map((item, index) => {
          total += item.price;
          return `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)"><div><div style="font-size:0.9rem;font-weight:500">${item.name}</div><div style="font-family:'JetBrains Mono',monospace;color:var(--film);font-size:0.78rem">${item.price} PLN</div></div><button onclick="removeFromCart(${index})" style="background:none;border:none;color:var(--t3);cursor:pointer;font-size:0.7rem;text-transform:uppercase">Usuń</button></div>`;
        })
        .join('');

      totalElement.textContent = `${total} PLN`;
      bindCursorHover();
    };

    const addToCart = (name, price) => {
      if (!cart.find((item) => item.name === name)) {
        cart.push({ name, price });
      }
      updateCartUI();
      document.getElementById('cartDrawer')?.classList.add('open');
    };

    const removeFromCart = (index) => {
      cart.splice(index, 1);
      updateCartUI();
    };

    const checkout = () => {
      window.location.href = 'https://mindfullens.pl/cennik/';
    };

    const F = mapFilmStocksToLiveProfiles();
    const filmLUTs = F.map((film) => ({
      rgb: buildLUT(film.cr?.rgb, 'smooth'),
      r: buildLUT(film.cr?.r, 'smooth'),
      g: buildLUT(film.cr?.g, 'smooth'),
      b: buildLUT(film.cr?.b, 'smooth'),
    }));

    const swatchStyle = (film, index) => {
      if (film.bw) {
        return 'background:linear-gradient(135deg,#666,#333)';
      }

      const lut = filmLUTs[index];
      return `background:linear-gradient(135deg,rgb(${lut.r[180]},${lut.g[160]},${lut.b[140]}),rgb(${lut.r[80]},${lut.g[90]},${lut.b[100]}))`;
    };

    let curIdx = 0;
    let strength = 60;
    let curStream = null;
    let facingMode = 'environment';
    let renderFrameId = null;
    let lastDataURL = null;
    let showGrid = true;
    let filteredIndices = [];
    let curFilteredPos = 0;
    let devMode = false;
    let proChromAb = false;
    let proGlow = false;

    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('outputCanvas');
    const context = canvas?.getContext('2d', { willReadFrequently: true });
    const viewfinder = document.getElementById('viewfinder');
    const fxCanvas = document.createElement('canvas');
    const fxContext = fxCanvas.getContext('2d');

    const applySplitTone = (red, green, blue, profile, amount) => {
      const luma = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
      const highlights = (profile.highlights || 0) * amount * 0.45;
      const shadows = (profile.shadows || 0) * amount * 0.45;
      const whites = (profile.whites || 0) * amount * 0.25;
      const blacks = (profile.blacks || 0) * amount * 0.25;

      const highlightMask = smoothstep(0.5, 1, luma);
      const shadowMask = 1 - smoothstep(0, 0.5, luma);
      const whiteMask = smoothstep(0.72, 1, luma);
      const blackMask = 1 - smoothstep(0, 0.28, luma);

      const lift = shadows * shadowMask + highlights * highlightMask + whites * whiteMask - blacks * blackMask;

      return [red + lift, green + lift, blue + lift];
    };

    const applyFilmToCanvas = (cx, width, height, profile, profileIndex, amount) => {
      if (!cx) {
        return;
      }

      const imageData = cx.getImageData(0, 0, width, height);
      const pixels = imageData.data;
      const lut = filmLUTs[profileIndex];
      const isBW = profile.bw;
      const gm = profile.gm || [0, 0, 0];

      const contrastFactor = 1 + ((profile.con ?? 0) * amount) / 250;
      const saturationFactor = 1 + ((profile.sat ?? 0) * amount) / 80;
      const vibranceFactor = ((profile.vib ?? 0) * amount) / 80;
      const exposureGain = Math.pow(2, (profile.exp ?? 0) * amount);
      const tempShift = (profile.temp ?? 0) * amount * 1.5;
      const tintShift = (profile.tint ?? 0) * amount * 1.2;

      for (let index = 0; index < pixels.length; index += 4) {
        let red = pixels[index];
        let green = pixels[index + 1];
        let blue = pixels[index + 2];

        let redIndex = clamp(Math.round(red), 0, 255);
        let greenIndex = clamp(Math.round(green), 0, 255);
        let blueIndex = clamp(Math.round(blue), 0, 255);

        red = red * (1 - amount) + lut.r[redIndex] * amount;
        green = green * (1 - amount) + lut.g[greenIndex] * amount;
        blue = blue * (1 - amount) + lut.b[blueIndex] * amount;

        redIndex = clamp(Math.round(red), 0, 255);
        greenIndex = clamp(Math.round(green), 0, 255);
        blueIndex = clamp(Math.round(blue), 0, 255);

        red = red * (1 - amount) + lut.rgb[redIndex] * amount;
        green = green * (1 - amount) + lut.rgb[greenIndex] * amount;
        blue = blue * (1 - amount) + lut.rgb[blueIndex] * amount;

        red *= exposureGain;
        green *= exposureGain;
        blue *= exposureGain;

        red += tempShift;
        blue -= tempShift;
        green += tintShift;
        red += tintShift * 0.12;
        blue += tintShift * 0.12;

        [red, green, blue] = applySplitTone(red, green, blue, profile, amount);

        if (isBW) {
          let redWeight = 0.3 + gm[0] * amount * 0.008;
          let greenWeight = 0.59 + gm[1] * amount * 0.008;
          let blueWeight = 0.11 + gm[2] * amount * 0.008;
          const weightSum = Math.abs(redWeight) + Math.abs(greenWeight) + Math.abs(blueWeight);

          if (weightSum > 0) {
            redWeight /= weightSum;
            greenWeight /= weightSum;
            blueWeight /= weightSum;
          }

          const gray = red * redWeight + green * greenWeight + blue * blueWeight;
          red = gray;
          green = gray;
          blue = gray;
        }

        if (contrastFactor !== 1) {
          red = ((red / 255 - 0.5) * contrastFactor + 0.5) * 255;
          green = ((green / 255 - 0.5) * contrastFactor + 0.5) * 255;
          blue = ((blue / 255 - 0.5) * contrastFactor + 0.5) * 255;
        }

        if (!isBW && (saturationFactor !== 1 || vibranceFactor !== 0)) {
          const gray = 0.299 * red + 0.587 * green + 0.114 * blue;
          let satMix = saturationFactor;
          if (vibranceFactor !== 0) {
            const max = Math.max(red, green, blue);
            const min = Math.min(red, green, blue);
            satMix += vibranceFactor * (1 - (max > 0 ? (max - min) / max : 0));
          }

          red = gray + (red - gray) * satMix;
          green = gray + (green - gray) * satMix;
          blue = gray + (blue - gray) * satMix;
        }

        pixels[index] = clamp(red, 0, 255);
        pixels[index + 1] = clamp(green, 0, 255);
        pixels[index + 2] = clamp(blue, 0, 255);
      }

      cx.putImageData(imageData, 0, 0);

      if (proChromAb && amount > 0) {
        const shift = Math.max(3, Math.round(width * 0.007));
        fxCanvas.width = width;
        fxCanvas.height = height;
        fxContext.drawImage(cx.canvas, 0, 0);
        cx.save();
        cx.globalAlpha = 0.4;
        cx.globalCompositeOperation = 'screen';
        cx.drawImage(fxCanvas, -shift, 0);
        cx.drawImage(fxCanvas, shift, 0);
        cx.globalAlpha = 1;
        cx.globalCompositeOperation = 'source-over';
        cx.restore();
      }

      if (proGlow && amount > 0) {
        fxCanvas.width = width;
        fxCanvas.height = height;
        fxContext.filter = `blur(${Math.max(8, Math.round(width * 0.02))}px)`;
        fxContext.drawImage(cx.canvas, 0, 0);
        fxContext.filter = 'none';
        cx.save();
        cx.globalCompositeOperation = 'screen';
        cx.globalAlpha = 0.6 * amount;
        cx.drawImage(fxCanvas, 0, 0);
        cx.globalAlpha = 1;
        cx.globalCompositeOperation = 'source-over';
        cx.restore();
      }
    };

    const scrollToFilm = (filmIndex) => {
      const carousel = document.getElementById('filmCarousel');
      const item = document.getElementById(`fi-${filmIndex}`);
      if (!carousel || !item) {
        return;
      }

      carousel.scrollTo({
        left: item.offsetLeft - carousel.offsetWidth / 2 + item.offsetWidth / 2,
        behavior: 'smooth',
      });
    };

    const selectFilm = (filmIndex) => {
      const film = F[filmIndex];
      if (!film) {
        return;
      }

      if (!film.f && !devMode) {
        document.getElementById('lockScreen')?.classList.add('show');
        return;
      }

      curIdx = filmIndex;
      curFilteredPos = filteredIndices.indexOf(filmIndex);

      document.querySelectorAll('.film-item').forEach((element) => {
        element.classList.remove('active');
      });

      document.getElementById(`fi-${filmIndex}`)?.classList.add('active');
      const currentLabel = document.getElementById('currentLabel');
      if (currentLabel) {
        currentLabel.textContent = film.n;
      }

      scrollToFilm(filmIndex);
    };

    const buildCarousel = (category = 'all') => {
      filteredIndices = [];

      F.forEach((film, index) => {
        if (category === 'all' || film.c === category) {
          filteredIndices.push(index);
        }
      });

      curFilteredPos = filteredIndices.indexOf(curIdx);
      if (curFilteredPos < 0) {
        curFilteredPos = 0;
      }

      const carousel = document.getElementById('filmCarousel');
      if (!carousel) {
        return;
      }

      carousel.innerHTML = filteredIndices
        .map((filmIndex) => {
          const film = F[filmIndex];
          return `<div class="film-item ${filmIndex === curIdx ? 'active' : ''}" id="fi-${filmIndex}" onclick="selectFilm(${filmIndex})"><div class="film-color" style="${swatchStyle(film, filmIndex)}">${!film.f && !devMode ? '🔒' : ''}</div><div class="film-item-name">${film.n}</div></div>`;
        })
        .join('');

      bindCursorHover();
      setTimeout(() => scrollToFilm(curIdx), 50);
    };

    const prevFilm = () => {
      let position = curFilteredPos - 1;
      while (position >= 0 && !F[filteredIndices[position]]?.f && !devMode) {
        position -= 1;
      }
      if (position < 0) {
        return;
      }

      curFilteredPos = position;
      selectFilm(filteredIndices[position]);
    };

    const nextFilm = () => {
      let position = curFilteredPos + 1;
      while (position < filteredIndices.length && !F[filteredIndices[position]]?.f && !devMode) {
        position += 1;
      }
      if (position >= filteredIndices.length) {
        return;
      }

      curFilteredPos = position;
      selectFilm(filteredIndices[position]);
    };

    const closeLock = () => {
      document.getElementById('lockScreen')?.classList.remove('show');
    };

    const toggleGrid = () => {
      showGrid = !showGrid;
      const grid = document.getElementById('gridLines');
      if (grid) {
        grid.style.display = showGrid ? '' : 'none';
      }
      document.getElementById('btnGrid')?.classList.toggle('active', showGrid);
    };

    const toggleChromAb = () => {
      if (!devMode) {
        document.getElementById('lockScreen')?.classList.add('show');
        return;
      }
      proChromAb = !proChromAb;
      document.getElementById('btnChromAb')?.classList.toggle('active', proChromAb);
    };

    const toggleGlow = () => {
      if (!devMode) {
        document.getElementById('lockScreen')?.classList.add('show');
        return;
      }
      proGlow = !proGlow;
      document.getElementById('btnGlow')?.classList.toggle('active', proGlow);
    };

    const updateStrength = () => {
      const slider = document.getElementById('strSlider');
      if (!slider) {
        return;
      }

      strength = Number.parseInt(slider.value, 10) || 0;
      const label = document.getElementById('strLabel');
      if (label) {
        label.textContent = `${strength}%`;
      }
    };

    const resizeCanvas = () => {
      if (!canvas || !viewfinder) {
        return;
      }

      const rect = viewfinder.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
    };

    const renderLoop = () => {
      if (video && context && canvas && video.readyState >= video.HAVE_ENOUGH_DATA) {
        const width = canvas.width;
        const height = canvas.height;
        const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
        const x = width / 2 - (video.videoWidth / 2) * scale;
        const y = height / 2 - (video.videoHeight / 2) * scale;

        context.drawImage(video, x, y, video.videoWidth * scale, video.videoHeight * scale);

        const profile = F[curIdx];
        const amount = strength / 100;
        if (profile && amount > 0 && curIdx > 0) {
          applyFilmToCanvas(context, width, height, profile, curIdx, amount);
        }
      }

      renderFrameId = requestAnimationFrame(renderLoop);
      rafIds[1] = renderFrameId;
    };

    const startStream = async () => {
      if (!video) {
        return;
      }

      if (curStream) {
        curStream.getTracks().forEach((track) => track.stop());
      }

      try {
        const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const constraints = { video: { facingMode }, audio: false };
        if (!isIosDevice) {
          constraints.video.width = { ideal: 4032 };
          constraints.video.height = { ideal: 3024 };
        }

        curStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = curStream;

        if (canvas) {
          canvas.style.transform = facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
        }

        await new Promise((resolve) => {
          video.onloadedmetadata = () => {
            video.play().then(resolve).catch(resolve);
          };
          setTimeout(resolve, 3000);
        });

        resizeCanvas();

        if (renderFrameId) {
          cancelAnimationFrame(renderFrameId);
        }

        renderLoop();
      } catch (error) {
        console.error('Camera error:', error);
        const permScreen = document.getElementById('permScreen');
        if (permScreen) {
          permScreen.style.display = 'none';
        }

        if (viewfinder) {
          viewfinder.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--t2);text-align:center;padding:20px"><div style="font-size:2rem;margin-bottom:10px">📷</div><div style="font-size:0.9rem;margin-bottom:8px">Aparat niedostępny</div><div style="font-size:0.7rem;color:var(--t3);margin-bottom:12px">${error?.message || 'Sprawdź uprawnienia kamery'}</div><button class="btn-allow" onclick="window.location.reload()">Spróbuj ponownie</button></div>`;
        }
      }
    };

    const initCamera = async () => {
      const permScreen = document.getElementById('permScreen');
      if (permScreen) {
        permScreen.style.display = 'none';
      }
      await startStream();
      setTimeout(() => {
        const hints = [
          'Soft Portrait – Natural Glow: bezpieczny punkt startowy do portretu.',
          'Cinematic Film – Soft Story: delikatny roll-off świateł i kinowy klimat.',
          'Vivid Colors – Clean Pop: mocniejsza separacja kolorów przy zachowaniu skóry.',
          'Classic B&W – Timeless Look: klasyczny monochrom do street i reportażu.',
          'Neon Night – Cinematic Glow: nocne kadry z miękką poświatą.',
          'W Live Cam masz teraz te same profile co w Film Lab — wynik będzie spójny.',
        ];

        const hintText = document.getElementById('aiHintText');
        const hint = document.getElementById('aiHint');
        if (hintText) {
          hintText.textContent = hints[Math.floor(Math.random() * hints.length)];
        }
        hint?.classList.add('show');

        setTimeout(() => {
          hint?.classList.remove('show');
        }, 8000);
      }, 2200);
    };

    const switchCamera = () => {
      facingMode = facingMode === 'environment' ? 'user' : 'environment';
      startStream();
    };

    const takePhoto = () => {
      if (!video) {
        return;
      }

      const flash = document.getElementById('flash');
      flash?.classList.remove('fire');
      if (flash) {
        void flash.offsetWidth;
        flash.classList.add('fire');
      }

      if (renderFrameId) {
        cancelAnimationFrame(renderFrameId);
      }

      setTimeout(() => {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) {
          return;
        }

        const hqCanvas = document.createElement('canvas');
        hqCanvas.width = width;
        hqCanvas.height = height;
        const hqContext = hqCanvas.getContext('2d', { willReadFrequently: true });

        if (!hqContext) {
          return;
        }

        if (facingMode === 'user') {
          hqContext.translate(width, 0);
          hqContext.scale(-1, 1);
        }

        hqContext.drawImage(video, 0, 0, width, height);

        const profile = F[curIdx];
        const amount = strength / 100;
        if (profile && amount > 0 && curIdx > 0) {
          applyFilmToCanvas(hqContext, width, height, profile, curIdx, amount);
        }

        lastDataURL = hqCanvas.toDataURL('image/jpeg', 1.0);

        const resultImage = document.getElementById('resultImg');
        const resultInfo = document.getElementById('photoInfo');
        if (resultImage) {
          resultImage.src = lastDataURL;
        }
        if (resultInfo) {
          resultInfo.textContent = `${profile.n} · ${strength}% · ${width}×${height}`;
        }

        document.getElementById('photoResult')?.classList.add('show');
      }, 100);
    };

    const closeResult = () => {
      document.getElementById('photoResult')?.classList.remove('show');
      renderLoop();
    };

    const downloadPhoto = () => {
      if (!lastDataURL) {
        return;
      }

      const fileName = `Mindfullens_${F[curIdx].n.replace(/\s/g, '_')}.jpg`;
      const binary = atob(lastDataURL.split(',')[1]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }

      const blob = new Blob([bytes.buffer], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    };

    const sharePhoto = () => {
      if (!lastDataURL) {
        return;
      }

      const fileName = `Mindfullens_${F[curIdx].n.replace(/\s/g, '_')}.jpg`;
      const binary = atob(lastDataURL.split(',')[1]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }

      const blob = new Blob([bytes.buffer], { type: 'image/jpeg' });
      const file = new File([blob], fileName, { type: 'image/jpeg' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator
          .share({ files: [file], title: 'Mindfullens Photo' })
          .catch(() => {
            downloadPhoto();
          });
      } else {
        downloadPhoto();
      }
    };

    const closeAIHint = () => {
      document.getElementById('aiHint')?.classList.remove('show');
    };

    const filterCat = (category, buttonElement) => {
      document.querySelectorAll('.cat-tab').forEach((tab) => tab.classList.remove('active'));
      buttonElement?.classList.add('active');
      buildCarousel(category);
    };

    let logoTaps = 0;
    const logoButton = document.getElementById('logoBtn');

    const activateDevMode = () => {
      if (devMode) {
        return;
      }

      devMode = true;
      F.forEach((film) => {
        film.f = true;
      });

      buildCarousel();

      const premiumOffer = document.getElementById('premium-offer');
      if (premiumOffer) {
        premiumOffer.style.display = 'none';
      }

      document.title = '🔓 Mindfullens — Live Cam Pro [DEV]';
      showToast('Tryb DEV włączony.');
    };

    const onLogoClick = (event) => {
      event.preventDefault();
      logoTaps += 1;
      clearTimeout(logoTimer);

      logoTimer = setTimeout(() => {
        logoTaps = 0;
      }, 1200);

      if (logoTaps >= 7) {
        activateDevMode();
        logoTaps = 0;
      }
    };

    addListener(logoButton, 'click', onLogoClick);

    addListener(document, 'click', (event) => {
      const dropdown = document.getElementById('toolsDropdown');
      if (dropdown && !dropdown.contains(event.target)) {
        dropdown.classList.remove('open');
      }
    });

    addListener(document, 'keydown', (event) => {
      if (event.key === 'Escape') {
        document.getElementById('toolsDropdown')?.classList.remove('open');
      }
    });

    addListener(window, 'resize', resizeCanvas);

    buildCarousel();
    const currentLabel = document.getElementById('currentLabel');
    if (currentLabel && F[curIdx]) {
      currentLabel.textContent = F[curIdx].n;
    }

    const globalFns = {
      toggleCart,
      addToCart,
      removeFromCart,
      checkout,
      initCamera,
      switchCamera,
      toggleGrid,
      toggleChromAb,
      toggleGlow,
      updateStrength,
      filterCat,
      selectFilm,
      prevFilm,
      nextFilm,
      closeLock,
      takePhoto,
      closeResult,
      downloadPhoto,
      sharePhoto,
      closeAIHint,
    };

    Object.entries(globalFns).forEach(([name, fn]) => {
      window[name] = fn;
    });

    cleanupFns.push(() => {
      Object.keys(globalFns).forEach((name) => {
        delete window[name];
      });
    });

    cleanupFns.push(() => {
      if (logoTimer) {
        clearTimeout(logoTimer);
      }

      if (renderFrameId) {
        cancelAnimationFrame(renderFrameId);
      }

      if (curStream) {
        curStream.getTracks().forEach((track) => track.stop());
      }

      rafIds.forEach((id) => {
        if (id) {
          cancelAnimationFrame(id);
        }
      });
    });

    return () => {
      listeners.forEach((unbind) => unbind());
      cleanupFns.forEach((fn) => fn());
    };
  }, []);

  return <div dangerouslySetInnerHTML={{ __html: markup }} />;
}
