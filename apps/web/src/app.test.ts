import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { App } from './App';

it('renders the product name', () => {
  expect(renderToStaticMarkup(createElement(App))).toContain('<h1>Gaveta</h1>');
});
