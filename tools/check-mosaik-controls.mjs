import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LiteralPrimitive,
  TmplAstRecursiveVisitor,
  parseTemplate,
  tmplAstVisitAll,
} from '@angular/compiler';

const workspace = fileURLToPath(new URL('../', import.meta.url));
const labelNames = ['aria-label', 'label'];
const failures = [];
let controls = 0;

class ToggleSwitchVisitor extends TmplAstRecursiveVisitor {
  constructor(path) {
    super();
    this.path = path;
  }

  visitElement(element) {
    if (element.name === 'mosaik-toggle-switch') {
      controls++;
      const named =
        element.attributes.some(({ name, value }) => labelNames.includes(name) && value.trim()) ||
        element.inputs.some(({ name, value }) => {
          if (!labelNames.includes(name) || !value.source?.trim()) return false;
          if (!(value.ast instanceof LiteralPrimitive)) return true;
          return typeof value.ast.value === 'string' && value.ast.value.trim();
        });
      const bound = element.inputs.some(
        ({ name, value }) => ['formField', 'isChecked'].includes(name) && value.source?.trim(),
      );
      const unavailable = element.inputs.some(
        ({ name, value }) =>
          name === 'disabled' && value.ast instanceof LiteralPrimitive && value.ast.value === true,
      );
      if (!named || (!bound && !unavailable)) {
        const line = element.startSourceSpan.start.line + 1;
        failures.push(
          `${this.path}:${line} toggle needs a name and a setting binding or explicit unavailability.`,
        );
      }
    }
    super.visitElement(element);
  }
}

function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      inspect(path);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      const filename = relative(workspace, path);
      const { nodes, errors } = parseTemplate(readFileSync(path, 'utf8'), filename);
      if (errors) failures.push(...errors.map((error) => error.toString()));
      else tmplAstVisitAll(new ToggleSwitchVisitor(filename), nodes);
    }
  }
}

inspect(join(workspace, 'apps/renderer/src'));
if (!controls) failures.push('No renderer Mosaik toggle switches were found.');
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Verified ${controls} named, bound or explicitly unavailable Mosaik toggle switches.`,
  );
}
