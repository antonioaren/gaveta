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

const GRAPH_CANVAS = '.graph-view__canvas';
const GRAPH_NODE = '.graph-view__node';
const GRAPH_BODY = '.graph-view__body';

export async function waitForGlobalGraphReady(page: Page): Promise<void> {
  await page.locator(GRAPH_BODY).waitFor({ timeout: 30_000 });
  await page.locator(GRAPH_NODE).first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(900);
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
      ...document.querySelectorAll('.graph-view__edge line'),
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

function graphOverflowsCanvas(metrics: GraphMetrics, padding: number): boolean {
  return (
    metrics.minX < metrics.canvas.left + padding ||
    metrics.minY < metrics.canvas.top + padding ||
    metrics.maxX > metrics.canvas.right - padding ||
    metrics.maxY > metrics.canvas.bottom - padding
  );
}

async function wheelZoomCanvas(
  page: Page,
  canvasCenterX: number,
  canvasCenterY: number,
  zoomIn: boolean,
  steps: number,
): Promise<void> {
  const canvas = page.locator(GRAPH_CANVAS);
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
  const canvas = page.locator(GRAPH_CANVAS);
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

/** Pan so the node/label/edge bounding box is centered in the canvas. */
export async function centerGraphInCanvas(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const metrics = await readGraphMetrics(page);
    if (metrics === null) {
      return;
    }
    const canvasCx = metrics.canvas.left + metrics.canvas.width / 2;
    const canvasCy = metrics.canvas.top + metrics.canvas.height / 2;
    const graphCx = (metrics.minX + metrics.maxX) / 2;
    const graphCy = (metrics.minY + metrics.maxY) / 2;
    const dx = canvasCx - graphCx;
    const dy = canvasCy - graphCy;
    if (Math.hypot(dx, dy) < 3) {
      return;
    }
    await panCanvas(page, canvasCx, canvasCy, canvasCx + dx, canvasCy + dy);
    await page.waitForTimeout(160);
  }
}

/** Zoom out and re-center until nodes, labels, and edges sit inside the canvas with padding. */
export async function ensureGraphFullyVisible(page: Page, padding = 22): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await centerGraphInCanvas(page);
    const metrics = await readGraphMetrics(page);
    if (metrics === null) {
      return;
    }
    if (!graphOverflowsCanvas(metrics, padding)) {
      return;
    }
    const canvasCx = metrics.canvas.left + metrics.canvas.width / 2;
    const canvasCy = metrics.canvas.top + metrics.canvas.height / 2;
    await wheelZoomCanvas(page, canvasCx, canvasCy, false, 2);
    await page.waitForTimeout(180);
  }
}

/** Fit, spread labels, center, and keep the cluster inside the canvas for screenshots. */
export async function prepareGlobalGraphScreenshot(page: Page, fillRatio: number): Promise<void> {
  await fitGlobalGraphView(page, fillRatio);
  await defrayGraphLabels(page);
  await centerGraphInCanvas(page);
  let overlapPairs = await countOverlappingGraphLabels(page);
  if (overlapPairs > 0) {
    await defrayGraphLabels(page);
    await centerGraphInCanvas(page);
    overlapPairs = await countOverlappingGraphLabels(page);
  }
  await ensureGraphFullyVisible(page);
  await centerGraphInCanvas(page);
  if (overlapPairs > 0) {
    await defrayGraphLabels(page);
    await ensureGraphFullyVisible(page);
    await centerGraphInCanvas(page);
  }
}

/** Place labels just outside their nodes for the screenshot (DOM-only, ephemeral). */
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
      const offset = 18;
      const labelX = cx + Math.cos(angle) * offset;
      const labelY = cy + Math.sin(angle) * offset + 4;
      text.setAttribute('x', String(labelX));
      text.setAttribute('y', String(labelY));
      text.setAttribute('text-anchor', Math.cos(angle) >= 0 ? 'start' : 'end');
    }
  });
}

/** Light overlap fix: nudge labels vertically only when they collide. */
export async function defrayGraphLabels(page: Page): Promise<void> {
  await spreadGraphLabelsRadially(page);
  await page.evaluate(() => {
    const labels = [...document.querySelectorAll('.graph-view__label')];
    const readRect = (el: Element): DOMRect => el.getBoundingClientRect();

    const overlaps = (a: DOMRect, b: DOMRect): boolean =>
      !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);

    for (let pass = 0; pass < 12; pass += 1) {
      let moved = false;
      for (let i = 0; i < labels.length; i += 1) {
        for (let j = i + 1; j < labels.length; j += 1) {
          const upper = labels[i] as SVGTextElement;
          const lower = labels[j] as SVGTextElement;
          const a = readRect(upper);
          const b = readRect(lower);
          if (!overlaps(a, b)) {
            continue;
          }
          const dy = Math.min(10, a.bottom - b.top + 3);
          const y = Number.parseFloat(lower.getAttribute('y') ?? '0');
          lower.setAttribute('y', String(y + dy));
          moved = true;
        }
      }
      if (!moved) {
        break;
      }
    }
  });
  await page.waitForTimeout(80);
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
    const selectors = [
      '.explorer',
      '.connections',
      '.health',
      '.shell__main',
      '.note-pane',
      '.visual-editor__content',
    ];
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        el.scrollTop = 0;
      }
    }
  });
}
