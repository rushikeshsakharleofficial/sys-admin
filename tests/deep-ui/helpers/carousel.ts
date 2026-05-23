import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type CarouselFinding = {
  severity: 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  carouselIndex?: number;
  selector?: string;
};

export type CarouselReport = {
  route: string;
  carouselsFound: number;
  findings: CarouselFinding[];
};

export async function auditCarousels(page: Page, route: string): Promise<CarouselReport> {
  const routeName = normalizeRoute(route);
  const findings: CarouselFinding[] = [];

  // Token-efficient early exit: skip full audit if no carousel-like element detected.
  try {
    const hasCarousel = await page.evaluate(() =>
      document.querySelector(
        '[class*="carousel" i], [class*="slider" i], [class*="swiper" i], [data-ride="carousel"], [class*="slick" i], [role="region"][aria-roledescription]'
      ) !== null
    );
    if (!hasCarousel) {
      const emptyReport: CarouselReport = { route, carouselsFound: 0, findings: [] };
      writeJsonArtifact('carousel', `${routeName}-carousel.json`, emptyReport);
      return emptyReport;
    }
  } catch { /* proceed to full audit on pre-check error */ }

  type StaticFinding = {
    severity: 'high' | 'medium' | 'low' | 'info';
    type: string;
    message: string;
    carouselIndex: number;
    selector?: string;
  };

  type CarouselMeta = {
    index: number;
    selector: string;
    hasPrevNextButtons: boolean;
    prevNextAreButtons: boolean;
    prevSelector: string | null;
    nextSelector: string | null;
    slideCount: number;
  };

  const { staticFindings, carouselsFound, carouselMetas } = await page.evaluate(() => {
    const CAROUSEL_SELECTORS = [
      '[role="region"][aria-roledescription*="carousel" i]',
      '[class*="carousel" i]',
      '[class*="slider" i]',
      '[class*="swiper" i]',
      '[data-ride="carousel"]',
      '[class*="slick" i]',
    ];

    function isVisible(el: Element): boolean {
      const style = getComputedStyle(el as HTMLElement);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = (el as HTMLElement).getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    function selectorFor(el: Element): string {
      if (el.id) return `#${el.id}`;
      const cls = el.className && typeof el.className === 'string'
        ? el.className.trim().split(/\s+/).slice(0, 2).join('.')
        : '';
      return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
    }

    function hasMultipleSlides(el: Element): boolean {
      // Children that look like slides: direct children with class containing slide/item/cell
      const directChildren = Array.from(el.children);
      const slideChildren = directChildren.filter(child => {
        const cls = child.className && typeof child.className === 'string' ? child.className : '';
        return /slide|item|cell|card/i.test(cls);
      });
      if (slideChildren.length >= 2) return true;
      // Fallback: more than 1 visible direct child
      const visibleChildren = directChildren.filter(isVisible);
      return visibleChildren.length >= 2;
    }

    // De-duplicate: collect candidates, remove descendants of already-found carousels
    const seen = new Set<Element>();
    const candidates: Element[] = [];

    for (const sel of CAROUSEL_SELECTORS) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        if (!isVisible(el)) continue;
        if (!hasMultipleSlides(el)) continue;
        // Skip if an ancestor is already a detected carousel
        let dominated = false;
        for (const s of seen) {
          if (s.contains(el) && s !== el) { dominated = true; break; }
        }
        if (!dominated && !seen.has(el)) {
          seen.add(el);
          candidates.push(el);
        }
      }
    }

    const MAX_CAROUSELS = 3;
    const carousels = candidates.slice(0, MAX_CAROUSELS);

    type SF = {
      severity: 'high' | 'medium' | 'low' | 'info';
      type: string;
      message: string;
      carouselIndex: number;
      selector?: string;
    };

    type CM = {
      index: number;
      selector: string;
      hasPrevNextButtons: boolean;
      prevNextAreButtons: boolean;
      prevSelector: string | null;
      nextSelector: string | null;
      slideCount: number;
    };

    const staticFindings: SF[] = [];
    const carouselMetas: CM[] = [];

    carousels.forEach((carousel, idx) => {
      const sel = selectorFor(carousel);

      // 1. missing role description
      const roleDesc = carousel.getAttribute('aria-roledescription') || '';
      if (!/carousel/i.test(roleDesc)) {
        staticFindings.push({
          severity: 'medium',
          type: 'carousel-missing-role-description',
          message: `Carousel [${idx}] missing aria-roledescription="carousel" — screen readers won't announce it as a carousel`,
          carouselIndex: idx,
          selector: sel,
        });
      }

      // 2. missing label
      const hasLabel =
        (carousel.getAttribute('aria-label') && carousel.getAttribute('aria-label') !== '') ||
        (carousel.getAttribute('aria-labelledby') &&
          document.getElementById(carousel.getAttribute('aria-labelledby')!) !== null);
      if (!hasLabel) {
        staticFindings.push({
          severity: 'medium',
          type: 'carousel-missing-label',
          message: `Carousel [${idx}] has no aria-label or aria-labelledby — WCAG 1.3.1`,
          carouselIndex: idx,
          selector: sel,
        });
      }

      // 3 & 4. prev/next buttons
      const prevEl = carousel.querySelector<Element>(
        '[aria-label*="prev" i],[aria-label*="previous" i],[class*="prev" i],[class*="arrow-left" i],[class*="left-arrow" i]'
      );
      const nextEl = carousel.querySelector<Element>(
        '[aria-label*="next" i],[class*="next" i],[class*="arrow-right" i],[class*="right-arrow" i]'
      );

      const hasPrevNext = prevEl !== null && nextEl !== null;

      if (!hasPrevNext) {
        staticFindings.push({
          severity: 'high',
          type: 'carousel-prev-next-missing',
          message: `Carousel [${idx}] has no identifiable previous/next navigation buttons — users cannot navigate slides`,
          carouselIndex: idx,
          selector: sel,
        });
      }

      let prevNextAreButtons = false;
      if (hasPrevNext && prevEl && nextEl) {
        const prevIsButton =
          prevEl.tagName === 'BUTTON' || prevEl.getAttribute('role') === 'button';
        const nextIsButton =
          nextEl.tagName === 'BUTTON' || nextEl.getAttribute('role') === 'button';
        prevNextAreButtons = prevIsButton && nextIsButton;

        if (!prevNextAreButtons) {
          staticFindings.push({
            severity: 'medium',
            type: 'carousel-no-keyboard-support',
            message: `Carousel [${idx}] prev/next controls are not <button> elements and lack role="button" — keyboard inaccessible`,
            carouselIndex: idx,
            selector: sel,
          });
        }
      }

      // 5. autoplay without pause
      const hasDataInterval = carousel.hasAttribute('data-interval');
      const slides = Array.from(carousel.children);
      const hasAnimatedSlides = slides.some(slide => {
        const style = getComputedStyle(slide as HTMLElement);
        return style.animationName && style.animationName !== 'none' && style.animationDuration !== '0s';
      });
      const appearsAutoplay = hasDataInterval || hasAnimatedSlides;
      const hasPauseButton = carousel.querySelector<Element>(
        '[aria-label*="pause" i],[aria-label*="stop" i],[class*="pause" i],[class*="stop" i]'
      ) !== null;

      if (appearsAutoplay && !hasPauseButton) {
        staticFindings.push({
          severity: 'high',
          type: 'carousel-autoplay-no-pause',
          message: `Carousel [${idx}] appears to autoplay but has no pause/stop button — WCAG 2.2.2 (Pause, Stop, Hide)`,
          carouselIndex: idx,
          selector: sel,
        });
      }

      // 6. dots without label
      const dots = Array.from(
        carousel.querySelectorAll<Element>('[class*="dot" i],[role="tab"]')
      ).filter(isVisible);
      if (dots.length > 0) {
        const unlabelledDots = dots.filter(
          dot => !dot.getAttribute('aria-label') && !dot.getAttribute('aria-labelledby')
        );
        if (unlabelledDots.length > 0) {
          staticFindings.push({
            severity: 'low',
            type: 'carousel-dots-no-label',
            message: `Carousel [${idx}] has ${unlabelledDots.length} indicator dot(s) without aria-label`,
            carouselIndex: idx,
            selector: sel,
          });
        }
      }

      // 7. slide count info
      const directChildren = Array.from(carousel.children);
      const slideChildren = directChildren.filter(child => {
        const cls = child.className && typeof child.className === 'string' ? child.className : '';
        return /slide|item|cell|card/i.test(cls);
      });
      const slideCount = slideChildren.length > 0 ? slideChildren.length : directChildren.filter(isVisible).length;
      staticFindings.push({
        severity: 'info',
        type: 'carousel-slide-count',
        message: `Carousel [${idx}] detected ${slideCount} slide(s)`,
        carouselIndex: idx,
        selector: sel,
      });

      carouselMetas.push({
        index: idx,
        selector: sel,
        hasPrevNextButtons: hasPrevNext,
        prevNextAreButtons,
        prevSelector: prevEl ? selectorFor(prevEl) : null,
        nextSelector: nextEl ? selectorFor(nextEl) : null,
        slideCount,
      });
    });

    return {
      staticFindings,
      carouselsFound: carousels.length,
      carouselMetas,
    };
  });

  findings.push(...staticFindings);

  // Interaction: click next/prev on carousels with proper button controls
  for (const meta of carouselMetas) {
    if (!meta.hasPrevNextButtons || !meta.prevNextAreButtons) continue;
    try {
      // Locate next button inside the carousel container
      const carouselLocator = page.locator(meta.selector).first();
      const nextBtn = carouselLocator.locator(
        '[aria-label*="next" i],[class*="next" i],[class*="arrow-right" i],[class*="right-arrow" i]'
      ).first();
      if (await nextBtn.count() > 0 && await nextBtn.isVisible()) {
        await nextBtn.click();
        await page.waitForTimeout(400);
        await screenshotStep(page, route, `carousel-${meta.index}-after-next-click`);
      }

      const prevBtn = carouselLocator.locator(
        '[aria-label*="prev" i],[aria-label*="previous" i],[class*="prev" i],[class*="arrow-left" i],[class*="left-arrow" i]'
      ).first();
      if (await prevBtn.count() > 0 && await prevBtn.isVisible()) {
        await prevBtn.click();
        await page.waitForTimeout(400);
        await screenshotStep(page, route, `carousel-${meta.index}-after-prev-click`);
      }
    } catch {
      // skip interaction on failure
    }
  }

  const report: CarouselReport = {
    route,
    carouselsFound,
    findings,
  };

  writeJsonArtifact('carousel', `${routeName}-carousel.json`, report);
  return report;
}
