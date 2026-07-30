import type { Page } from '@playwright/test';

/**
 * The lower third.
 *
 * Injected into the page rather than composited by ffmpeg, so it moves with
 * the window, respects the device pixel ratio, and needs no font handling in
 * the encoder. It is inert: `pointer-events: none` keeps it out of the way of
 * every click the timeline dispatches underneath it.
 *
 * `clear` runs in a `finally` at the end of a recording. A caption left behind
 * would leak into the next screenshot the suite takes from the same window.
 */

const CAPTION_ID = 'stuffbucket-demo-caption';

/** Where the lower third sits. The overlay puts its card along the bottom. */
export type CaptionPlacement = 'bottom' | 'top';

const CAPTION_CSS = [
  'position:fixed',
  'left:40px',
  'z-index:2147483647',
  'pointer-events:none',
  'padding:14px 22px 15px',
  'border-radius:14px',
  'border:1px solid rgba(255,255,255,0.16)',
  'background:rgba(14,16,21,0.88)',
  'box-shadow:0 18px 44px rgba(0,0,0,0.45)',
  'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
  'color:#e9ecf2',
  'max-width:60%',
].join(';');

/** Show or update the caption on one page. */
export async function setCaption(
  page: Page,
  title: string,
  note?: string,
  placement: CaptionPlacement = 'bottom',
): Promise<void> {
  const css = `${CAPTION_CSS};${placement === 'top' ? 'top:40px' : 'bottom:44px'}`;

  await page.evaluate(
    ({ id, css: style, title: heading, note: subtitle }) => {
      let host = document.getElementById(id);
      if (!host) {
        host = document.createElement('div');
        host.id = id;
        document.body.append(host);
      }
      host.setAttribute('style', style);

      host.textContent = '';

      const line = document.createElement('div');
      line.textContent = heading;
      line.setAttribute(
        'style',
        'font-size:21px;font-weight:600;letter-spacing:-0.01em;line-height:1.2',
      );
      host.append(line);

      if (subtitle) {
        const second = document.createElement('div');
        second.textContent = subtitle;
        second.setAttribute(
          'style',
          'margin-top:5px;font-size:14px;opacity:0.72;line-height:1.35',
        );
        host.append(second);
      }
    },
    { id: CAPTION_ID, css, title, note },
  );
}

/** Remove the caption from one page. Safe to call on a page that has none. */
export async function clearCaption(page: Page): Promise<void> {
  if (page.isClosed()) return;
  await page
    .evaluate((id) => {
      document.getElementById(id)?.remove();
    }, CAPTION_ID)
    .catch(() => undefined);
}
