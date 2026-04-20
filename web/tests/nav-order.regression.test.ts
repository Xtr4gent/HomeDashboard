import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

function expectOrder(source: string, labels: string[]): void {
  let previousIndex = -1;
  for (const label of labels) {
    const currentIndex = source.indexOf(label);
    expect(currentIndex, `Missing label "${label}" in navigation source`).toBeGreaterThan(-1);
    expect(currentIndex, `Label "${label}" is out of order`).toBeGreaterThan(previousIndex);
    previousIndex = currentIndex;
  }
}

function extractNavBlock(source: string): string {
  const navStart = source.indexOf("<nav");
  const navEnd = source.indexOf("</nav>", navStart);
  if (navStart === -1 || navEnd === -1) {
    return source;
  }
  return source.slice(navStart, navEnd);
}

describe("navigation order regression", () => {
  const orderedTabs = ["Dashboard", "Our Home", "Projections", "Upgrades", "Budget"];

  test("shared app shell preserves tab order", () => {
    const source = readFileSync(resolve(process.cwd(), "app/components/app-shell.tsx"), "utf8");
    expectOrder(extractNavBlock(source), orderedTabs);
  });

  test("dashboard sidebar preserves tab order", () => {
    const source = readFileSync(resolve(process.cwd(), "app/page.tsx"), "utf8");
    expectOrder(extractNavBlock(source), orderedTabs);
  });

  test("budget sidebar preserves tab order", () => {
    const source = readFileSync(resolve(process.cwd(), "app/budget/page.tsx"), "utf8");
    expectOrder(extractNavBlock(source), orderedTabs);
  });
});
