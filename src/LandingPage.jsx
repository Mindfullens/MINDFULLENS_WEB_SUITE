import { useEffect, useMemo } from 'react';
import { useI18n } from './i18n';
import { buildLandingMarkup } from './landing/buildLandingMarkup.js';
import { prefetchFilmLabRoute } from './prefetchFilmLabRoute.js';
import './landingPage.css';

/** W dev używamy tej samej aplikacji (`App` → `/film-lab`); na produkcji zostaje pełny URL marketingowy. */
const FILM_LAB_HREF = import.meta.env.DEV ? '/film-lab' : 'https://mindfullens.pl/film-lab/';

export default function LandingPage() {
  const { t } = useI18n();
  const markup = useMemo(() => buildLandingMarkup(t, FILM_LAB_HREF), [t]);

  useEffect(() => {
    document.title = t('landing.meta.title');

    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.setAttribute('name', 'description');
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute('content', t('landing.meta.description'));

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
      const toastRoot = document.getElementById('appToast');
      if (!toastRoot) return;
      toastRoot.textContent = msg;
      toastRoot.style.transform = 'translateX(-50%) translateY(0)';
      toastRoot.style.opacity = '1';
      if (toastRoot._timer) {
        clearTimeout(toastRoot._timer);
      }
      toastRoot._timer = setTimeout(() => {
        toastRoot.style.transform = 'translateX(-50%) translateY(100px)';
        toastRoot.style.opacity = '0';
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
          if (scrollText) scrollText.textContent = t('landing.scroll.toTop');
        } else {
          scrollBtn.classList.remove('is-flipped');
          if (scrollText) scrollText.textContent = t('landing.scroll.page');
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
      badge: index < 3 ? t('landing.preset.bestseller') : null,
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
        container.innerHTML = `<div class="cart-empty">${t('landing.cart.emptyUpdate')}</div>`;
        totalEl.textContent = '0 PLN';
        return;
      }

      let total = 0;
      container.innerHTML = cart
        .map((item, i) => {
          total += item.price;
          return `<div class="cart-item"><div class="cart-item-info"><h4 style="font-family:'Outfit',sans-serif;font-size:1rem;color:var(--t1);margin-bottom:4px;">${item.name}</h4><div style="font-family:'JetBrains Mono',monospace;color:var(--film);font-size:0.85rem;">${item.price} PLN</div></div><button class="cart-item-remove interactive-el" onclick="window.removeFromCart(${i})">${t('landing.cart.remove')}</button></div>`;
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

      modalC.innerHTML = `<button class="modal-close interactive-el" onclick="window.closePresetModal()">✕</button><div style="aspect-ratio:16/10;border-radius:12px;margin-bottom:24px;background:url('${p.imageUrl}') center/cover;filter:${p.cssFilter};"></div><h3 style="font-family:'Instrument Serif',serif;font-size:2rem;margin-bottom:10px;">${p.name} ${t('landing.modal.profileSuffix')}</h3><p style="color:var(--t2);font-size:0.95rem;margin-bottom:24px;">${t('landing.modal.priceLine')}</p><button class="hero-btn-primary interactive-el" style="width:100%;border-radius:12px;padding:18px;margin-bottom:10px;border:none;cursor:pointer;" onclick="window.addToCart('${p.name}', ${p.price}); window.closePresetModal();">${t('landing.modal.addForPrice', { price: p.price })}</button><button class="interactive-el" style="width:100%;border-radius:12px;padding:18px;text-align:center;border:1px solid var(--border-h);background:transparent;color:var(--t1);cursor:pointer;" onclick="window.closePresetModal(); window.scrollToPresets();">${t('landing.modal.moreProfiles')}</button>`;
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
            <span class="card-ba-label-static">${t('landing.preset.original')}</span>
            <div class="card-ba-handle"><span class="card-ba-label-move ${p.badge ? 'label-bottom' : ''}">${t('landing.preset.profile')}</span></div>
            <input type="range" min="0" max="100" value="50" class="ba-range-input card-ba-range">
          </div>
          <div class="preset-info" onclick="window.openPresetModal(${p.id})"><div class="preset-name">${p.name}</div><div class="preset-meta"><span class="preset-genre">${p.genre}</span><span class="preset-type">${p.platform}</span></div></div>
          <div class="preset-action-area"><button class="hero-btn-primary interactive-el" onclick="window.addToCart('${p.name}', ${p.price})">${t('landing.preset.addCart', { price: p.price })}</button></div>
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
        showToast(t('landing.toast.added', { name }));
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
        showToast(t('landing.toast.cartEmpty'));
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
  }, [t]);

  return <div dangerouslySetInnerHTML={{ __html: markup }} />;
}
