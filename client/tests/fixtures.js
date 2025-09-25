// Reusable auth helper (placeholder)
import { test as base } from '@playwright/test';

export const test = base.extend({
  storageState: async ({}, use) => {
    // Could preload a logged-in state if backend endpoint available
    await use();
  }
});
export { expect } from '@playwright/test';
