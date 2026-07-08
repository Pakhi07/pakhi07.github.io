const body = document.body;
const navRobot = document.querySelector(".nav-robot");
const navLinks = Array.from(document.querySelectorAll("[data-section-link]"));
const navSections = Array.from(document.querySelectorAll("[data-nav-section]"));

// ─── Robot nav (main page only) ──────────────────────────────────────────────

if (navRobot && navLinks.length && navSections.length) {
  let robotFrame = 0;
  let currentRobotY = 0;
  let currentRobotX = 19;
  let initialized = false;

  const isMobileNav = () => window.matchMedia("(max-width: 720px)").matches;

  // Returns Y of each star's center relative to .section-nav top.
  // Section-nav is inside a fixed container so these are stable across scroll.
  function getStarYs() {
    const nav = document.querySelector(".section-nav");
    if (!nav) return [];
    const navRect = nav.getBoundingClientRect();
    return navLinks.map((link) => {
      const rect = link.getBoundingClientRect();
      return rect.top - navRect.top + rect.height / 2;
    });
  }

  // Returns absolute document Y of each section's top.
  function getSectionOffsets() {
    return navSections.map((s) => s.getBoundingClientRect().top + window.scrollY);
  }

  // Scroll position at which each section crosses the reading line
  // (30% down the viewport), clamped to the reachable scroll range so
  // the last section is always attainable even when it's shorter than
  // the viewport.
  function getScrollStops(offsets) {
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const readLine = window.innerHeight * 0.3;
    const stops = offsets.map((y) => Math.min(Math.max(0, y - readLine), maxScroll));
    // Guarantee strictly increasing stops so segments never collapse
    for (let i = 1; i < stops.length; i++) {
      if (stops[i] <= stops[i - 1]) stops[i] = stops[i - 1] + 1;
    }
    return stops;
  }

  // Positions nav links along the track proportionally to each section's
  // position in the document (LessWrong-style table of contents).
  // The first star aligns with the intro text; the last sits near the
  // bottom of the track (mirroring where contact ends).
  function layoutNav() {
    const nav = document.querySelector(".section-nav");
    if (!nav || isMobileNav()) {
      navLinks.forEach((link) => { link.style.top = ""; });
      return;
    }

    const navRect = nav.getBoundingClientRect();
    const anchor = document.querySelector("#intro h1") || navSections[0];
    const introDocY = anchor.getBoundingClientRect().top + window.scrollY;
    const offsets = getSectionOffsets();
    const span = offsets[offsets.length - 1] - offsets[0] || 1;

    // Track starts where the intro text sits on screen at load, and ends
    // where the contact heading sits on screen at full scroll — so the
    // first star aligns with intro at the top of the page, and the last
    // star aligns with contact at the bottom.
    const trackTop = Math.max(16, introDocY - navRect.top);
    const available = navRect.height - 40 - trackTop;
    const contactHeading = navSections[navSections.length - 1].querySelector(".eyebrow")
      || navSections[navSections.length - 1];
    const contactDocY = contactHeading.getBoundingClientRect().top + window.scrollY;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const contactRestY = contactDocY - maxScroll - navRect.top + 6;
    const trackSpan = Math.max(80, Math.min(available, contactRestY - trackTop));

    navLinks.forEach((link, i) => {
      const t = (offsets[i] - offsets[0]) / span;
      link.style.top = `${trackTop + t * trackSpan}px`;
    });
  }

  // Segment state: which star pair the robot is between, and eased progress.
  let segIndex = 0;
  let segT = 0;

  // Maps current scroll position to a Y between the appropriate pair of stars.
  function computeTargetY(starYs, stops) {
    const scrollY = window.scrollY;
    const n = stops.length;

    if (scrollY <= stops[0]) {
      segIndex = 0;
      segT = 0;
      return starYs[0];
    }
    if (scrollY >= stops[n - 1]) {
      segIndex = n - 2;
      segT = 1;
      return starYs[n - 1];
    }

    for (let i = 0; i < n - 1; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      if (scrollY >= a && scrollY < b) {
        const t = (scrollY - a) / (b - a);
        // ease-in-out so robot accelerates away from a star and decelerates into the next
        const eased = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
        segIndex = i;
        segT = eased;
        return starYs[i] + (starYs[i + 1] - starYs[i]) * eased;
      }
    }

    segIndex = n - 2;
    segT = 1;
    return starYs[n - 1];
  }

  // Updates .is-active on nav links based on scroll position.
  function updateActiveLink(stops) {
    const scrollY = window.scrollY;
    let activeIdx = 0;
    for (let i = 0; i < stops.length; i++) {
      if (scrollY >= stops[i] - 2) {
        activeIdx = i;
      }
    }
    navLinks.forEach((link, i) => {
      link.classList.toggle("is-active", i === activeIdx);
    });
  }

  let starYs = [];
  let scrollStops = [];

  function recalcPositions() {
    layoutNav();
    starYs = getStarYs();
    scrollStops = getScrollStops(getSectionOffsets());
    updateActiveLink(scrollStops);
  }

  function easeRobot() {
    robotFrame += 0.016;

    const targetY = computeTargetY(starYs, scrollStops);

    if (!initialized) {
      currentRobotY = targetY;
      initialized = true;
    }

    // Lerp toward scroll-driven target
    currentRobotY += (targetY - currentRobotY) * 0.10;

    // Sine ARC per star-to-star segment: sin(t·π) is 0 at both endpoints,
    // so the robot touches every star exactly, swinging out between them.
    // Alternating direction per segment traces an S-curve down the track.
    const dir = segIndex % 2 === 0 ? 1 : -1;
    const targetX = 19 + Math.sin(segT * Math.PI) * 26 * dir;
    currentRobotX += (targetX - currentRobotX) * 0.10;

    // Idle float on top of the path (always active, keeps it alive when still)
    const floatBob = Math.sin(robotFrame * 1.4) * 4;
    const floatSway = Math.sin(robotFrame * 0.9 + 0.8) * 2.5;

    // Lean in the direction of horizontal travel
    const lean = Math.cos(segT * Math.PI) * 9 * dir + Math.sin(robotFrame * 1.1) * 3;

    navRobot.style.setProperty("--robot-y", `${currentRobotY + floatBob}px`);
    navRobot.style.setProperty("--robot-x", `${currentRobotX + floatSway}px`);
    navRobot.style.setProperty("--robot-rotate", `${lean}deg`);

    window.requestAnimationFrame(easeRobot);
  }

  recalcPositions();

  // Fonts and late-loading images shift layout after the initial
  // calculation — recalculate once each settles
  document.fonts.ready.then(() => {
    recalcPositions();
    initialized = false;
  }).catch(() => {});

  window.addEventListener("load", recalcPositions, { once: true });

  window.addEventListener("scroll", () => {
    updateActiveLink(scrollStops);
  }, { passive: true });

  window.addEventListener("resize", () => {
    recalcPositions();
    initialized = false;
  }, { passive: true });

  updateActiveLink(scrollStops);
  window.requestAnimationFrame(easeRobot);
}

// ─── Archive page ─────────────────────────────────────────────────────────────

if (body.classList.contains("archive-page")) {
  const photoMosaic = document.querySelector(".photo-mosaic");
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.querySelector(".lightbox-img");
  const lightboxBackdrop = document.querySelector(".lightbox-backdrop");
  const lightboxClose = document.querySelector(".lightbox-close");
  const lightboxPrev = document.querySelector(".lightbox-prev");
  const lightboxNext = document.querySelector(".lightbox-next");
  let photoItems = [];
  let photos = [];
  let currentPhotoIndex = 0;
  let previousBodyOverflow = "";
  const photoPath = photoMosaic?.dataset.photoPath || "assets/photos";
  const photoLimit = Number(photoMosaic?.dataset.photoLimit) || 120;
  const stopAfterMisses = 8;

  function syncPhotoItems() {
    if (!photoMosaic) return;
    photoItems = Array.from(photoMosaic.querySelectorAll(".photo-mosaic-item"));
    photos = photoItems.map((item) => item.querySelector("img")).filter(Boolean);
  }

  function setPhotoOrientation(image) {
    const item = image.closest(".photo-mosaic-item");
    if (!item || !image.naturalWidth || !image.naturalHeight) return;
    const ratio = image.naturalWidth / image.naturalHeight;
    item.classList.remove("is-portrait", "is-square", "is-landscape", "is-panoramic");
    if (ratio < 0.66) item.classList.add("is-portrait");
    else if (ratio < 1.18) item.classList.add("is-square");
    else if (ratio > 1.55) item.classList.add("is-panoramic");
    else item.classList.add("is-landscape");
  }

  function watchPhotoOrientation(image) {
    if (image.complete) setPhotoOrientation(image);
    else image.addEventListener("load", () => setPhotoOrientation(image), { once: true });
  }

  function showPhoto(index) {
    if (!photos.length || !lightboxImg) return;
    currentPhotoIndex = (index + photos.length) % photos.length;
    lightboxImg.src = photos[currentPhotoIndex].src;
    lightboxImg.alt = photos[currentPhotoIndex].alt || "";
  }

  function openLightbox(index) {
    if (!lightbox) return;
    showPhoto(index);
    previousBodyOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    lightbox.setAttribute("aria-hidden", "false");
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.setAttribute("aria-hidden", "true");
    body.style.overflow = previousBodyOverflow;
    if (lightboxImg) lightboxImg.src = "";
  }

  function addPhotoToMosaic(src) {
    if (!photoMosaic) return;
    const figure = document.createElement("figure");
    const image = document.createElement("img");
    figure.className = "photo-mosaic-item";
    image.src = src;
    image.alt = "";
    image.loading = "eager";
    image.decoding = "async";
    figure.appendChild(image);
    photoMosaic.appendChild(figure);
    watchPhotoOrientation(image);
    syncPhotoItems();
    figure.addEventListener("click", () => {
      openLightbox(photoItems.indexOf(figure));
    });
  }

  function probePhoto(src) {
    return new Promise((resolve) => {
      const image = document.createElement("img");
      image.onload = () => resolve(src);
      image.onerror = () => resolve(null);
      image.src = src;
    });
  }

  async function discoverPhotos() {
    let misses = 0;
    const discoveredPhotos = [];
    for (let number = 1; number <= photoLimit; number += 1) {
      const src = `${photoPath}/${number}.jpg`;
      const loadedSrc = await probePhoto(src);
      if (loadedSrc) {
        discoveredPhotos.push(loadedSrc);
        misses = 0;
      } else if (discoveredPhotos.length) {
        misses += 1;
        if (misses >= stopAfterMisses) break;
      }
    }
    discoveredPhotos.reverse().forEach(addPhotoToMosaic);
  }

  if (photoMosaic) discoverPhotos();

  lightboxBackdrop?.addEventListener("click", closeLightbox);
  lightboxClose?.addEventListener("click", closeLightbox);
  lightboxPrev?.addEventListener("click", () => showPhoto(currentPhotoIndex - 1));
  lightboxNext?.addEventListener("click", () => showPhoto(currentPhotoIndex + 1));

  document.addEventListener("keydown", (event) => {
    if (!lightbox || lightbox.getAttribute("aria-hidden") !== "false") return;
    if (event.key === "Escape") closeLightbox();
    else if (event.key === "ArrowLeft") showPhoto(currentPhotoIndex - 1);
    else if (event.key === "ArrowRight") showPhoto(currentPhotoIndex + 1);
  });
}
