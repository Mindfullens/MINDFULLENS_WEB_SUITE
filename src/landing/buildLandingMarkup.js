/**
 * Statyczny HTML landingu marketingowego — teksty z katalogu i18n (`pl.json`),
 * żeby później dodać kolejne locale bez przepisywania komponentu.
 */
export function buildLandingMarkup(t, filmLabHref) {
  return `
<div id="appToast"></div>
<div class="cursor" id="cursor"></div>
<div class="cursor-dot" id="cursorDot"></div>

<div class="preloader" id="preloader">
  <div class="preloader__breath-container">
    <div class="preloader__breath-wave"></div>
    <div class="preloader__breath-wave" style="animation-delay: 1.3s;"></div>
    <div class="preloader__breath-core"></div>
  </div>
  <span class="preloader__text">${t('landing.preloader')}</span>
</div>

<div class="scroll-progress" id="scrollProgress"></div>
<button id="scrollBtn" class="scroll-indicator-btn interactive-el" type="button">
  <div class="scroll-indicator__mouse"></div>
  <span id="scrollText" class="scroll-indicator__text">${t('landing.scrollBtn')}</span>
</button>

<nav class="nav" id="mainNav">
  <div class="nav-inner">
    <a href="https://mindfullens.pl/" class="nav-logo interactive-el">
      <img src="/logo.png" alt="${t('landing.logoAlt')}">
      MindfulLens™
    </a>
    <div class="nav-links" id="navLinks">
      <a href="#presets" class="nav-link interactive-el">${t('landing.nav.presetsCatalog')}</a>
      <div class="nav-dropdown" id="toolsDropdown">
        <button class="nav-dropdown-trigger interactive-el" type="button" onclick="window.toggleDropdown(event)">
          ${t('landing.nav.tools')} <span class="nav-dropdown-arrow">▾</span>
        </button>
        <div class="mega-menu">
          <div class="mega-menu-grid">
            <a href="${filmLabHref}" class="mega-item interactive-el"><div class="mega-item-icon">⚗️</div><div class="mega-item-text"><div class="mega-item-name">Film Lab <span class="mega-item-tag mega-item-tag-free">${t('landing.mega.tagFree')}</span></div><div class="mega-item-desc">${t('landing.mega.filmLabDesc')}</div></div></a>
            <a href="https://mindfullens.pl/live/" class="mega-item interactive-el"><div class="mega-item-icon">📸</div><div class="mega-item-text"><div class="mega-item-name">Live Cam <span class="mega-item-tag mega-item-tag-free">${t('landing.mega.tagFree')}</span></div><div class="mega-item-desc">${t('landing.mega.liveCamDesc')}</div></div></a>
            <a href="https://mindfullens.pl/matcher/" class="mega-item interactive-el"><div class="mega-item-icon">🧠</div><div class="mega-item-text"><div class="mega-item-name">AI Matcher <span class="mega-item-tag mega-item-tag-pro">${t('landing.mega.tagAi')}</span></div><div class="mega-item-desc">${t('landing.mega.matcherDesc')}</div></div></a>
            <a href="https://mindfullens.pl/timemachine/" class="mega-item interactive-el"><div class="mega-item-icon">⏳</div><div class="mega-item-text"><div class="mega-item-name">Time Machine <span class="mega-item-tag mega-item-tag-new">${t('landing.mega.tagNew')}</span></div><div class="mega-item-desc">${t('landing.mega.timeMachineDesc')}</div></div></a>
            <a href="https://mindfullens.pl/ciemnia/" class="mega-item interactive-el"><div class="mega-item-icon">🧪</div><div class="mega-item-text"><div class="mega-item-name">Recipe Lab <span class="mega-item-tag mega-item-tag-new">${t('landing.mega.tagNew')}</span></div><div class="mega-item-desc">${t('landing.mega.recipeLabDesc')}</div></div></a>
            <a href="https://mindfullens.pl/blendstudio/" class="mega-item interactive-el"><div class="mega-item-icon">⚗️</div><div class="mega-item-text"><div class="mega-item-name">Blend Studio <span class="mega-item-tag mega-item-tag-new">${t('landing.mega.tagNew')}</span></div><div class="mega-item-desc">${t('landing.mega.blendStudioDesc')}</div></div></a>
            <a href="https://mindfullens.pl/contact-sheet/" class="mega-item interactive-el"><div class="mega-item-icon">🎞️</div><div class="mega-item-text"><div class="mega-item-name">Contact Sheet</div><div class="mega-item-desc">${t('landing.mega.contactSheetDesc')}</div></div></a>
            <a href="https://mindfullens.pl/color-sync/" class="mega-item interactive-el"><div class="mega-item-icon">🔄</div><div class="mega-item-text"><div class="mega-item-name">Color Sync <span class="mega-item-tag mega-item-tag-pro">${t('landing.mega.tagPro')}</span></div><div class="mega-item-desc">${t('landing.mega.colorSyncDesc')}</div></div></a>
          </div>
          <div class="mega-footer"><span class="mega-footer-text">${t('landing.nav.megaFooter')}</span><a href="#presets" class="mega-footer-btn interactive-el" onclick="window.scrollToPresets(); return false;">${t('landing.nav.megaCatalogBtn')}</a></div>
        </div>
      </div>
      <a href="https://mindfullens.pl/camera-settings-app" class="nav-link interactive-el">${t('landing.nav.cameraApp')}</a>
      <a href="https://mindfullens.pl/analog-signature/" class="nav-link nav-link-red interactive-el">Analog Signature</a>
    </div>
    <div style="display:flex;align-items:center;gap:12px">
      <button class="nav-mobile-toggle interactive-el" type="button" onclick="window.toggleMobileMenu()" aria-label="${t('landing.nav.menuAria')}">☰</button>
      <button class="nav-cta interactive-el" type="button" onclick="window.toggleCart()">${t('landing.nav.cart')} <span class="cart-count" id="cartCount">0</span></button>
    </div>
  </div>
</nav>

<section class="hero" id="hero">
  <div class="hero-bg">
    <div class="hero-orb hero-orb-1"></div>
    <div class="hero-orb hero-orb-2"></div>
  </div>
  <div class="hero-content">
    <div class="hero-badge"><span style="width:6px;height:6px;background:var(--film3);border-radius:50%;display:inline-block;animation:textPulse 2s infinite;"></span> <span class="brand-orange">${t('landing.hero.badge')}</span></div>
    <h1><span class="brand-orange">${t('landing.hero.titleLine1')}</span><br><em>${t('landing.hero.taglineEm')}</em></h1>
    <p class="hero-sub">${t('landing.hero.subtitle')}</p>
    <div class="hero-ctas">
      <a href="#presets" class="hero-btn hero-btn-primary interactive-el" onclick="window.scrollToPresets(); return false;">${t('landing.hero.ctaPrimary')}</a>
      <a href="#presets" class="hero-btn interactive-el" style="border:1px solid var(--border-h);background:transparent;color:var(--t1);">${t('landing.hero.ctaSecondary')}</a>
    </div>
  </div>
</section>

<section class="problem-solution fade-element">
  <span class="section-tag">${t('landing.problem.tag')}</span>
  <h2 class="section-title">${t('landing.problem.titleHtml')}</h2>
  <div class="ps-content">
    <p>${t('landing.problem.p1')}</p>
    <p><strong>${t('landing.problem.p2strong')}</strong></p>
    <p>${t('landing.problem.p3')}</p>
  </div>
</section>

<section style="padding-top:0" class="fade-element">
  <div class="ba-container interactive-el" id="baContainer">
    <div class="ba-side ba-before"></div>
    <div class="ba-side ba-after" id="baAfter"></div>
    <div class="ba-slider-line" id="baLine"></div>
    <div class="ba-slider-handle" id="baHandle"></div>
    <input type="range" min="0" max="100" value="50" class="ba-range-input" id="baRange" aria-label="${t('landing.ba.aria')}">
    <span class="ba-label ba-label-before">${t('landing.ba.before')}</span>
    <span class="ba-label ba-label-after">${t('landing.ba.after')}</span>
  </div>
</section>

<section class="benefits fade-element">
  <div class="section-header">
    <span class="section-tag">${t('landing.benefits.tag')}</span>
    <h2 class="section-title">${t('landing.benefits.titleHtml')}</h2>
    <p class="section-desc">${t('landing.benefits.desc')}</p>
  </div>
  <div class="benefits-grid">
    <div class="benefit-card tilt-element interactive-el"><div class="benefit-icon">⏳</div><h3 class="benefit-title">${t('landing.benefits.card1Title')}</h3><p class="benefit-desc">${t('landing.benefits.card1Desc')}</p></div>
    <div class="benefit-card tilt-element interactive-el"><div class="benefit-icon">✨</div><h3 class="benefit-title">${t('landing.benefits.card2Title')}</h3><p class="benefit-desc">${t('landing.benefits.card2Desc')}</p></div>
    <div class="benefit-card tilt-element interactive-el"><div class="benefit-icon">🎯</div><h3 class="benefit-title">${t('landing.benefits.card3Title')}</h3><p class="benefit-desc">${t('landing.benefits.card3Desc')}</p></div>
  </div>
</section>

<section id="presets" class="fade-element">
  <div class="section-header">
    <span class="section-tag">${t('landing.presets.tag')}</span>
    <h2 class="section-title">${t('landing.presets.titleHtml')}</h2>
    <p class="section-desc" style="margin-bottom:10px;">${t('landing.presets.desc1')}</p>
    <p class="section-desc" style="margin-bottom:10px;">${t('landing.presets.desc2')}</p>
    <p class="section-desc" style="margin-bottom:20px;line-height:1.9;">${t('landing.presets.desc3').replace(/\n/g, '<br>')}</p>
  </div>

  <div class="preset-filters">
    <button class="filter-btn active interactive-el" type="button" onclick="window.filterPresets('all', this)">${t('landing.presets.filterCurated')}</button>
    <button class="filter-btn interactive-el" type="button" onclick="window.filterPresets('color', this)">${t('landing.presets.filterColor')}</button>
    <button class="filter-btn interactive-el" type="button" onclick="window.filterPresets('bw', this)">${t('landing.presets.filterBw')}</button>
  </div>

  <div class="preset-grid" id="presetGrid"></div>
</section>

<section class="social-proof fade-element">
  <div class="section-header">
    <span class="section-tag">${t('landing.social.tag')}</span>
    <h2 class="section-title">${t('landing.social.titleHtml')}</h2>
  </div>
  <div class="sp-grid">
    <div class="sp-card tilt-element interactive-el"><div class="sp-stars">★★★★★</div><p class="sp-text">${t('landing.social.quote1')}</p><div class="sp-author"><div class="sp-avatar">M</div><div><div class="sp-name">Michał K.</div><div class="sp-role">${t('landing.social.role1')}</div></div></div></div>
    <div class="sp-card tilt-element interactive-el"><div class="sp-stars">★★★★★</div><p class="sp-text">${t('landing.social.quote2')}</p><div class="sp-author"><div class="sp-avatar">A</div><div><div class="sp-name">Anna S.</div><div class="sp-role">${t('landing.social.role2')}</div></div></div></div>
    <div class="sp-card tilt-element interactive-el"><div class="sp-stars">★★★★★</div><p class="sp-text">${t('landing.social.quote3')}</p><div class="sp-author"><div class="sp-avatar">T</div><div><div class="sp-name">Tomasz W.</div><div class="sp-role">${t('landing.social.role3')}</div></div></div></div>
  </div>
</section>

<section class="security fade-element">
  <div class="section-header">
    <span class="section-tag">${t('landing.security.tag')}</span>
    <h2 class="section-title">${t('landing.security.titleHtml')}</h2>
  </div>
  <div class="sec-grid">
    <div class="sec-item interactive-el"><div class="sec-icon">⚡</div><h3 class="sec-title">${t('landing.security.instantTitle')}</h3><p class="sec-desc">${t('landing.security.instantDesc')}</p></div>
    <div class="sec-item interactive-el"><div class="sec-icon">🔒</div><h3 class="sec-title">${t('landing.security.payTitle')}</h3><p class="sec-desc">${t('landing.security.payDesc')}</p></div>
    <div class="sec-item interactive-el"><div class="sec-icon">🛡️</div><h3 class="sec-title">${t('landing.security.supportTitle')}</h3><p class="sec-desc">${t('landing.security.supportDesc')}</p></div>
  </div>
</section>

<footer class="footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <a href="#hero" class="nav-logo interactive-el">
        <img src="/logo.png" alt="${t('landing.logoAlt')}">
        MindfulLens™
      </a>
      <p class="footer-desc">${t('landing.footer.desc')}</p>
    </div>
    <div class="footer-col"><div class="footer-col-title">${t('landing.footer.tools')}</div><a href="#presets" class="interactive-el">${t('landing.footer.presetsCollection')}</a><a href="${filmLabHref}" class="interactive-el">Film Lab</a></div>
    <div class="footer-col"><div class="footer-col-title">${t('landing.footer.support')}</div><a href="https://mindfullens.pl/#faq" class="interactive-el">${t('landing.footer.faq')}</a><a href="https://mindfullens.pl/#kontakt" class="interactive-el">${t('landing.footer.contact')}</a></div>
    <div class="footer-col"><div class="footer-col-title">${t('landing.footer.security')}</div><div style="font-size:0.85rem;color:var(--t2);margin-bottom:8px;">${t('landing.footer.guarantee30')}</div><div style="font-size:0.85rem;color:var(--t2);">${t('landing.footer.securePay')}</div></div>
  </div>
  <div class="footer-bottom"><div>${t('landing.footer.copyright')}</div><div class="footer-legal"><a href="https://mindfullens.pl/regulamin" class="interactive-el">${t('landing.footer.terms')}</a><a href="https://mindfullens.pl/polityka-prywatnosci" class="interactive-el">${t('landing.footer.privacy')}</a></div></div>
</footer>

<div class="modal-overlay" id="presetModal"><div class="modal-content-box" id="modalContent"></div></div>

<div class="cart-drawer" id="cartDrawer">
  <div class="cart-drawer-header"><div class="cart-drawer-title">${t('landing.cart.title')}</div><button class="modal-close interactive-el" type="button" onclick="window.toggleCart()">✕</button></div>
  <div class="cart-items" id="cartItems"><div class="cart-empty">${t('landing.cart.emptyDrawer')}</div></div>
  <div class="cart-footer">
    <div class="cart-total"><span style="font-family:'Outfit',sans-serif;font-size:1rem;color:var(--t2);font-weight:400;">${t('landing.cart.total')}</span><span id="cartTotal">0 PLN</span></div>
    <button class="hero-btn-primary interactive-el" style="width:100%;border-radius:50px;font-size:1.1rem;padding:18px;border:none;font-weight:700;text-transform:uppercase;cursor:pointer;" type="button" onclick="window.checkout()">${t('landing.cart.checkout')}</button>
  </div>
</div>
`;
}
