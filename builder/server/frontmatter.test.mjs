import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter } from "./frontmatter.mjs";

test("lit les clés simples et le corps", () => {
  const { data, body } = parseFrontmatter("---\nname: architect\nmodel: opus\n---\n\nTu es l'architecte.\n");
  assert.deepEqual(data, { name: "architect", model: "opus" });
  assert.equal(body.trim(), "Tu es l'architecte.");
});

test("garde les deux-points dans la valeur", () => {
  const { data } = parseFrontmatter("---\ndescription: Phase Plan : le plan technique\n---\n");
  assert.equal(data.description, "Phase Plan : le plan technique");
});

test("retire les guillemets englobants", () => {
  const { data } = parseFrontmatter('---\nname: "tester"\n---\n');
  assert.equal(data.name, "tester");
});

test("accepte les fins de ligne CRLF", () => {
  const { data, body } = parseFrontmatter("---\r\nname: devops\r\n---\r\nCorps");
  assert.equal(data.name, "devops");
  assert.equal(body, "Corps");
});

test("sans frontmatter : data vide, corps intact", () => {
  const { data, body } = parseFrontmatter("# Juste du markdown");
  assert.deepEqual(data, {});
  assert.equal(body, "# Juste du markdown");
});
