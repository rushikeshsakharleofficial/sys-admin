import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type PlaceholderFinding = {
  severity: 'high' | 'medium' | 'low';
  type: string;
  message: string;
  selector?: string;
  text?: string;
};

export async function auditPlaceholderContent(page: Page, route: string): Promise<PlaceholderFinding[]> {
  const routeName = normalizeRoute(route);
  const findings: PlaceholderFinding[] = [];

  const domFindings = await page.evaluate((): PlaceholderFinding[] => {
    const results: PlaceholderFinding[] = [];
    const LIMIT = 5;

    function isVisible(el: Element): boolean {
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }

    function countByType(type: string): number {
      return results.filter(f => f.type === type).length;
    }

    // HIGH: lorem-ipsum
    const textEls = Array.from(document.querySelectorAll('p, span, div, h1, h2, h3, h4, h5, h6, li'));
    for (const el of textEls) {
      if (countByType('lorem-ipsum') >= LIMIT) break;
      if (!isVisible(el)) continue;
      const text = el.textContent?.trim() || '';
      if (/lorem ipsum/i.test(text)) {
        results.push({
          severity: 'high',
          type: 'lorem-ipsum',
          message: `Lorem ipsum placeholder text found`,
          selector: el.tagName.toLowerCase(),
          text: text.slice(0, 100),
        });
      }
    }

    // HIGH: placeholder-href
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a'));
    for (const a of anchors) {
      if (countByType('placeholder-href') >= LIMIT) break;
      if (!isVisible(a)) continue;
      const href = a.getAttribute('href') || '';
      const text = a.innerText?.trim() || '';
      if (text.length > 0 && (href === '#' || href === '' || href === 'javascript:void(0)' || href === 'javascript:;')) {
        results.push({
          severity: 'high',
          type: 'placeholder-href',
          message: `Anchor with placeholder href "${href}" has visible text`,
          selector: 'a',
          text: text.slice(0, 80),
        });
      }
    }

    // HIGH: hardcoded-test-email
    const emailPatterns = [/test@\S+/i, /example@\S+/i, /user@example\.\S+/i, /admin@example\.\S+/i, /foo@bar\.\S+/i];
    const allTextEls = Array.from(document.querySelectorAll('*'));
    for (const el of allTextEls) {
      if (countByType('hardcoded-test-email') >= LIMIT) break;
      if (!isVisible(el)) continue;
      if (el.children.length > 0) continue;
      const text = el.textContent?.trim() || '';
      for (const pat of emailPatterns) {
        if (pat.test(text)) {
          results.push({
            severity: 'high',
            type: 'hardcoded-test-email',
            message: `Hardcoded test email address found in visible text`,
            selector: el.tagName.toLowerCase(),
            text: text.slice(0, 80),
          });
          break;
        }
      }
    }

    // HIGH: exposed-secret-pattern
    const secretPrefixes: Array<{ prefix: string; minAfter: number }> = [
      { prefix: 'sk-', minAfter: 10 },
      { prefix: 'pk_live_', minAfter: 10 },
      { prefix: 'pk_test_', minAfter: 10 },
      { prefix: 'AIza', minAfter: 10 },
      { prefix: 'ghp_', minAfter: 10 },
      { prefix: 'AKIA', minAfter: 10 },
      { prefix: 'xoxb-', minAfter: 10 },
    ];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode()) !== null) {
      if (countByType('exposed-secret-pattern') >= LIMIT) break;
      const parent = node.parentElement;
      if (!parent || !isVisible(parent)) continue;
      const text = node.nodeValue || '';
      for (const { prefix, minAfter } of secretPrefixes) {
        const idx = text.indexOf(prefix);
        if (idx !== -1 && text.slice(idx + prefix.length).match(new RegExp(`^[\\w\\-]{${minAfter},}`))) {
          results.push({
            severity: 'high',
            type: 'exposed-secret-pattern',
            message: `Potential exposed secret with prefix "${prefix}" found in visible text`,
            selector: parent.tagName.toLowerCase(),
            text: text.slice(idx, idx + prefix.length + 20) + '...',
          });
          break;
        }
      }
    }

    // MEDIUM: todo-placeholder
    const todoPattern = /\b(TODO|FIXME|TBD|Coming Soon|Under Construction|Work in Progress|WIP)\b/i;
    for (const el of textEls) {
      if (countByType('todo-placeholder') >= LIMIT) break;
      if (!isVisible(el)) continue;
      const text = el.textContent?.trim() || '';
      if (todoPattern.test(text)) {
        results.push({
          severity: 'medium',
          type: 'todo-placeholder',
          message: `TODO/placeholder marker found in visible text`,
          selector: el.tagName.toLowerCase(),
          text: text.slice(0, 100),
        });
      }
    }

    // MEDIUM: placeholder-name
    const namePatterns = [/\bJohn Doe\b/i, /\bJane Doe\b/i, /\bJohn Smith\b/i, /\bJane Smith\b/i, /\bFirst Name\b/i, /\bLast Name\b/i];
    const nonInputEls = Array.from(document.querySelectorAll('p, span, div, h1, h2, h3, h4, h5, h6, li, td, th, label'));
    for (const el of nonInputEls) {
      if (countByType('placeholder-name') >= LIMIT) break;
      if (!isVisible(el)) continue;
      const text = el.textContent?.trim() || '';
      for (const pat of namePatterns) {
        if (pat.test(text)) {
          results.push({
            severity: 'medium',
            type: 'placeholder-name',
            message: `Generic placeholder name found in visible text`,
            selector: el.tagName.toLowerCase(),
            text: text.slice(0, 80),
          });
          break;
        }
      }
    }

    // MEDIUM: placeholder-phone
    const phonePatterns = [/\(555\)/, /555-0100/, /555-1234/, /\+1 555/];
    for (const el of nonInputEls) {
      if (countByType('placeholder-phone') >= LIMIT) break;
      if (!isVisible(el)) continue;
      const text = el.textContent?.trim() || '';
      for (const pat of phonePatterns) {
        if (pat.test(text)) {
          results.push({
            severity: 'medium',
            type: 'placeholder-phone',
            message: `Placeholder phone number found in visible text`,
            selector: el.tagName.toLowerCase(),
            text: text.slice(0, 80),
          });
          break;
        }
      }
    }

    // MEDIUM: placeholder-image
    const placeholderImgPatterns = ['placeholder', 'via.placeholder', 'placehold.it', 'picsum', 'dummyimage', 'lorempixel', 'placekitten', 'fillmurray'];
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
    for (const img of imgs) {
      if (countByType('placeholder-image') >= LIMIT) break;
      if (!isVisible(img)) continue;
      const src = img.getAttribute('src') || '';
      if (placeholderImgPatterns.some(p => src.toLowerCase().includes(p))) {
        results.push({
          severity: 'medium',
          type: 'placeholder-image',
          message: `Image src points to a placeholder image service`,
          selector: 'img',
          text: src.slice(0, 100),
        });
      }
    }

    // MEDIUM: ai-generator-leftover
    const genericTexts = new Set(['button', 'click me', 'link', 'label', 'title', 'subtitle']);
    const clickableEls = Array.from(document.querySelectorAll<HTMLElement>('button, a'));
    for (const el of clickableEls) {
      if (countByType('ai-generator-leftover') >= LIMIT) break;
      if (!isVisible(el)) continue;
      const text = (el.innerText || el.textContent || '').trim().toLowerCase();
      if (genericTexts.has(text)) {
        results.push({
          severity: 'medium',
          type: 'ai-generator-leftover',
          message: `Button/link has generic AI-generated placeholder text: "${text}"`,
          selector: el.tagName.toLowerCase(),
          text: text,
        });
      }
    }

    // MEDIUM: default-page-title
    const genericTitles = ['my app', 'react app', 'vite app', 'next.js app', 'create react app', 'untitled', 'home | website', 'welcome to my website'];
    if (countByType('default-page-title') < LIMIT) {
      const title = document.title?.trim().toLowerCase() || '';
      if (genericTitles.some(g => title === g || title.includes(g))) {
        results.push({
          severity: 'medium',
          type: 'default-page-title',
          message: `Page title looks like a default/placeholder: "${document.title}"`,
          text: document.title,
        });
      }
    }

    // LOW: copyright-placeholder
    const copyrightPattern = /©\s*\d{4}\s*(Your Company|Company Name|your company|company name)/i;
    const allRightsGeneric = /All Rights Reserved/i;
    for (const el of nonInputEls) {
      if (countByType('copyright-placeholder') >= LIMIT) break;
      if (!isVisible(el)) continue;
      const text = el.textContent?.trim() || '';
      if (copyrightPattern.test(text) || (allRightsGeneric.test(text) && /Your Company|Company Name/i.test(text))) {
        results.push({
          severity: 'low',
          type: 'copyright-placeholder',
          message: `Copyright notice contains generic placeholder company name`,
          selector: el.tagName.toLowerCase(),
          text: text.slice(0, 100),
        });
      }
    }

    // LOW: broken-alt-text
    const soloAltWords = new Set(['image', 'photo', 'picture', 'icon', 'logo']);
    for (const img of imgs) {
      if (countByType('broken-alt-text') >= LIMIT) break;
      if (!isVisible(img)) continue;
      const alt = (img.getAttribute('alt') || '').trim().toLowerCase();
      if (soloAltWords.has(alt)) {
        results.push({
          severity: 'low',
          type: 'broken-alt-text',
          message: `Image alt text is a single generic word: "${img.getAttribute('alt')}"`,
          selector: 'img',
          text: img.getAttribute('alt') || '',
        });
      }
    }

    return results;
  });

  findings.push(...domFindings);

  const hasHigh = findings.some(f => f.severity === 'high');
  if (hasHigh) {
    try {
      await screenshotStep(page, route, 'placeholder-content-high');
    } catch (_) {}
  }

  writeJsonArtifact('placeholder-content', `${routeName}-placeholder-content.json`, findings);
  return findings;
}
