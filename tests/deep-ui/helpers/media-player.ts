import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type MediaPlayerFinding = {
  severity: 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  mediaType?: 'video' | 'audio';
  selector?: string;
};

export type MediaPlayerReport = {
  route: string;
  videosFound: number;
  audiosFound: number;
  findings: MediaPlayerFinding[];
};

export async function auditMediaPlayers(page: Page, route: string): Promise<MediaPlayerReport> {
  const routeName = normalizeRoute(route);
  const findings: MediaPlayerFinding[] = [];

  // Token-efficient early exit: skip heavy DOM audit if no media elements present.
  // One cheap querySelector check before the full evaluate round-trip.
  try {
    const hasAnyMedia = await page.evaluate(() =>
      document.querySelector('video, audio, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="dailymotion"]') !== null
    );
    if (!hasAnyMedia) {
      const emptyReport: MediaPlayerReport = { route, videosFound: 0, audiosFound: 0, findings: [] };
      writeJsonArtifact('media-player', `${routeName}-media-player.json`, emptyReport);
      return emptyReport;
    }
  } catch { /* proceed to full audit on pre-check error */ }

  const { videosFound, audiosFound, hasMedia, videoFindings, audioFindings, iframeFindings } =
    await page.evaluate(() => {
      const MAX_CHECKED = 10;

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

      type Finding = {
        severity: 'high' | 'medium' | 'low' | 'info';
        type: string;
        message: string;
        mediaType?: 'video' | 'audio';
        selector?: string;
      };

      const videoFindings: Finding[] = [];
      const audioFindings: Finding[] = [];
      const iframeFindings: Finding[] = [];

      // --- VIDEO ---
      const allVideos = Array.from(document.querySelectorAll<HTMLVideoElement>('video'));
      const videos = allVideos.filter(isVisible).slice(0, MAX_CHECKED);

      for (const video of videos) {
        const sel = selectorFor(video);

        // 1. missing controls
        if (!video.hasAttribute('controls')) {
          const parent = video.parentElement;
          const hasCustomControls = parent
            ? parent.querySelector('[aria-label*="play" i],[aria-label*="pause" i],[class*="control" i],[class*="play" i]') !== null
            : false;
          if (!hasCustomControls) {
            videoFindings.push({
              severity: 'high',
              type: 'video-missing-controls',
              message: 'Video has no controls attribute and no custom control buttons nearby — users cannot control playback',
              mediaType: 'video',
              selector: sel,
            });
          }
        }

        // 2. autoplay unmuted
        if (video.hasAttribute('autoplay') && !video.hasAttribute('muted')) {
          videoFindings.push({
            severity: 'high',
            type: 'video-autoplay-unmuted',
            message: 'Video has autoplay without muted — browser will block this and it violates WCAG 1.4.2',
            mediaType: 'video',
            selector: sel,
          });
        }

        // 3. missing captions
        const tracks = Array.from(video.querySelectorAll<HTMLTrackElement>('track'));
        const hasCaptions = tracks.some(t => t.kind === 'captions' || t.kind === 'subtitles');
        if (!hasCaptions) {
          videoFindings.push({
            severity: 'medium',
            type: 'video-missing-captions',
            message: 'Video has no <track kind="captions"> or <track kind="subtitles"> — WCAG 1.2.2',
            mediaType: 'video',
            selector: sel,
          });
        }

        // 4. missing transcript link
        const parent = video.parentElement;
        let hasTranscriptLink = false;
        if (parent) {
          const links = Array.from(parent.querySelectorAll<HTMLAnchorElement>('a'));
          hasTranscriptLink = links.some(a =>
            /transcript|captions|subtitles/i.test(a.textContent || '') ||
            /transcript|captions|subtitles/i.test(a.getAttribute('aria-label') || '')
          );
        }
        if (!hasTranscriptLink) {
          videoFindings.push({
            severity: 'low',
            type: 'video-missing-transcript-link',
            message: 'No adjacent link with text "transcript", "captions", or "subtitles" found within DOM proximity',
            mediaType: 'video',
            selector: sel,
          });
        }

        // 5. no poster
        if (!video.hasAttribute('poster')) {
          videoFindings.push({
            severity: 'low',
            type: 'video-no-poster',
            message: 'Video has no poster attribute — blank frame shows before load',
            mediaType: 'video',
            selector: sel,
          });
        }

        // 6. empty src
        const hasSrc = video.hasAttribute('src') && video.getAttribute('src') !== '';
        const hasSourceChild = video.querySelector('source') !== null;
        if (!hasSrc && !hasSourceChild) {
          videoFindings.push({
            severity: 'high',
            type: 'video-empty-src',
            message: 'Video has no src attribute and no <source> children — broken video element',
            mediaType: 'video',
            selector: sel,
          });
        }
      }

      // --- AUDIO ---
      const allAudios = Array.from(document.querySelectorAll<HTMLAudioElement>('audio'));
      const audios = allAudios.filter(isVisible).slice(0, MAX_CHECKED);

      for (const audio of audios) {
        const sel = selectorFor(audio);

        // 7. autoplay without muted
        if (audio.hasAttribute('autoplay') && !audio.hasAttribute('muted')) {
          audioFindings.push({
            severity: 'high',
            type: 'audio-autoplay',
            message: 'Audio has autoplay without muted — violates WCAG 1.4.2 and will cause unexpected noise',
            mediaType: 'audio',
            selector: sel,
          });
        }

        // 8. missing controls
        if (!audio.hasAttribute('controls')) {
          const parent = audio.parentElement;
          const hasCustomPlay = parent
            ? parent.querySelector('[aria-label*="play" i],[aria-label*="pause" i],[class*="control" i],[class*="play" i]') !== null
            : false;
          if (!hasCustomPlay) {
            audioFindings.push({
              severity: 'high',
              type: 'audio-missing-controls',
              message: 'Audio has no controls attribute and no custom play button nearby — users cannot control playback',
              mediaType: 'audio',
              selector: sel,
            });
          }
        }

        // 9. empty src
        const hasSrc = audio.hasAttribute('src') && audio.getAttribute('src') !== '';
        const hasSourceChild = audio.querySelector('source') !== null;
        if (!hasSrc && !hasSourceChild) {
          audioFindings.push({
            severity: 'high',
            type: 'audio-empty-src',
            message: 'Audio has no src attribute and no <source> children — broken audio element',
            mediaType: 'audio',
            selector: sel,
          });
        }
      }

      // --- IFRAMES (YouTube / Vimeo / Dailymotion) ---
      const videoIframePatterns = /youtube|vimeo|dailymotion/i;
      const allIframes = Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe'));
      const videoIframes = allIframes.filter(f => {
        const src = f.getAttribute('src') || f.getAttribute('data-src') || '';
        return videoIframePatterns.test(src) && isVisible(f);
      });

      for (const iframe of videoIframes) {
        const sel = selectorFor(iframe);

        // 10. missing title
        if (!iframe.hasAttribute('title') || iframe.getAttribute('title') === '') {
          iframeFindings.push({
            severity: 'medium',
            type: 'iframe-video-missing-title',
            message: 'Embedded video iframe missing title attribute — WCAG 1.1.1 (screen readers cannot describe content)',
            selector: sel,
          });
        }

        // 11. no lazy loading
        if (iframe.getAttribute('loading') !== 'lazy') {
          iframeFindings.push({
            severity: 'low',
            type: 'iframe-video-no-lazy-loading',
            message: 'Embedded video iframe missing loading="lazy" — may hurt page performance',
            selector: sel,
          });
        }
      }

      const videosFound = videos.length + videoIframes.length;
      const audiosFound = audios.length;
      const hasMedia = videosFound > 0 || audiosFound > 0;

      return { videosFound, audiosFound, hasMedia, videoFindings, audioFindings, iframeFindings };
    });

  findings.push(...videoFindings, ...audioFindings, ...iframeFindings);

  if (hasMedia) {
    try {
      await screenshotStep(page, route, 'media-players-found');
    } catch {
      // skip screenshot on failure
    }
  }

  const report: MediaPlayerReport = {
    route,
    videosFound,
    audiosFound,
    findings,
  };

  writeJsonArtifact('media-player', `${routeName}-media-player.json`, report);
  return report;
}
