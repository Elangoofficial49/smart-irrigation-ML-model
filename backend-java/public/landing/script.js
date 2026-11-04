/**
 * AgroPulse - Modern Agriculture SaaS Landing Page
 * Vanilla JavaScript implementation for interactive components
 */

document.addEventListener("DOMContentLoaded", () => {
  initNavbarScroll();
  initMobileMenu();
  initDropdowns();
  initSmoothScroll();
  initMarqueeDuplication();
});

/**
 * Adds a subtle shadow and backdrop blur enhancement to navbar on scroll
 */
function initNavbarScroll() {
  const header = document.getElementById("siteHeader");
  if (!header) return;

  const handleScroll = () => {
    if (window.scrollY > 15) {
      header.classList.add("scrolled");
    } else {
      header.classList.remove("scrolled");
    }
  };

  window.addEventListener("scroll", handleScroll, { passive: true });
  handleScroll();
}

/**
 * Mobile hamburger navigation drawer toggle
 */
function initMobileMenu() {
  const toggleBtn = document.getElementById("mobileToggle");
  const mobileNav = document.getElementById("mobileNav");
  if (!toggleBtn || !mobileNav) return;

  const toggleMenu = (open) => {
    const isOpen = open !== undefined ? open : !mobileNav.classList.contains("open");
    mobileNav.classList.toggle("open", isOpen);
    toggleBtn.setAttribute("aria-expanded", String(isOpen));
  };

  toggleBtn.addEventListener("click", () => {
    toggleMenu();
  });

  // Close on nav link click
  const navLinks = mobileNav.querySelectorAll(".mobile-nav-link, .btn-pill");
  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      toggleMenu(false);
    });
  });

  // Close on Escape key press
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mobileNav.classList.contains("open")) {
      toggleMenu(false);
      toggleBtn.focus();
    }
  });
}

/**
 * Dropdown menus for "Home" and "Page"
 * Supports hover on desktop and click/tap on touch devices, closing on click outside
 */
function initDropdowns() {
  const dropdownItems = document.querySelectorAll(".has-dropdown");

  dropdownItems.forEach((item) => {
    const link = item.querySelector(".nav-link");

    if (link) {
      link.addEventListener("click", (e) => {
        // Toggle on mobile/touch clicks
        if (window.innerWidth <= 900) {
          e.preventDefault();
          const isOpen = item.classList.contains("open");
          closeAllDropdowns();
          if (!isOpen) {
            item.classList.add("open");
            link.setAttribute("aria-expanded", "true");
          }
        }
      });
    }
  });

  function closeAllDropdowns() {
    dropdownItems.forEach((item) => {
      item.classList.remove("open");
      const link = item.querySelector(".nav-link");
      if (link) link.setAttribute("aria-expanded", "false");
    });
  }

  // Close when clicking outside of dropdowns
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".has-dropdown")) {
      closeAllDropdowns();
    }
  });

  // Close dropdown on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllDropdowns();
    }
  });
}

/**
 * Smooth scrolling for in-page anchors with offset for the sticky header
 */
function initSmoothScroll() {
  const anchorLinks = document.querySelectorAll('a[href^="#"]');

  anchorLinks.forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      const targetId = this.getAttribute("href");
      if (targetId === "#" || targetId.length <= 1) return;

      const targetEl = document.querySelector(targetId);
      if (targetEl) {
        e.preventDefault();
        const headerHeight = document.getElementById("siteHeader")?.offsetHeight || 80;
        const targetPosition = targetEl.getBoundingClientRect().top + window.pageYOffset - headerHeight;

        window.scrollTo({
          top: targetPosition,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
        });
      }
    });
  });
}

/**
 * Ensures the marquee logo track has enough duplicates for seamless CSS scrolling
 */
function initMarqueeDuplication() {
  const track = document.getElementById("marqueeTrack");
  if (!track) return;

  // Clone child elements once to guarantee infinite seamless loop
  const logos = Array.from(track.children);
  logos.forEach((logo) => {
    const clone = logo.cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    track.appendChild(clone);
  });
}
