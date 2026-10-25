import type { Page } from 'playwright';

interface ClientRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

interface GraphMetrics {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly canvas: ClientRect;
}

export async function waitForGlobalGraphReady(page: Page, globalGraphHeading: string): Promise<void> {
  await page.getByRole('heading', { name: globalGraphHeading }).waitFor();
  await page.locator('.graph-view__node').first().waitFor({ timeout: 30_000 });
  await page.getByText('Preparando vista').waitFor({ state: 'hidden', timeout: 30_000 });
  await page.getByText('Cargando grafo').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {
    /* already rendered */
  });
  await page.waitForTimeout(600);
}

async function readGraphMetrics(page: Page): Promise<GraphMetrics | null> {
  return page.evaluate(() => {
    const canvasEl = document.querySelector('.graph-view__canvas');
    if (canvasEl === null) {
      return null;
    }
    const canvas = canvasEl.getBoundingClientRect();
    const targets = [
      ...document.querySelectorAll('.graph-view__node'),
      ...document.querySelectorAll('.graph-view__label'),
    ];
    if (targets.length === 0) {
      return null;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const el of targets) {
      const r = el.getBoundingClientRect();
      minX = Math.min(minX, r.left);
      minY = Math.min(minY, r.top);
      maxX = Math.max(maxX, r.right);
      maxY = Math.max(maxY, r.bottom);
    }
    return {
      minX,
      minY,
      maxX,
      maxY,
      canvas: {
        left: canvas.left,
        top: canvas.top,
        right: canvas.right,
        bottom: canvas.bottom,
        width: canvas.width,
        height: canvas.height,
      },
    };
  });
}

async function wheelZoomCanvas(
  page: Page,
  canvasCenterX: number,
  canvasCenterY: number,
  zoomIn: boolean,
  steps: number,
): Promise<void> {
  const canvas = page.locator('.graph-view__canvas');
  const box = await canvas.boundingBox();
  if (box !== null) {
    const localX = canvasCenterX - box.x;
    const localY = canvasCenterY - box.y;
    await canvas.hover({ position: { x: localX, y: localY } });
  }
  await page.mouse.move(canvasCenterX, canvasCenterY);
  const delta = zoomIn ? -100 : 100;
  for (let step = 0; step < steps; step += 1) {
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(25);
  }
}

async function panCanvas(
  page: Page,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): Promise<void> {
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps: 12 });
  await page.mouse.up();
}

/** Zoom and pan the global graph canvas so nodes fill ~fillRatio of the viewport. */
export async function fitGlobalGraphView(page: Page, fillRatio = 0.8): Promise<void> {
  const canvas = page.locator('.graph-view__canvas');
  await canvas.waitFor();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const metrics = await readGraphMetrics(page);
    if (metrics === null) {
      throw new Error('global graph metrics unavailable');
    }

    const graphW = Math.max(metrics.maxX - metrics.minX, 1);
    const graphH = Math.max(metrics.maxY - metrics.minY, 1);
    const canvasCx = metrics.canvas.left + metrics.canvas.width / 2;
    const canvasCy = metrics.canvas.top + metrics.canvas.height / 2;

    const targetW = metrics.canvas.width * fillRatio;
    const targetH = metrics.canvas.height * fillRatio;
    const scale = Math.min(targetW / graphW, targetH / graphH);

    if (scale > 1.04) {
      const steps = Math.min(48, Math.ceil(Math.log(scale) / Math.log(1.1)));
      await wheelZoomCanvas(page, canvasCx, canvasCy, true, steps);
      await page.waitForTimeout(250);
    } else if (scale < 0.96) {
      const steps = Math.min(32, Math.ceil(Math.log(1 / scale) / Math.log(1.1)));
      await wheelZoomCanvas(page, canvasCx, canvasCy, false, steps);
      await page.waitForTimeout(250);
    }

    const afterZoom = await readGraphMetrics(page);
    if (afterZoom === null) {
      continue;
    }
    const nextCx = (afterZoom.minX + afterZoom.maxX) / 2;
    const nextCy = (afterZoom.minY + afterZoom.maxY) / 2;
    const dx = canvasCx - nextCx;
    const dy = canvasCy - nextCy;
    if (Math.hypot(dx, dy) > 4) {
      await panCanvas(page, canvasCx, canvasCy, canvasCx + dx, canvasCy + dy);
      await page.waitForTimeout(200);
    }
  }
}

/** Place labels outside the node cluster for the screenshot (DOM-only, ephemeral). */
export async function spreadGraphLabelsRadially(page: Page): Promise<void> {
  await page.evaluate(() => {
    const groups = [...document.querySelectorAll('.graph-view__node-group')];
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (const group of groups) {
      const circle = group.querySelector('circle');
      if (circle === null) {
        continue;
      }
      sumX += Number.parseFloat(circle.getAttribute('cx') ?? '0');
      sumY += Number.parseFloat(circle.getAttribute('cy') ?? '0');
      count += 1;
    }
    const centerX = count === 0 ? 600 : sumX / count;
    const centerY = count === 0 ? 400 : sumY / count;

    for (const group of groups) {
      const circle = group.querySelector('circle');
      const text = group.querySelector('text');
      if (circle === null || text === null) {
        continue;
      }
      const cx = Number.parseFloat(circle.getAttribute('cx') ?? '0');
      const cy = Number.parseFloat(circle.getAttribute('cy') ?? '0');
      const angle = Math.atan2(cy - centerY, cx - centerX);
      const offset = 22;
      const labelX = cx + Math.cos(angle) * offset;
      const labelY = cy + Math.sin(angle) * offset + 4;
      text.setAttribute('x', String(labelX));
      text.setAttribute('y', String(labelY));
      text.setAttribute('text-anchor', Math.cos(angle) >= 0 ? 'start' : 'end');
    }
  });
}

/** Nudge SVG labels apart for the screenshot (does not persist; React owns the DOM). */
export async function defrayGraphLabels(page: Page): Promise<void> {
  await spreadGraphLabelsRadially(page);
  await page.evaluate(() => {
    const labels = [...document.querySelectorAll('.graph-view__label')];
    const readRect = (el: Element): DOMRect => el.getBoundingClientRect();

    const overlaps = (a: DOMRect, b: DOMRect): boolean =>
      !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);

    for (let pass = 0; pass < 24; pass += 1) {
      let moved = false;
      for (let i = 0; i < labels.length; i += 1) {
        for (let j = i + 1; j < labels.length; j += 1) {
          const left = labels[i] as SVGTextElement;
          const right = labels[j] as SVGTextElement;
          const a = readRect(left);
          const b = readRect(right);
          if (!overlaps(a, b)) {
            continue;
          }
          const dy = a.bottom - b.top + 2;
          const y = Number.parseFloat(right.getAttribute('y') ?? '0');
          right.setAttribute('y', String(y + dy));
          moved = true;
        }
      }
      if (!moved) {
        break;
      }
    }

    for (let pass = 0; pass < 12; pass += 1) {
      let moved = false;
      for (let i = 0; i < labels.length; i += 1) {
        for (let j = i + 1; j < labels.length; j += 1) {
          const left = labels[i] as SVGTextElement;
          const right = labels[j] as SVGTextElement;
          const a = readRect(left);
          const b = readRect(right);
          if (!overlaps(a, b)) {
            continue;
          }
          const shift = j % 2 === 0 ? -14 : 14;
          const x = Number.parseFloat(right.getAttribute('x') ?? '0');
          right.setAttribute('x', String(x + shift));
          moved = true;
        }
      }
      if (!moved) {
        break;
      }
    }
  });
  await page.waitForTimeout(100);
}

export async function countOverlappingGraphLabels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const labels = [...document.querySelectorAll('.graph-view__label')];
    let pairs = 0;
    for (let i = 0; i < labels.length; i += 1) {
      for (let j = i + 1; j < labels.length; j += 1) {
        const a = labels[i].getBoundingClientRect();
        const b = labels[j].getBoundingClientRect();
        if (!(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)) {
          pairs += 1;
        }
      }
    }
    return pairs;
  });
}

export async function scrollApplicationToTop(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const selectors = ['.explorer', '.connections', '.health', '.shell__main', '.note-pane', '.visual-editor__content'];
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        el.scrollTop = 0;
      }
    }
  });
}
