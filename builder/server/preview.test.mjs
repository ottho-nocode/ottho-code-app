import { test } from "node:test";
import assert from "node:assert/strict";
import { staticPreview } from "./preview.mjs";

const DC = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Liste vide</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<style>body{margin:0;font-family:system-ui}</style>
</helmet>
<div style="width: 1280px; height: 800px; background: {{surface}}">
<input autofocus="autofocus"><button style="background: {{accent}}; color: #fff" onclick="alert(1)">Ajouter</button>
<p>{{ copy.hint }}</p>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"accent":{"editor":"color","default":"#1d4ed8"},"surface":{"default":"#fafafa"},"$preview":{"width":1280,"height":800}}'>
class Component extends DCLogic { renderVals() { return { accent: this.props.accent }; } }
</script>
</body>
</html>`;

test("staticPreview : réglages remplacés par leur valeur par défaut, aucun script, aucun gestionnaire", () => {
  const html = staticPreview(DC);
  assert.match(html, /background: #1d4ed8/);
  assert.match(html, /background: #fafafa/);
  assert.equal(/<script/i.test(html), false);
  assert.equal(/onclick/i.test(html), false);
  assert.equal(/autofocus/i.test(html), false);
  assert.equal(/\{\{/.test(html), false);
  assert.match(html, /x-dc, helmet \{ display: contents/);
  assert.match(html, /<title>Liste vide<\/title>/);
});

test("staticPreview : sans bloc de réglages, les trous sont vidés", () => {
  assert.equal(staticPreview("<div>{{rien}}</div>").includes("{{"), false);
});
