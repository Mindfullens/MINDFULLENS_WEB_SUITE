import { useEffect, useMemo, useRef, useState } from 'react';
import { useFilmLabEngine } from './engine/useFilmLabEngine';
import { filmStocks } from './engine/filmProfiles';
import { FILE_INPUT_ACCEPT } from './engine/pipeline/constants.js';
import { buildCurveLut } from './engine/curveInterpolation.js';
import './ciemniaPage.css';

const DEFAULT_CURVES = {
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

const DEFAULT_ADJUSTMENTS = {
  strength: 100,
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  level: 0,
  cropZoom: 100,
  cropX: 0,
  cropY: 0,
  fade: 0,
  clarity: 0,
  dehaze: 0,
  temp: 0,
  tint: 0,
  saturation: 0,
  vibrance: 0,
  curveLumaMix: 72,
  userGrain: 0,
  userGrainSize: 50,
  userVignette: 0,
  leak: 'none',
  frame: 'none',
  chromAb: 0,
  bloom: 0,
  dust: 0,
  dustVariant: -1,
  dustCycle: 0,
  rawLeakVariant: -1,
  rawLeakCycle: 0,
  frameVariant: -1,
  frameCycle: 0,
  halation: 0,
  halRadius: 30,
  halThresh: 200,
  halHue: 0,
  anamorph: 0,
  streakLen: 50,
  flipped: false,
  rotation: 0,
  compareMode: false,
  compareX: 0.5,
};

const BASE_PRESETS = [
  {
    name: 'Neutral',
    adjustments: {
      temp: 0,
      tint: 0,
      contrast: 0,
      blacks: 0,
      fade: 0,
      saturation: 0,
      vibrance: 0,
      userGrain: 0,
      userVignette: 0,
    },
    split: { high: 0, shad: 0, highColor: '#e8c878', shadColor: '#5d7898' },
  },
  {
    name: 'Portra Look',
    adjustments: {
      temp: 10,
      tint: 0,
      contrast: 5,
      blacks: 12,
      fade: 5,
      saturation: -8,
      vibrance: 8,
      userGrain: 15,
      userVignette: 10,
    },
    split: { high: 0, shad: 0, highColor: '#e8c878', shadColor: '#5d7898' },
  },
  {
    name: 'Cinematic',
    adjustments: {
      temp: -20,
      tint: 0,
      contrast: -5,
      blacks: 15,
      fade: 8,
      saturation: -10,
      vibrance: 10,
      userGrain: 20,
      userVignette: 15,
    },
    split: { high: 10, shad: 15, highColor: '#e8c878', shadColor: '#5d7898' },
  },
  {
    name: 'Velvia Pop',
    adjustments: {
      temp: -3,
      tint: 0,
      contrast: 15,
      blacks: 0,
      fade: 0,
      saturation: 15,
      vibrance: 40,
      userGrain: 8,
      userVignette: 5,
    },
    split: { high: 0, shad: 0, highColor: '#e8c878', shadColor: '#5d7898' },
  },
  {
    name: 'BW Classic',
    adjustments: {
      temp: 0,
      tint: 0,
      contrast: 45,
      blacks: 5,
      fade: 0,
      saturation: -100,
      vibrance: 0,
      userGrain: 25,
      userVignette: 12,
    },
    split: { high: 0, shad: 0, highColor: '#e8c878', shadColor: '#5d7898' },
  },
  {
    name: 'Lo-Fi Vintage',
    adjustments: {
      temp: 18,
      tint: 3,
      contrast: 8,
      blacks: 20,
      fade: 15,
      saturation: -5,
      vibrance: 12,
      userGrain: 30,
      userVignette: 18,
    },
    split: { high: 15, shad: 10, highColor: '#e8c878', shadColor: '#5d7898' },
  },
  {
    name: 'Pastel Dream',
    adjustments: {
      temp: 5,
      tint: -5,
      contrast: -10,
      blacks: 15,
      fade: 12,
      saturation: -15,
      vibrance: 5,
      userGrain: 10,
      userVignette: 8,
    },
    split: { high: 8, shad: 5, highColor: '#e8c878', shadColor: '#5d7898' },
  },
  {
    name: 'Cross Process',
    adjustments: {
      temp: -15,
      tint: 10,
      contrast: 20,
      blacks: 8,
      fade: 0,
      saturation: 15,
      vibrance: 20,
      userGrain: 18,
      userVignette: 10,
    },
    split: { high: 20, shad: 20, highColor: '#e8c878', shadColor: '#5d7898' },
  },
];

function cloneCurves(curves) {
  return {
    rgb: curves.rgb.map((point) => [...point]),
    r: curves.r.map((point) => [...point]),
    g: curves.g.map((point) => [...point]),
    b: curves.b.map((point) => [...point]),
  };
}

function clamp(value, min = 0, max = 255) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function buildLUT(points, interpolation = 'smooth') {
  const interpolationMode = interpolation === 'linear' ? 'linear' : 'monotonic';
  return buildCurveLut(points, {
    resolution: 256,
    interpolation: interpolationMode,
    round: true,
  });
}

function hexToHue(hex) {
  const safeHex = String(hex || '#000000').replace('#', '');
  if (safeHex.length !== 6) {
    return 0;
  }

  const red = parseInt(safeHex.slice(0, 2), 16) / 255;
  const green = parseInt(safeHex.slice(2, 4), 16) / 255;
  const blue = parseInt(safeHex.slice(4, 6), 16) / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  if (delta === 0) {
    return 0;
  }

  let hue;
  if (max === red) {
    hue = (green - blue) / delta;
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }

  hue *= 60;
  if (hue < 0) {
    hue += 360;
  }

  return Math.round(hue);
}

function drawCurvesPreview(curvesCanvas, userCurves, activeCurveCh) {
  if (!curvesCanvas) {
    return;
  }

  const context = curvesCanvas.getContext('2d');
  if (!context) {
    return;
  }

  const width = curvesCanvas.width;
  const height = curvesCanvas.height;
  const colors = {
    rgb: '#c4944e',
    r: '#e85d5d',
    g: '#5de88a',
    b: '#5d8ae8',
  };

  context.clearRect(0, 0, width, height);
  context.strokeStyle = 'rgba(255,255,255,0.06)';
  context.lineWidth = 1;

  for (let index = 1; index < 4; index += 1) {
    context.beginPath();
    context.moveTo((index * width) / 4, 0);
    context.lineTo((index * width) / 4, height);
    context.stroke();

    context.beginPath();
    context.moveTo(0, (index * height) / 4);
    context.lineTo(width, (index * height) / 4);
    context.stroke();
  }

  context.strokeStyle = 'rgba(255,255,255,0.1)';
  context.beginPath();
  context.moveTo(0, height);
  context.lineTo(width, 0);
  context.stroke();

  const points = userCurves[activeCurveCh];
  const lut = buildLUT(points, 'monotonic');

  context.beginPath();
  context.strokeStyle = colors[activeCurveCh] ?? colors.rgb;
  context.lineWidth = 1.5;

  for (let index = 0; index < 256; index += 1) {
    const x = (index / 255) * width;
    const y = height - (lut[index] / 255) * height;
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }

  context.stroke();

  points.forEach((point) => {
    context.beginPath();
    context.arc((point[0] / 255) * width, height - (point[1] / 255) * height, 4, 0, Math.PI * 2);
    context.fillStyle = colors[activeCurveCh] ?? colors.rgb;
    context.fill();
    context.strokeStyle = 'rgba(0,0,0,0.5)';
    context.lineWidth = 1;
    context.stroke();
  });
}

function formatSigned(value) {
  if (value === 0) {
    return '0';
  }
  return value > 0 ? `+${value}` : `${value}`;
}

function formatPercent(value) {
  return `${Math.round(value)}%`;
}

export default function CiemniaPage() {
  const fileInputRef = useRef(null);
  const curvesCanvasRef = useRef(null);
  const dragMetaRef = useRef({
    active: false,
    index: null,
  });

  const [isPreloaderHidden, setIsPreloaderHidden] = useState(false);
  const [isToolsDropdownOpen, setIsToolsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [activeCurveCh, setActiveCurveCh] = useState('rgb');

  const [imageUrl, setImageUrl] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);

  const [activeBasePreset, setActiveBasePreset] = useState('Neutral');

  const [userCurves, setUserCurves] = useState(() => cloneCurves(DEFAULT_CURVES));
  const [adjustments, setAdjustments] = useState(() => ({ ...DEFAULT_ADJUSTMENTS }));

  const [stHighColor, setStHighColor] = useState('#e8c878');
  const [stShadColor, setStShadColor] = useState('#5d7898');
  const [stHigh, setStHigh] = useState(0);
  const [stShad, setStShad] = useState(0);

  const [historyList, setHistoryList] = useState([]);
  const [cart, setCart] = useState([]);
  const [toast, setToast] = useState('');

  const [colorGrading, setColorGrading] = useState({
    shadows: { hue: 0, saturation: 0, luminance: 0 },
    midtones: { hue: 0, saturation: 0, luminance: 0 },
    highlights: { hue: 0, saturation: 0, luminance: 0 },
    global: { hue: 0, saturation: 0 },
    blending: 50,
    balance: 0,
  });

  const activeFilm = filmStocks[0];

  const engineAdjustments = useMemo(
    () => ({
      ...adjustments,
      userCurves,
      userColorGrade: colorGrading,
      isAdjusting: false,
      interactionKind: 'idle',
    }),
    [adjustments, colorGrading, userCurves]
  );

  const { canvasRef, imageMeta, exportImage } = useFilmLabEngine(
    imageUrl,
    uploadedFile,
    activeFilm,
    engineAdjustments
  );

  const hasImage = Boolean(imageMeta);

  const aiMatch = useMemo(() => {
    if (!hasImage) {
      return {
        name: 'Wgraj zdjęcie, aby rozpocząć',
        similarity: null,
        sentence:
          'Wgraj zdjęcie i zacznij modyfikować parametry — podpowiem, którą kliszę przypomina Twoja receptura.',
      };
    }

    const target = {
      temp: adjustments.temp,
      tint: adjustments.tint,
      contrast: adjustments.contrast,
      fade: adjustments.fade,
      saturation: adjustments.saturation,
      vibrance: adjustments.vibrance,
      blacks: adjustments.blacks,
      userGrain: adjustments.userGrain,
      userVignette: adjustments.userVignette,
    };

    let best = { name: 'Twoja unikalna receptura', dist: Number.POSITIVE_INFINITY };

    filmStocks.forEach((film, index) => {
      if (index === 0) {
        return;
      }

      const dist =
        Math.abs((target.temp || 0) - (film.temperature || 0)) * 0.8 +
        Math.abs((target.tint || 0) - (film.tint || 0)) * 0.5 +
        Math.abs((target.contrast || 0) - (film.contrast || 0)) * 0.6 +
        Math.abs((target.fade || 0) - (film.fade || 0)) * 0.4 +
        Math.abs((target.saturation || 0) - (film.saturation || 0)) * 0.45 +
        Math.abs((target.vibrance || 0) - (film.vibrance || 0)) * 0.45 +
        Math.abs((target.blacks || 0) - (film.blacks || 0)) * 0.35 +
        Math.abs((target.userGrain || 0) - (film.defaultGrainAmount || 0)) * 0.3 +
        Math.abs((target.userVignette || 0) - (film.vignette || 0)) * 0.25;

      if (dist < best.dist) {
        best = { name: film.name, dist };
      }
    });

    const similarity = Math.max(0, Math.min(98, Math.round(100 - best.dist * 0.65)));

    return {
      name: best.name,
      similarity,
      sentence:
        similarity > 70
          ? `Twoja receptura mocno przypomina ${best.name}. Dla unikalności przesuń delikatnie temperaturę i krzywą RGB.`
          : `Tworzysz autorski look. Najbliżej jest ${best.name}, ale kierunek jest już mocno Twój.`,
    };
  }, [adjustments, hasImage]);

  const pushHistory = (entry) => {
    setHistoryList((current) => [entry, ...current].slice(0, 8));
  };

  const showToast = (msg) => {
    setToast(msg);
    window.clearTimeout(window.__ciemniaToastTimer);
    window.__ciemniaToastTimer = window.setTimeout(() => {
      setToast('');
    }, 2600);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsPreloaderHidden(true);
    }, 800);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    document.title = 'Mindfullens — Wirtualna Ciemnia';
  }, []);

  useEffect(() => {
    setColorGrading((current) => ({
      ...current,
      highlights: {
        ...current.highlights,
        hue: hexToHue(stHighColor),
        saturation: stHigh,
      },
      shadows: {
        ...current.shadows,
        hue: hexToHue(stShadColor),
        saturation: stShad,
      },
    }));
  }, [stHigh, stShad, stHighColor, stShadColor]);

  useEffect(() => {
    drawCurvesPreview(curvesCanvasRef.current, userCurves, activeCurveCh);
  }, [activeCurveCh, userCurves]);

  useEffect(() => {
    const onDocClick = (event) => {
      const dropdown = document.getElementById('toolsDropdown');
      if (dropdown && !dropdown.contains(event.target)) {
        setIsToolsDropdownOpen(false);
      }
    };

    const onEsc = (event) => {
      if (event.key === 'Escape') {
        setIsToolsDropdownOpen(false);
      }
    };

    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onEsc);

    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  useEffect(() => {
    let mouseX = 0;
    let mouseY = 0;
    let cursorX = 0;
    let cursorY = 0;
    let dotX = 0;
    let dotY = 0;

    const cursor = document.getElementById('cursor');
    const cursorDot = document.getElementById('cursorDot');
    const interactive = document.querySelectorAll('a, button, input, .interactive-el, .recipe-card');

    const onMouseMove = (event) => {
      mouseX = event.clientX;
      mouseY = event.clientY;
    };

    const onEnter = () => cursor?.classList.add('hover');
    const onLeave = () => cursor?.classList.remove('hover');

    interactive.forEach((element) => {
      element.addEventListener('mouseenter', onEnter);
      element.addEventListener('mouseleave', onLeave);
    });

    const animate = () => {
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

      window.__ciemniaCursorRaf = requestAnimationFrame(animate);
    };

    document.addEventListener('mousemove', onMouseMove);
    animate();

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      interactive.forEach((element) => {
        element.removeEventListener('mouseenter', onEnter);
        element.removeEventListener('mouseleave', onLeave);
      });
      if (window.__ciemniaCursorRaf) {
        cancelAnimationFrame(window.__ciemniaCursorRaf);
      }
    };
  }, [hasImage]);

  useEffect(() => {
    const scrollProgress = document.getElementById('scrollProgress');
    const scrollText = document.getElementById('scrollText');
    const scrollButton = document.getElementById('scrollBtn');
    const nav = document.getElementById('mainNav');

    const onScroll = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      const current = window.scrollY;
      const percent = total > 0 ? current / total : 0;
      if (scrollProgress) {
        scrollProgress.style.width = `${percent * 100}%`;
      }

      nav?.classList.toggle('scrolled', current > 50);

      if (!scrollButton) {
        return;
      }

      if (percent > 0.25) {
        scrollButton.classList.add('is-aside');
      } else {
        scrollButton.classList.remove('is-aside');
      }

      if (current + window.innerHeight >= document.documentElement.scrollHeight - 50) {
        scrollButton.classList.add('is-flipped');
        if (scrollText) {
          scrollText.textContent = 'DO GÓRY';
        }
      } else {
        scrollButton.classList.remove('is-flipped');
        if (scrollText) {
          scrollText.textContent = 'PRZEWIŃ';
        }
      }
    };

    const onScrollButton = () => {
      const isFlipped = scrollButton?.classList.contains('is-flipped');
      if (isFlipped) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
      }
    };

    window.addEventListener('scroll', onScroll);
    scrollButton?.addEventListener('click', onScrollButton);
    onScroll();

    return () => {
      window.removeEventListener('scroll', onScroll);
      scrollButton?.removeEventListener('click', onScrollButton);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (imageUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  const updateAdjustment = (name, value) => {
    setAdjustments((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const onFileSelected = (file) => {
    if (!file) {
      return;
    }

    setUploadedFile(file);
    setImageUrl((current) => {
      if (current?.startsWith('blob:')) {
        URL.revokeObjectURL(current);
      }
      return URL.createObjectURL(file);
    });

    pushHistory(`Wgrano: ${file.name}`);
    showToast('Zdjęcie wgrane do Ciemni.');
  };

  const handleFileInput = (event) => {
    onFileSelected(event.target.files?.[0]);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    onFileSelected(event.dataTransfer.files?.[0]);
  };

  const applyBasePreset = (preset) => {
    if (!preset) {
      return;
    }

    setActiveBasePreset(preset.name);
    setAdjustments((current) => ({
      ...current,
      ...preset.adjustments,
    }));
    setStHigh(preset.split.high);
    setStShad(preset.split.shad);
    setStHighColor(preset.split.highColor);
    setStShadColor(preset.split.shadColor);
    pushHistory(`Baza: ${preset.name}`);
  };

  const resetRecipe = () => {
    setActiveBasePreset('Neutral');
    setAdjustments({ ...DEFAULT_ADJUSTMENTS });
    setUserCurves(cloneCurves(DEFAULT_CURVES));
    setStHigh(0);
    setStShad(0);
    setStHighColor('#e8c878');
    setStShadColor('#5d7898');
    setColorGrading((current) => ({
      ...current,
      shadows: { hue: 0, saturation: 0, luminance: 0 },
      highlights: { hue: 0, saturation: 0, luminance: 0 },
    }));
    pushHistory('Reset receptury');
    showToast('Receptura została wyczyszczona.');
  };

  const downloadResult = () => {
    if (!hasImage) {
      showToast('Najpierw wgraj zdjęcie.');
      return;
    }

    exportImage();
    showToast('Zapisywanie zdjęcia...');
  };

  const removeFromCart = (index) => {
    setCart((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price, 0);

  const getCurvePosition = (event) => {
    const curvesCanvas = curvesCanvasRef.current;
    if (!curvesCanvas) {
      return [0, 0];
    }

    const rect = curvesCanvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 255;
    const y = (1 - (event.clientY - rect.top) / rect.height) * 255;
    return [x, y];
  };

  const handleCurvePointerDown = (event) => {
    if (event.detail > 1) {
      return;
    }

    event.preventDefault();

    setUserCurves((current) => {
      const points = current[activeCurveCh].map((point) => [...point]);
      const [mouseX, mouseY] = getCurvePosition(event);

      let closestIndex = -1;
      let closestDistance = Number.POSITIVE_INFINITY;

      points.forEach((point, index) => {
        if (index === 0 || index === points.length - 1) {
          return;
        }

        const distance = Math.hypot(point[0] - mouseX, point[1] - mouseY);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      if (closestDistance >= 40) {
        const safeX = Math.round(clamp(mouseX));
        const currentLut = buildLUT(points, 'monotonic');
        const baselineY = currentLut[safeX] ?? Math.round(clamp(mouseY));
        const newPoint = [safeX, Math.round(clamp(baselineY))];
        points.push(newPoint);
        points.sort((left, right) => left[0] - right[0]);
        closestIndex = points.findIndex(
          (point) => point[0] === newPoint[0] && point[1] === newPoint[1]
        );
      }

      dragMetaRef.current = {
        active: true,
        index: closestIndex,
      };

      return {
        ...current,
        [activeCurveCh]: points,
      };
    });
  };

  useEffect(() => {
    const onPointerMove = (event) => {
      if (!dragMetaRef.current.active) {
        return;
      }

      const dragIndex = dragMetaRef.current.index;
      setUserCurves((current) => {
        const points = current[activeCurveCh].map((point) => [...point]);
        if (dragIndex <= 0 || dragIndex >= points.length - 1) {
          return current;
        }

        const [nextX, nextY] = getCurvePosition(event);
        const minX = points[dragIndex - 1][0] + 1;
        const maxX = points[dragIndex + 1][0] - 1;

        points[dragIndex] = [
          Math.round(clamp(nextX, minX, maxX)),
          Math.round(clamp(nextY, 0, 255)),
        ];

        return {
          ...current,
          [activeCurveCh]: points,
        };
      });
    };

    const onPointerUp = () => {
      if (dragMetaRef.current.active) {
        pushHistory(`Krzywa ${activeCurveCh.toUpperCase()}`);
      }

      dragMetaRef.current = {
        active: false,
        index: null,
      };
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [activeCurveCh]);

  const handleCurveDoubleClick = (event) => {
    const [mouseX, mouseY] = getCurvePosition(event);
    const points = userCurves[activeCurveCh];

    let closestIndex = -1;
    let closestDistance = Number.POSITIVE_INFINITY;

    points.forEach((point, index) => {
      const distance = Math.hypot(point[0] - mouseX, point[1] - mouseY);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    if (closestDistance > 22 || closestIndex <= 0 || closestIndex >= points.length - 1) {
      return;
    }

    setUserCurves((current) => ({
      ...current,
      [activeCurveCh]: current[activeCurveCh].filter((_, index) => index !== closestIndex),
    }));

    pushHistory(`Usunięto punkt ${activeCurveCh.toUpperCase()}`);
  };

  const recipeRows = [
    ['Baza', activeBasePreset],
    ['Temperatura', formatSigned(adjustments.temp)],
    ['Tint', formatSigned(adjustments.tint)],
    ['Kontrast', formatSigned(adjustments.contrast)],
    ['Lifted Blacks', formatPercent(adjustments.blacks)],
    ['Fade', formatPercent(adjustments.fade)],
    ['Nasycenie', formatSigned(adjustments.saturation)],
    ['Vibrance', formatSigned(adjustments.vibrance)],
    ['Ziarno', formatPercent(adjustments.userGrain)],
    ['Winieta', formatPercent(adjustments.userVignette)],
    ['Split High', formatPercent(stHigh)],
    ['Split Shad', formatPercent(stShad)],
  ];

  return (
    <div className="ciemnia-page">
      <div id="appToast" className={toast ? 'visible' : ''}>
        {toast}
      </div>
      <div className="cursor" id="cursor" />
      <div className="cursor-dot" id="cursorDot" />

      <div className={`preloader${isPreloaderHidden ? ' hidden' : ''}`} id="preloader">
        <div className="preloader__breath-container">
          <div className="preloader__breath-wave" />
          <div className="preloader__breath-wave" style={{ animationDelay: '1.3s' }} />
          <div className="preloader__breath-core" />
        </div>
        <span className="preloader__text">Wywoływanie...</span>
      </div>

      <div className="scroll-progress" id="scrollProgress" />
      <button id="scrollBtn" className="scroll-indicator-btn interactive-el" type="button">
        <div className="scroll-indicator__mouse" />
        <span id="scrollText" className="scroll-indicator__text">
          Przewiń
        </span>
      </button>

      <nav className="nav" id="mainNav">
        <div className="nav-inner">
          <a href="https://mindfullens.pl/" className="nav-logo interactive-el">
            <img src="/logo.png" alt="Mindfullens Logo" />
            Mindfullens
          </a>

          <div className={`nav-links${isMobileMenuOpen ? ' active' : ''}`} id="navLinks">
            <a href="https://mindfullens.pl" className="nav-link interactive-el">
              Strona Główna
            </a>

            <div className={`nav-dropdown${isToolsDropdownOpen ? ' open' : ''}`} id="toolsDropdown">
              <button
                className="nav-dropdown-trigger interactive-el"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsToolsDropdownOpen((current) => !current);
                }}
                type="button"
              >
                Narzędzia <span className="nav-dropdown-arrow">▾</span>
              </button>
              <div className="mega-menu">
                <div className="mega-menu-grid">
                  <a href="https://mindfullens.pl/film-lab/" className="mega-item interactive-el">
                    <div className="mega-item-icon">⚗️</div>
                    <div className="mega-item-text">
                      <div className="mega-item-name">
                        Film Lab <span className="mega-item-tag mega-item-tag-free">Free</span>
                      </div>
                      <div className="mega-item-desc">Wgraj zdjęcie i nakładaj symulacje klisz w przeglądarce</div>
                    </div>
                  </a>
                  <a href="https://mindfullens.pl/live/" className="mega-item interactive-el">
                    <div className="mega-item-icon">📸</div>
                    <div className="mega-item-text">
                      <div className="mega-item-name">
                        Live Cam <span className="mega-item-tag mega-item-tag-free">Free</span>
                      </div>
                      <div className="mega-item-desc">Testuj profile na żywo kamerą w swoim urządzeniu</div>
                    </div>
                  </a>
                  <a href="https://mindfullens.pl/matcher/" className="mega-item interactive-el">
                    <div className="mega-item-icon">🧠</div>
                    <div className="mega-item-text">
                      <div className="mega-item-name">
                        AI Matcher <span className="mega-item-tag mega-item-tag-pro">AI</span>
                      </div>
                      <div className="mega-item-desc">Wrzuć inspirację — AI dopasuje idealny profil</div>
                    </div>
                  </a>
                  <a href="https://mindfullens.pl/timemachine/" className="mega-item interactive-el">
                    <div className="mega-item-icon">⏳</div>
                    <div className="mega-item-text">
                      <div className="mega-item-name">
                        Time Machine <span className="mega-item-tag mega-item-tag-new">Nowe</span>
                      </div>
                      <div className="mega-item-desc">Cofnij zdjęcie o dekady — symulacja starzenia kliszy</div>
                    </div>
                  </a>
                  <a
                    href="https://mindfullens.pl/ciemnia/"
                    className="mega-item interactive-el"
                    style={{ background: 'var(--surface2)', borderColor: 'var(--border)' }}
                  >
                    <div className="mega-item-icon">🧪</div>
                    <div className="mega-item-text">
                      <div className="mega-item-name">
                        Wirtualna Ciemnia <span className="mega-item-tag mega-item-tag-new">Nowe</span>
                      </div>
                      <div className="mega-item-desc">Stwórz własną recepturę filmową od zera</div>
                    </div>
                  </a>
                  <a href="https://mindfullens.pl/blendstudio/" className="mega-item interactive-el">
                    <div className="mega-item-icon">⚗️</div>
                    <div className="mega-item-text">
                      <div className="mega-item-name">
                        Blend Studio <span className="mega-item-tag mega-item-tag-new">Nowe</span>
                      </div>
                      <div className="mega-item-desc">Miksuj dwie klisze w jedno unikalne zdjęcie</div>
                    </div>
                  </a>
                  <a href="https://mindfullens.pl/contact-sheet/" className="mega-item interactive-el">
                    <div className="mega-item-icon">🎞️</div>
                    <div className="mega-item-text">
                      <div className="mega-item-name">Contact Sheet</div>
                      <div className="mega-item-desc">55 profili na jednym arkuszu — porównaj natychmiast</div>
                    </div>
                  </a>
                  <a href="https://mindfullens.pl/color-sync/" className="mega-item interactive-el">
                    <div className="mega-item-icon">🔄</div>
                    <div className="mega-item-text">
                      <div className="mega-item-name">
                        Color Sync <span className="mega-item-tag mega-item-tag-pro">Pro</span>
                      </div>
                      <div className="mega-item-desc">Zrównaj kolory z 2-3 aparatów jednym kliknięciem</div>
                    </div>
                  </a>
                </div>
                <div className="mega-footer">
                  <span className="mega-footer-text">Wszystkie narzędzia w jednym pakiecie</span>
                  <a href="https://mindfullens.pl/cennik/" className="mega-footer-btn interactive-el">
                    Complete Studio →
                  </a>
                </div>
              </div>
            </div>
            <a href="https://mindfullens.pl/analog-signature/" className="nav-link nav-link-red interactive-el">
              Analog Signature
            </a>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              className="nav-mobile-toggle interactive-el"
              onClick={() => {
                setIsMobileMenuOpen((current) => !current);
                setIsToolsDropdownOpen(false);
              }}
              aria-label="Menu"
              type="button"
            >
              ☰
            </button>
            <button className="nav-cta interactive-el" onClick={() => setIsCartOpen((current) => !current)} type="button">
              Koszyk <span className="cart-count">{cart.length}</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="app-wrapper">
        <div className="app">
          <div className="chem-panel">
            <div className="chem-header">
              <h2>🧪 Ciemnia</h2>
              <p>Ta sama mechanika i profile co Film Lab</p>
            </div>

            <div className="ai-box" id="aiBox">
              <div className="ai-box-title">✦ AI Chemik</div>
              <div className="ai-box-text">{aiMatch.sentence}</div>
            </div>

            <div className="chem-section">
              <div className="chem-section-title">
                <span>🌡️ Wywoływanie — Temperatura</span>
              </div>
              <div className="slider-group">
                <div className="slider-label">
                  <span className="slider-name">Temperatura barwowa</span>
                  <span className="slider-val">{formatSigned(adjustments.temp)}</span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={adjustments.temp}
                  onChange={(event) => updateAdjustment('temp', Number(event.target.value))}
                  className="interactive-el"
                />
              </div>
              <div className="slider-group">
                <div className="slider-label">
                  <span className="slider-name">Tint (magenta-zielony)</span>
                  <span className="slider-val">{formatSigned(adjustments.tint)}</span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={adjustments.tint}
                  onChange={(event) => updateAdjustment('tint', Number(event.target.value))}
                  className="interactive-el"
                />
              </div>
            </div>

            <div className="chem-section">
              <div className="chem-section-title">
                <span>⚗️ Chemia — Kontrast</span>
              </div>
              <div className="slider-group">
                <div className="slider-label">
                  <span className="slider-name">Czas wywoływania (kontrast)</span>
                  <span className="slider-val">{formatSigned(adjustments.contrast)}</span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={adjustments.contrast}
                  onChange={(event) => updateAdjustment('contrast', Number(event.target.value))}
                  className="interactive-el"
                />
              </div>
              <div className="slider-group">
                <div className="slider-label">
                  <span className="slider-name">Lifted blacks (niedowywoł.)</span>
                  <span className="slider-val">{formatPercent(adjustments.blacks)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={adjustments.blacks}
                  onChange={(event) => updateAdjustment('blacks', Number(event.target.value))}
                  className="interactive-el"
                />
              </div>
              <div className="slider-group">
                <div className="slider-label">
                  <span className="slider-name">Fade (blaknięcie)</span>
                  <span className="slider-val">{formatPercent(adjustments.fade)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={adjustments.fade}
                  onChange={(event) => updateAdjustment('fade', Number(event.target.value))}
                  className="interactive-el"
                />
              </div>
            </div>

            <div className="chem-section">
              <div className="chem-section-title">
                <span>🎨 Barwniki — Kolor</span>
              </div>
              <div className="slider-group">
                <div className="slider-label">
                  <span className="slider-name">Nasycenie</span>
                  <span className="slider-val">{formatSigned(adjustments.saturation)}</span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={adjustments.saturation}
                  onChange={(event) => updateAdjustment('saturation', Number(event.target.value))}
                  className="interactive-el"
                />
              </div>
              <div className="slider-group">
                <div className="slider-label">
                  <span className="slider-name">Vibrance</span>
                  <span className="slider-val">{formatSigned(adjustments.vibrance)}</span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={adjustments.vibrance}
                  onChange={(event) => updateAdjustment('vibrance', Number(event.target.value))}
                  className="interactive-el"
                />
              </div>
            </div>

            <div className="chem-section">
              <div className="chem-section-title">
                <span>📐 Krzywe tonalne</span>
              </div>
              <div className="curves-tabs">
                {['rgb', 'r', 'g', 'b'].map((channel) => (
                  <button
                    key={channel}
                    className={`curves-tab interactive-el ${activeCurveCh === channel ? 'active' : ''}`}
                    data-c={channel}
                    type="button"
                    onClick={() => setActiveCurveCh(channel)}
                  >
                    {channel.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="curves-wrap">
                <canvas
                  ref={curvesCanvasRef}
                  id="curvesCanvas"
                  width={310}
                  height={140}
                  className="interactive-el"
                  onPointerDown={handleCurvePointerDown}
                  onDoubleClick={handleCurveDoubleClick}
                />
              </div>
            </div>

            <div className="chem-section">
              <div className="chem-section-title">
                <span>🌈 Split Toning</span>
              </div>
              <div className="split-row">
                <span className="split-label">Światła</span>
                <div className="color-dot interactive-el" style={{ background: stHighColor }}>
                  <input
                    type="color"
                    value={stHighColor}
                    onChange={(event) => setStHighColor(event.target.value)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={stHigh}
                    onChange={(event) => setStHigh(Number(event.target.value))}
                    className="interactive-el"
                  />
                </div>
                <span className="slider-val">{formatPercent(stHigh)}</span>
              </div>
              <div className="split-row">
                <span className="split-label">Cienie</span>
                <div className="color-dot interactive-el" style={{ background: stShadColor }}>
                  <input
                    type="color"
                    value={stShadColor}
                    onChange={(event) => setStShadColor(event.target.value)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={stShad}
                    onChange={(event) => setStShad(Number(event.target.value))}
                    className="interactive-el"
                  />
                </div>
                <span className="slider-val">{formatPercent(stShad)}</span>
              </div>
            </div>

            <div className="chem-section">
              <div className="chem-section-title">
                <span>🎞️ Emulsja — Tekstura</span>
              </div>
              <div className="slider-group">
                <div className="slider-label">
                  <span className="slider-name">Ziarno filmowe</span>
                  <span className="slider-val">{formatPercent(adjustments.userGrain)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={adjustments.userGrain}
                  onChange={(event) => updateAdjustment('userGrain', Number(event.target.value))}
                  className="interactive-el"
                />
              </div>
              <div className="slider-group">
                <div className="slider-label">
                  <span className="slider-name">Winieta</span>
                  <span className="slider-val">{formatPercent(adjustments.userVignette)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={adjustments.userVignette}
                  onChange={(event) => updateAdjustment('userVignette', Number(event.target.value))}
                  className="interactive-el"
                />
              </div>
            </div>
          </div>

          <div className="canvas-area">
            <div className="canvas-center" id="canvasCenter">
              {!hasImage ? (
                <div
                  className="upload-zone interactive-el"
                  id="uploadZone"
                  onClick={openFilePicker}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDrop}
                >
                  <div className="upload-icon">🧪</div>
                  <div className="upload-text">Wgraj zdjęcie testowe</div>
                  <div className="upload-sub">Ta sama mechanika co Film Lab będzie aplikowana na żywo</div>
                  <button className="upload-btn" type="button">
                    Wybierz z dysku
                  </button>
                </div>
              ) : null}
              <canvas ref={canvasRef} id="mainCanvas" style={{ display: hasImage ? 'block' : 'none' }} />
            </div>
            <div className="canvas-bar" id="canvasBar" style={{ display: hasImage ? 'flex' : 'none' }}>
              <button className="bar-btn bar-btn-ghost interactive-el" onClick={openFilePicker} type="button">
                Zmień zdjęcie
              </button>
              <button className="bar-btn bar-btn-ghost interactive-el" onClick={resetRecipe} type="button">
                Wyczyść recepturę
              </button>
              <button className="bar-btn bar-btn-primary interactive-el" onClick={downloadResult} type="button">
                Zapisz wynik
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={FILE_INPUT_ACCEPT}
              style={{ display: 'none' }}
              onChange={handleFileInput}
            />
          </div>

          <div className="recipe-panel">
            <div className="recipe-header">
              <h3>📋 Receptura</h3>
            </div>

            <div style={{ padding: '12px 12px 0' }}>
              <div className="chem-section-title">
                <span>Baza startowa</span>
              </div>
            </div>

            <div className="preset-grid">
              {BASE_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  className={`preset-btn interactive-el ${activeBasePreset === preset.name ? 'active' : ''}`}
                  onClick={() => applyBasePreset(preset)}
                  type="button"
                >
                  {preset.name}
                </button>
              ))}
            </div>

            <div className="recipe-card tilt-element" id="recipeCard">
              <div className="recipe-card-title">Twoja receptura</div>
              <div id="recipeRows">
                {recipeRows.map(([key, value]) => (
                  <div className="recipe-row" key={key}>
                    <span className="recipe-key">{key}</span>
                    <span className="recipe-value">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="recipe-card tilt-element">
              <div className="recipe-card-title">✦ AI rozpoznaje jako...</div>
              <div id="aiMatch" className="ai-match">
                <span className="ai-match-name">{aiMatch.name}</span>
                {aiMatch.similarity !== null ? (
                  <span className="ai-match-score">Podobieństwo: {aiMatch.similarity}%</span>
                ) : null}
              </div>
            </div>

            <div className="history-section">
              <div className="history-title">Historia zmian</div>
              <div id="historyList">
                {historyList.length === 0 ? (
                  <div className="history-item" style={{ color: 'var(--t3)' }}>
                    Brak zmian
                  </div>
                ) : (
                  historyList.map((entry, index) => (
                    <div className="history-item interactive-el" key={`${entry}-${index}`}>
                      {entry}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

      </div>

      <div className={`cart-drawer${isCartOpen ? ' open' : ''}`} id="cartDrawer">
        <div className="cart-drawer-header">
          <div className="cart-drawer-title">Twój Koszyk</div>
          <button className="modal-close interactive-el" onClick={() => setIsCartOpen(false)} type="button">
            ✕
          </button>
        </div>
        <div className="cart-items" id="cartItems">
          {cart.length === 0 ? (
            <div className="cart-empty">Twój koszyk jest pusty. Wybierz pakiet z oferty.</div>
          ) : (
            cart.map((item, index) => (
              <div className="cart-item" key={`${item.name}-${index}`}>
                <div className="cart-item-info">
                  <h4>{item.name}</h4>
                  <div>{item.price} PLN</div>
                </div>
                <button className="cart-item-remove interactive-el" onClick={() => removeFromCart(index)} type="button">
                  Usuń
                </button>
              </div>
            ))
          )}
        </div>
        <div className="cart-footer">
          <div className="cart-total">
            <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1rem', color: 'var(--t2)', fontWeight: 400 }}>
              Razem
            </span>
            <span id="cartTotal">{cartTotal} PLN</span>
          </div>
          <button
            className="btn-footer-checkout interactive-el"
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: '50px',
              background: 'linear-gradient(135deg, var(--film), var(--film2))',
              color: 'var(--bg)',
              fontWeight: 700,
              textTransform: 'uppercase',
              border: 'none',
              cursor: 'pointer',
            }}
            onClick={() => {
              if (cart.length > 0) {
                window.open('https://mindfullens.pl/cennik/', '_self');
              } else {
                showToast('Koszyk jest pusty!');
              }
            }}
            type="button"
          >
            Przejdź do kasy →
          </button>
        </div>
      </div>

    </div>
  );
}
