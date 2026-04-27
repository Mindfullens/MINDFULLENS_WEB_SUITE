import { useEffect, useMemo } from 'react';
import { prefetchFilmLabRoute } from './prefetchFilmLabRoute.js';
import './landingPage.css';

/** W dev używamy tej samej aplikacji (`App` → `/film-lab`); na produkcji zostaje pełny URL marketingowy. */
const FILM_LAB_HREF = import.meta.env.DEV ? '/film-lab' : 'https://mindfullens.pl/film-lab/';

const LANDING_MARKUP = `
<div id="appToast"></div>
<div class="cursor" id="cursor"></div>
<div class="cursor-dot" id="cursorDot"></div>

<div class="preloader" id="preloader">
  <div class="preloader__breath-container">
    <div class="preloader__breath-wave"></div>
    <div class="preloader__breath-wave" style="animation-delay: 1.3s;"></div>
    <div class="preloader__breath-core"></div>
  </div>
  <span class="preloader__text">Wdech... Wydech...</span>
</div>

<div class="scroll-progress" id="scrollProgress"></div>
<button id="scrollBtn" class="scroll-indicator-btn interactive-el" type="button">
  <div class="scroll-indicator__mouse"></div>
  <span id="scrollText" class="scroll-indicator__text">Przewiń</span>
</button>

<nav class="nav" id="mainNav">
  <div class="nav-inner">
    <a href="https://mindfullens.pl/" class="nav-logo interactive-el">
      <img src="/logo.png" alt="MindfulLens Logo">
      MindfulLens™
    </a>
    <div class="nav-links" id="navLinks">
      <a href="#presets" class="nav-link interactive-el">Katalog Presetów</a>
      <div class="nav-dropdown" id="toolsDropdown">
        <button class="nav-dropdown-trigger interactive-el" type="button" onclick="window.toggleDropdown(event)">
          Narzędzia <span class="nav-dropdown-arrow">▾</span>
        </button>
        <div class="mega-menu">
          <div class="mega-menu-grid">
            <a href="${FILM_LAB_HREF}" class="mega-item interactive-el"><div class="mega-item-icon">⚗️</div><div class="mega-item-text"><div class="mega-item-name">Film Lab <span class="mega-item-tag mega-item-tag-free">Free</span></div><div class="mega-item-desc">Nakładaj symulacje klisz w przeglądarce</div></div></a>
            <a href="https://mindfullens.pl/live/" class="mega-item interactive-el"><div class="mega-item-icon">📸</div><div class="mega-item-text"><div class="mega-item-name">Live Cam <span class="mega-item-tag mega-item-tag-free">Free</span></div><div class="mega-item-desc">Testuj profile na żywo kamerą w telefonie</div></div></a>
            <a href="https://mindfullens.pl/matcher/" class="mega-item interactive-el"><div class="mega-item-icon">🧠</div><div class="mega-item-text"><div class="mega-item-name">AI Matcher <span class="mega-item-tag mega-item-tag-pro">AI</span></div><div class="mega-item-desc">Wrzuć inspirację, AI dopasuje idealny profil</div></div></a>
            <a href="https://mindfullens.pl/timemachine/" class="mega-item interactive-el"><div class="mega-item-icon">⏳</div><div class="mega-item-text"><div class="mega-item-name">Time Machine <span class="mega-item-tag mega-item-tag-new">Nowe</span></div><div class="mega-item-desc">Symulacja starzenia kliszy dekady do tyłu</div></div></a>
            <a href="https://mindfullens.pl/ciemnia/" class="mega-item interactive-el"><div class="mega-item-icon">🧪</div><div class="mega-item-text"><div class="mega-item-name">Recipe Lab <span class="mega-item-tag mega-item-tag-new">Nowe</span></div><div class="mega-item-desc">Stwórz własną recepturę filmową od zera</div></div></a>
            <a href="https://mindfullens.pl/blendstudio/" class="mega-item interactive-el"><div class="mega-item-icon">⚗️</div><div class="mega-item-text"><div class="mega-item-name">Blend Studio <span class="mega-item-tag mega-item-tag-new">Nowe</span></div><div class="mega-item-desc">Miksuj dwie klisze w jedno zdjęcie</div></div></a>
            <a href="https://mindfullens.pl/contact-sheet/" class="mega-item interactive-el"><div class="mega-item-icon">🎞️</div><div class="mega-item-text"><div class="mega-item-name">Contact Sheet</div><div class="mega-item-desc">109 profili na jednym arkuszu porównania</div></div></a>
            <a href="https://mindfullens.pl/color-sync/" class="mega-item interactive-el"><div class="mega-item-icon">🔄</div><div class="mega-item-text"><div class="mega-item-name">Color Sync <span class="mega-item-tag mega-item-tag-pro">Pro</span></div><div class="mega-item-desc">Zrównaj kolory z 2-3 aparatów kliknięciem</div></div></a>
          </div>
          <div class="mega-footer"><span class="mega-footer-text">Zobacz profile i szybkie porównania przed/po</span><a href="#presets" class="mega-footer-btn interactive-el" onclick="window.scrollToPresets(); return false;">Przejdź do katalogu</a></div>
        </div>
      </div>
      <a href="https://mindfullens.pl/camera-settings-app" class="nav-link interactive-el">Camera App</a>
      <a href="https://mindfullens.pl/analog-signature/" class="nav-link nav-link-red interactive-el">Analog Signature</a>
    </div>
    <div style="display:flex;align-items:center;gap:12px">
      <button class="nav-mobile-toggle interactive-el" type="button" onclick="window.toggleMobileMenu()" aria-label="Menu">☰</button>
      <button class="nav-cta interactive-el" type="button" onclick="window.toggleCart()">Koszyk <span class="cart-count" id="cartCount">0</span></button>
    </div>
  </div>
</nav>

<section class="hero" id="hero">
  <div class="hero-bg">
    <div class="hero-orb hero-orb-1"></div>
    <div class="hero-orb hero-orb-2"></div>
  </div>
  <div class="hero-content">
    <div class="hero-badge"><span style="width:6px;height:6px;background:var(--film3);border-radius:50%;display:inline-block;animation:textPulse 2s infinite;"></span> <span class="brand-orange">MindfulLens™ Vibe System</span></div>
    <h1><span class="brand-orange">MindfulLens™ Vibe System</span><br><em>Duży efekt bez godzin suwakowania.</em></h1>
    <p class="hero-sub">Spójny, ciepły i kinowy charakter zdjęć w kilka sekund. Porównaj duże różnice przed/po i wybierz vibe, który najlepiej pasuje do Twojej marki.</p>
    <div class="hero-ctas">
      <a href="#presets" class="hero-btn hero-btn-primary interactive-el" onclick="window.scrollToPresets(); return false;">Zobacz duże różnice przed/po →</a>
      <a href="#presets" class="hero-btn interactive-el" style="border:1px solid var(--border-h);background:transparent;color:var(--t1);">Przeglądaj Katalog</a>
    </div>
  </div>
</section>

<section class="problem-solution fade-element">
  <span class="section-tag">✦ Dlaczego My?</span>
  <h2 class="section-title">Frustruje Cię ciągłe <em>dopasowywanie kolorów</em>?</h2>
  <div class="ps-content">
    <p>Godziny spędzone przed ekranem, a skórze wciąż brakuje wyrazu, podczas gdy Twojemu feedowi brakuje "duszy" i nie przyciąga on uwagi tak, jak byś chciał?</p>
    <p><strong>Zamiast zgadywać ustawienia, użyj precyzyjnie skalibrowanych rozwiązań.</strong></p>
    <p>Jedno kliknięcie i Twoje zdjęcie zyskuje ciepły, estetyczny charakter. Otrzymujesz profil idealnie dopracowany pod social media.</p>
  </div>
</section>

<section style="padding-top:0" class="fade-element">
  <div class="ba-container interactive-el" id="baContainer">
    <div class="ba-side ba-before"></div>
    <div class="ba-side ba-after" id="baAfter"></div>
    <div class="ba-slider-line" id="baLine"></div>
    <div class="ba-slider-handle" id="baHandle"></div>
    <input type="range" min="0" max="100" value="50" class="ba-range-input" id="baRange" aria-label="Suwak porównania">
    <span class="ba-label ba-label-before">Przed (Flat RAW)</span>
    <span class="ba-label ba-label-after">Po (MindfulLens™ Vibe)</span>
  </div>
</section>

<section class="benefits fade-element">
  <div class="section-header">
    <span class="section-tag">✦ Twoje Korzyści</span>
    <h2 class="section-title">Co zyskasz wybierając <em>nasz ekosystem</em>?</h2>
    <p class="section-desc">Nie kupujesz zwykłych presetów. Inwestujesz w idealny wygląd swojego profilu.</p>
  </div>
  <div class="benefits-grid">
    <div class="benefit-card tilt-element interactive-el"><div class="benefit-icon">⏳</div><h3 class="benefit-title">Oszczędzasz godziny pracy</h3><p class="benefit-desc">Aplikujesz profil, korygujesz ekspozycję i gotowe.</p></div>
    <div class="benefit-card tilt-element interactive-el"><div class="benefit-icon">✨</div><h3 class="benefit-title">Wyróżniasz się z tłumu</h3><p class="benefit-desc">Zdjęcia nabierają głębi i ciepłych tonów, które zatrzymują scrollowanie.</p></div>
    <div class="benefit-card tilt-element interactive-el"><div class="benefit-icon">🎯</div><h3 class="benefit-title">Spójne portfolio</h3><p class="benefit-desc">Utrzymujesz jeden, rozpoznawalny styl we wszystkich pracach.</p></div>
  </div>
</section>

<section id="presets" class="fade-element">
  <div class="section-header">
    <span class="section-tag">✦ Biblioteka</span>
    <h2 class="section-title">Poznaj <em>nasze profile</em></h2>
    <p class="section-desc" style="margin-bottom:10px;">🎯 A premium film-inspired preset system designed for creators who want consistent, cinematic results without technical complexity.</p>
    <p class="section-desc" style="margin-bottom:10px;">Built around emotion, not settings — each preset delivers a distinct visual mood in one click.</p>
    <p class="section-desc" style="margin-bottom:20px;line-height:1.9;">80+ Premium Presets<br>Cinematic Film Looks<br>Portrait Skin System<br>Black & White Collection<br>Creative & Experimental Looks</p>
  </div>

  <div class="preset-filters">
    <button class="filter-btn active interactive-el" type="button" onclick="window.filterPresets('all', this)">Wyselekcjonowane (20)</button>
    <button class="filter-btn interactive-el" type="button" onclick="window.filterPresets('color', this)">Kolorowe</button>
    <button class="filter-btn interactive-el" type="button" onclick="window.filterPresets('bw', this)">Czarno-białe</button>
  </div>

  <div class="preset-grid" id="presetGrid"></div>
</section>

<section class="social-proof fade-element">
  <div class="section-header">
    <span class="section-tag">✦ Zaufali Nam</span>
    <h2 class="section-title">Dołącz do setek <em>zadowolonych</em> twórców</h2>
  </div>
  <div class="sp-grid">
    <div class="sp-card tilt-element interactive-el"><div class="sp-stars">★★★★★</div><p class="sp-text">"Presety MindfulLens całkowicie odmieniły mój workflow."</p><div class="sp-author"><div class="sp-avatar">M</div><div><div class="sp-name">Michał K.</div><div class="sp-role">Fotograf Ślubny</div></div></div></div>
    <div class="sp-card tilt-element interactive-el"><div class="sp-stars">★★★★★</div><p class="sp-text">"Film Lab to genialne narzędzie do szybkich publikacji."</p><div class="sp-author"><div class="sp-avatar">A</div><div><div class="sp-name">Anna S.</div><div class="sp-role">Twórczyni Contentu</div></div></div></div>
    <div class="sp-card tilt-element interactive-el"><div class="sp-stars">★★★★★</div><p class="sp-text">"Naturalne, estetyczne i ciepłe odcienie skóry. Polecam."</p><div class="sp-author"><div class="sp-avatar">T</div><div><div class="sp-name">Tomasz W.</div><div class="sp-role">Fotograf Portretowy</div></div></div></div>
  </div>
</section>

<section class="security fade-element">
  <div class="section-header">
    <span class="section-tag">✦ Gwarancje</span>
    <h2 class="section-title">Kupuj w 100% <em>bezpiecznie</em></h2>
  </div>
  <div class="sec-grid">
    <div class="sec-item interactive-el"><div class="sec-icon">⚡</div><h3 class="sec-title">Natychmiastowy Dostęp</h3><p class="sec-desc">Pliki i licencję otrzymujesz od razu.</p></div>
    <div class="sec-item interactive-el"><div class="sec-icon">🔒</div><h3 class="sec-title">Bezpieczne Płatności</h3><p class="sec-desc">Szyfrowane płatności Stripe i BLIK.</p></div>
    <div class="sec-item interactive-el"><div class="sec-icon">🛡️</div><h3 class="sec-title">Wsparcie Techniczne</h3><p class="sec-desc">Czytelne instrukcje i szybka pomoc.</p></div>
  </div>
</section>

<footer class="footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <a href="#hero" class="nav-logo interactive-el">
        <img src="/logo.png" alt="MindfulLens Logo">
        MindfulLens™
      </a>
      <p class="footer-desc">MindfulLens™ Vibe System — autorskie profile i narzędzia tworzące spójny, premium look.</p>
    </div>
    <div class="footer-col"><div class="footer-col-title">Narzędzia</div><a href="#presets" class="interactive-el">Kolekcja Presetów</a><a href="${FILM_LAB_HREF}" class="interactive-el">Film Lab</a></div>
    <div class="footer-col"><div class="footer-col-title">Wsparcie</div><a href="https://mindfullens.pl/#faq" class="interactive-el">FAQ</a><a href="https://mindfullens.pl/#kontakt" class="interactive-el">Kontakt</a></div>
    <div class="footer-col"><div class="footer-col-title">Bezpieczeństwo</div><div style="font-size:0.85rem;color:var(--t2);margin-bottom:8px;">✔️ 30-dniowa gwarancja</div><div style="font-size:0.85rem;color:var(--t2);">🔒 Bezpieczne płatności</div></div>
  </div>
  <div class="footer-bottom"><div>© 2026 MindfulLens™. Wszelkie prawa zastrzeżone.</div><div class="footer-legal"><a href="https://mindfullens.pl/regulamin" class="interactive-el">Regulamin</a><a href="https://mindfullens.pl/polityka-prywatnosci" class="interactive-el">Polityka Prywatności</a></div></div>
</footer>

<div class="modal-overlay" id="presetModal"><div class="modal-content-box" id="modalContent"></div></div>

<div class="cart-drawer" id="cartDrawer">
  <div class="cart-drawer-header"><div class="cart-drawer-title">Twój Koszyk</div><button class="modal-close interactive-el" type="button" onclick="window.toggleCart()">✕</button></div>
  <div class="cart-items" id="cartItems"><div class="cart-empty">Twój koszyk jest pusty. Odkryj naszą kolekcję.</div></div>
  <div class="cart-footer">
    <div class="cart-total"><span style="font-family:'Outfit',sans-serif;font-size:1rem;color:var(--t2);font-weight:400;">Razem</span><span id="cartTotal">0 PLN</span></div>
    <button class="hero-btn-primary interactive-el" style="width:100%;border-radius:50px;font-size:1.1rem;padding:18px;border:none;font-weight:700;text-transform:uppercase;cursor:pointer;" type="button" onclick="window.checkout()">Przejdź do kasy →</button>
  </div>
</div>
`;

export default function LandingPage() {
  const markup = useMemo(() => LANDING_MARKUP, []);

  useEffect(() => {
    document.title = 'MindfulLens™ Vibe System — Idealny vibe i estetyka dla Twoich zdjęć';

    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.setAttribute('name', 'description');
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute(
      'content',
      'MindfulLens™ Vibe System: skróć czas edycji i nadaj zdjęciom ciepły, estetyczny klimat z mocnym efektem przed/po.'
    );

    const preloader = document.getElementById('preloader');
    const cursor = document.getElementById('cursor');
    const cursorDot = document.getElementById('cursorDot');
    const scrollProgress = document.getElementById('scrollProgress');
    const scrollBtn = document.getElementById('scrollBtn');
    const scrollText = document.getElementById('scrollText');
    const nav = document.getElementById('mainNav');

    let cursorFrame = 0;
    let mouseX = 0;
    let mouseY = 0;
    let cursorX = 0;
    let cursorY = 0;
    let dotX = 0;
    let dotY = 0;

    const timers = [];
    const listeners = [];

    const addListener = (target, type, handler, options) => {
      if (!target) return;
      target.addEventListener(type, handler, options);
      listeners.push(() => target.removeEventListener(type, handler, options));
    };

    const showToast = (msg) => {
      const t = document.getElementById('appToast');
      if (!t) return;
      t.textContent = msg;
      t.style.transform = 'translateX(-50%) translateY(0)';
      t.style.opacity = '1';
      if (t._timer) {
        clearTimeout(t._timer);
      }
      t._timer = setTimeout(() => {
        t.style.transform = 'translateX(-50%) translateY(100px)';
        t.style.opacity = '0';
      }, 3000);
    };

    const hidePreloader = () => {
      if (preloader && !preloader.classList.contains('hidden')) {
        preloader.classList.add('hidden');
      }
    };

    timers.push(setTimeout(hidePreloader, 400));
    timers.push(setTimeout(hidePreloader, 2000));

    addListener(window, 'load', () => setTimeout(hidePreloader, 400));

    const animateCursor = () => {
      cursorX += (mouseX - cursorX) * 0.15;
      cursorY += (mouseY - cursorY) * 0.15;
      dotX += (mouseX - dotX) * 0.25;
      dotY += (mouseY - dotY) * 0.25;

      if (cursor) {
        cursor.style.left = `${cursorX}px`;
        cursor.style.top = `${cursorY}px`;
      }
      if (cursorDot) {
        cursorDot.style.left = `${dotX}px`;
        cursorDot.style.top = `${dotY}px`;
      }
      cursorFrame = requestAnimationFrame(animateCursor);
    };

    addListener(document, 'mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    });

    cursorFrame = requestAnimationFrame(animateCursor);

    const addHover = () => cursor?.classList.add('hover');
    const removeHover = () => cursor?.classList.remove('hover');

    const bindCursorHover = () => {
      document.querySelectorAll('a, button, .interactive-el, .preset-card, .benefit-card, .sp-card').forEach((el) => {
        addListener(el, 'mouseenter', addHover);
        addListener(el, 'mouseleave', removeHover);
      });
    };

    const checkScrollPosition = () => {
      const totalHeight = document.documentElement.scrollHeight;
      const scrollTotal = totalHeight - window.innerHeight;
      const scrollCurrent = window.scrollY;
      const scrollPercent = scrollTotal > 0 ? scrollCurrent / scrollTotal : 0;

      if (scrollProgress) {
        scrollProgress.style.width = `${scrollPercent * 100}%`;
      }

      if (nav) {
        nav.classList.toggle('scrolled', scrollCurrent > 50);
      }

      if (scrollBtn) {
        if (scrollPercent > 0.25) scrollBtn.classList.add('is-aside');
        else scrollBtn.classList.remove('is-aside');

        if (scrollCurrent + window.innerHeight >= totalHeight - 50) {
          scrollBtn.classList.add('is-flipped');
          if (scrollText) scrollText.textContent = 'DO GÓRY';
        } else {
          scrollBtn.classList.remove('is-flipped');
          if (scrollText) scrollText.textContent = 'PRZEWIŃ';
        }
      }
    };

    addListener(window, 'scroll', checkScrollPosition);
    addListener(scrollBtn, 'click', () => {
      if (!scrollBtn) return;
      if (scrollBtn.classList.contains('is-flipped')) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
      }
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    document.querySelectorAll('.fade-element').forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(24px)';
      el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
      observer.observe(el);
    });

    const initTiltEffect = () => {
      document.querySelectorAll('.tilt-element').forEach((card) => {
        addListener(card, 'mousemove', (e) => {
          const rect = card.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;
          const rotateX = ((y - centerY) / centerY) * -5;
          const rotateY = ((x - centerX) / centerX) * 5;
          card.style.transition = 'transform 0.1s ease-out';
          card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.01)`;
        });

        addListener(card, 'mouseleave', () => {
          card.style.transition = 'transform 0.5s ease';
          card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)';
        });
      });
    };

    const bindSplitSlider = ({ container, range, after, line, handle }) => {
      if (!container || !range || !after) return;

      let dragging = false;

      const applyValue = (value) => {
        const clamped = Math.max(0, Math.min(100, Number(value)));
        after.style.clipPath = `inset(0 0 0 ${clamped}%)`;
        if (line) line.style.left = `${clamped}%`;
        if (handle) handle.style.left = `${clamped}%`;
        if (String(range.value) !== String(clamped)) range.value = String(clamped);
      };

      const setFromClientX = (clientX) => {
        const rect = container.getBoundingClientRect();
        if (!rect.width) return;
        const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
        applyValue((x / rect.width) * 100);
      };

      applyValue(range.value || 50);

      addListener(range, 'input', (e) => applyValue(e.target.value));
      addListener(container, 'pointerdown', (e) => {
        dragging = true;
        setFromClientX(e.clientX);
        e.preventDefault();
      });
      addListener(container, 'pointermove', (e) => {
        if (!dragging) return;
        setFromClientX(e.clientX);
      });
      addListener(window, 'pointerup', () => {
        dragging = false;
      });
      addListener(container, 'click', (e) => {
        if (dragging) return;
        setFromClientX(e.clientX);
      });
    };

    const mainRange = document.getElementById('baRange');
    const mainAfter = document.getElementById('baAfter');
    const mainLine = document.getElementById('baLine');
    const mainHandle = document.getElementById('baHandle');
    const mainContainer = document.getElementById('baContainer');
    bindSplitSlider({
      container: mainContainer,
      range: mainRange,
      after: mainAfter,
      line: mainLine,
      handle: mainHandle,
    });

    const uniqueImages = [
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1496715976403-7e36dc43f17b?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1469334031218-e382a71b716b?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1506197603052-3cc9c3a201bd?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1513360371669-4adf3dd7dff8?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1503185912284-5271ff81b9a8?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1433086966358-54859d0ed716?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1445251836269-d158eaa028a6?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1464863979621-258859e62245?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1500917293891-ef795e70e1f6?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=80',
    ];

    const filmStyles = {
      portra: 'contrast(1.1) saturate(1.12) sepia(0.1) hue-rotate(-4deg) brightness(1.03)',
      gold: 'contrast(1.14) saturate(1.2) sepia(0.18) hue-rotate(-4deg) brightness(1.04)',
      velvia: 'contrast(1.18) saturate(1.32) brightness(1.04)',
      cinestill: 'contrast(1.14) saturate(1.16) sepia(0.1) hue-rotate(-10deg) brightness(1.01)',
      hp5: 'grayscale(1) contrast(1.28) brightness(1.04)',
      vista: 'contrast(1.12) saturate(1.18) sepia(0.16) hue-rotate(1deg) brightness(1.04)',
      ektar: 'contrast(1.18) saturate(1.28) sepia(0.08) hue-rotate(-2deg) brightness(1.03)',
      trix: 'grayscale(1) contrast(1.45) brightness(1.03)',
      superia: 'contrast(1.1) saturate(1.14) sepia(0.08) hue-rotate(3deg) brightness(1.03)',
      kodachrome: 'contrast(1.2) saturate(1.24) sepia(0.1) hue-rotate(-5deg) brightness(1.04)',
    };

    const fullPresetList = [
      { name: 'Lifestyle Kodak Portra 400', style: 'portra', cat: 'color', genre: 'Lifestyle' },
      { name: 'Vibrant Landscape 50', style: 'velvia', cat: 'color', genre: 'Krajobraz' },
      { name: 'Neon Vibe 800T', style: 'cinestill', cat: 'color', genre: 'Noc' },
      { name: 'Golden Hour 200', style: 'gold', cat: 'color', genre: 'Ciepły' },
      { name: 'Classic Noir 400', style: 'hp5', cat: 'bw', genre: 'Street B&W' },
      { name: 'Pastel Wedding 400H', style: 'vista', cat: 'color', genre: 'Śluby' },
      { name: 'Travel Vivid 100', style: 'ektar', cat: 'color', genre: 'Podróże' },
      { name: 'Moody Monochrome 400', style: 'trix', cat: 'bw', genre: 'Kontrast B&W' },
      { name: 'Everyday 400', style: 'superia', cat: 'color', genre: 'Natura' },
      { name: 'Retro Lifestyle 200', style: 'vista', cat: 'color', genre: 'Lifestyle' },
      { name: 'Vintage Classic 64', style: 'kodachrome', cat: 'color', genre: 'Classic' },
      { name: 'Clean Outdoor 100', style: 'vista', cat: 'color', genre: 'Outdoor' },
      { name: 'Cinematic Day 50D', style: 'ektar', cat: 'color', genre: 'Kino' },
      { name: 'Soft Portrait B&W', style: 'trix', cat: 'bw', genre: 'Portret B&W' },
      { name: 'Nostalgic Neg', style: 'vista', cat: 'color', genre: 'Retro' },
      { name: 'Storyteller 50D', style: 'ektar', cat: 'color', genre: 'Daylight' },
      { name: 'Fashion Editorial 160', style: 'portra', cat: 'color', genre: 'Moda' },
      { name: 'Night Push 800', style: 'portra', cat: 'color', genre: 'Noc ciepła' },
      { name: 'Pop Colors 400', style: 'ektar', cat: 'color', genre: 'Consumer' },
      { name: 'Sun-Kissed 200', style: 'gold', cat: 'color', genre: 'Złota Godzina' },
    ];

    const presetCollection = fullPresetList.map((preset, index) => ({
      id: index,
      name: preset.name,
      cat: preset.cat,
      genre: preset.genre,
      platform: 'LR / C1',
      price: 19,
      imageUrl: uniqueImages[index],
      beforeFilter:
        preset.cat === 'bw'
          ? 'contrast(0.92) saturate(0.82) brightness(0.95)'
          : 'contrast(0.92) saturate(0.82) brightness(0.95)',
      cssFilter:
        preset.cat === 'bw'
          ? 'grayscale(1) contrast(1.62) brightness(1.04)'
          : filmStyles[preset.style],
      badge: index < 3 ? 'Bestseller' : null,
    }));

    let currentFilter = 'all';
    const cart = [];

    const updateCartUI = () => {
      const container = document.getElementById('cartItems');
      const totalEl = document.getElementById('cartTotal');
      const badge = document.getElementById('cartCount');
      if (!container || !totalEl || !badge) return;

      badge.textContent = String(cart.length);

      if (cart.length === 0) {
        container.innerHTML = '<div class="cart-empty">Twój koszyk jest pusty. Wybierz z oferty.</div>';
        totalEl.textContent = '0 PLN';
        return;
      }

      let total = 0;
      container.innerHTML = cart
        .map((item, i) => {
          total += item.price;
          return `<div class="cart-item"><div class="cart-item-info"><h4 style="font-family:'Outfit',sans-serif;font-size:1rem;color:var(--t1);margin-bottom:4px;">${item.name}</h4><div style="font-family:'JetBrains Mono',monospace;color:var(--film);font-size:0.85rem;">${item.price} PLN</div></div><button class="cart-item-remove interactive-el" onclick="window.removeFromCart(${i})">Usuń</button></div>`;
        })
        .join('');

      totalEl.textContent = `${total} PLN`;
      bindCursorHover();
    };

    const initCardSliders = () => {
      document.querySelectorAll('.preset-card').forEach((card) => {
        const container = card.querySelector('.card-ba-container');
        const after = card.querySelector('.card-ba-after');
        const handle = card.querySelector('.card-ba-handle');
        const range = card.querySelector('.card-ba-range');
        bindSplitSlider({ container, range, after, handle });
      });
    };

    const openPresetModal = (id) => {
      const p = presetCollection.find((item) => item.id === Number(id));
      const modalC = document.getElementById('modalContent');
      const modal = document.getElementById('presetModal');
      if (!p || !modalC || !modal) return;

      modalC.innerHTML = `<button class="modal-close interactive-el" onclick="window.closePresetModal()">✕</button><div style="aspect-ratio:16/10;border-radius:12px;margin-bottom:24px;background:url('${p.imageUrl}') center/cover;filter:${p.cssFilter};"></div><h3 style="font-family:'Instrument Serif',serif;font-size:2rem;margin-bottom:10px;">${p.name} Profil</h3><p style="color:var(--t2);font-size:0.95rem;margin-bottom:24px;">Pojedynczy profil kosztuje 19 PLN.</p><button class="hero-btn-primary interactive-el" style="width:100%;border-radius:12px;padding:18px;margin-bottom:10px;border:none;cursor:pointer;" onclick="window.addToCart('${p.name}', ${p.price}); window.closePresetModal();">Dodaj do koszyka za ${p.price} PLN →</button><button class="interactive-el" style="width:100%;border-radius:12px;padding:18px;text-align:center;border:1px solid var(--border-h);background:transparent;color:var(--t1);cursor:pointer;" onclick="window.closePresetModal(); window.scrollToPresets();">Zobacz więcej profili</button>`;
      modal.classList.add('open');
      bindCursorHover();
    };

    const renderPresets = () => {
      const grid = document.getElementById('presetGrid');
      if (!grid) return;

      let filtered = presetCollection;
      if (currentFilter === 'color') filtered = presetCollection.filter((p) => p.cat === 'color');
      else if (currentFilter === 'bw') filtered = presetCollection.filter((p) => p.cat === 'bw');

      grid.innerHTML = filtered
        .map(
          (p) => `<div class="preset-card fade-element interactive-el tilt-element">
          ${p.badge ? `<div class="preset-badge">${p.badge}</div>` : ''}
          <div class="card-ba-container" id="container-${p.id}">
            <div class="card-ba-side card-ba-before" style="background-image:url('${p.imageUrl}');filter:${p.beforeFilter};"></div>
            <div class="card-ba-side card-ba-after" style="background-image:url('${p.imageUrl}');filter:${p.cssFilter};"></div>
            <span class="card-ba-label-static">ORYGINAŁ</span>
            <div class="card-ba-handle"><span class="card-ba-label-move ${p.badge === 'Bestseller' ? 'label-bottom' : ''}">PROFIL</span></div>
            <input type="range" min="0" max="100" value="50" class="ba-range-input card-ba-range">
          </div>
          <div class="preset-info" onclick="window.openPresetModal(${p.id})"><div class="preset-name">${p.name}</div><div class="preset-meta"><span class="preset-genre">${p.genre}</span><span class="preset-type">${p.platform}</span></div></div>
          <div class="preset-action-area"><button class="hero-btn-primary interactive-el" onclick="window.addToCart('${p.name}', ${p.price})">Dodaj do koszyka – ${p.price} PLN</button></div>
        </div>`
        )
        .join('');

      initCardSliders();
      initTiltEffect();
      bindCursorHover();
    };

    window.scrollToPresets = () => {
      const el = document.getElementById('presets');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    };

    window.toggleMobileMenu = () => {
      document.getElementById('navLinks')?.classList.toggle('active');
    };

    window.toggleDropdown = (e) => {
      e?.stopPropagation?.();
      document.getElementById('toolsDropdown')?.classList.toggle('open');
    };

    window.toggleCart = () => {
      document.getElementById('cartDrawer')?.classList.toggle('open');
    };

    window.addToCart = (name, price) => {
      if (!cart.some((item) => item.name === name)) {
        cart.push({ name, price: Number(price) });
        updateCartUI();
        const badge = document.getElementById('cartCount');
        if (badge) {
          badge.classList.add('bump');
          setTimeout(() => badge.classList.remove('bump'), 300);
        }
        showToast(`${name} dodany do koszyka!`);
      }
      document.getElementById('cartDrawer')?.classList.add('open');
    };

    window.removeFromCart = (index) => {
      cart.splice(Number(index), 1);
      updateCartUI();
    };

    window.checkout = () => {
      if (cart.length > 0) {
        window.location.href = 'https://mindfullens.pl/cennik/';
      } else {
        showToast('Koszyk jest pusty!');
      }
    };

    window.filterPresets = (filter, buttonEl) => {
      currentFilter = filter;
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      if (buttonEl) buttonEl.classList.add('active');
      renderPresets();
    };

    window.openPresetModal = openPresetModal;

    window.closePresetModal = () => {
      document.getElementById('presetModal')?.classList.remove('open');
    };

    addListener(document, 'click', (e) => {
      const dd = document.getElementById('toolsDropdown');
      if (dd && !dd.contains(e.target)) dd.classList.remove('open');
    });

    bindCursorHover();
    renderPresets();
    initTiltEffect();
    checkScrollPosition();

    const isFilmLabHrefSameApp = (href) => {
      const s = String(href || '');
      if (s.startsWith('/')) {
        return true;
      }
      try {
        return new URL(s, window.location.href).origin === window.location.origin;
      } catch {
        return false;
      }
    };

    if (isFilmLabHrefSameApp(FILM_LAB_HREF)) {
      const warm = () => {
        void prefetchFilmLabRoute();
      };
      document.querySelectorAll('a[href]').forEach((a) => {
        if ((a.getAttribute('href') || '') === FILM_LAB_HREF) {
          addListener(a, 'pointerenter', warm);
          addListener(a, 'focusin', warm);
        }
      });
    }

    return () => {
      cancelAnimationFrame(cursorFrame);
      listeners.forEach((off) => off());
      timers.forEach((timer) => clearTimeout(timer));
      observer.disconnect();

      delete window.scrollToPresets;
      delete window.toggleMobileMenu;
      delete window.toggleDropdown;
      delete window.toggleCart;
      delete window.addToCart;
      delete window.removeFromCart;
      delete window.checkout;
      delete window.filterPresets;
      delete window.openPresetModal;
      delete window.closePresetModal;
    };
  }, []);

  return <div dangerouslySetInnerHTML={{ __html: markup }} />;
}
