import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docPath = path.join(root, 'docs/hme/EXPORT-MANIFEST-DEPTH-COMPAT-API.md');
const openapiFixturePath = path.join(root, 'docs/hme/openapi/depth-diagnostics.responses.yaml');
const source = fs.readFileSync(docPath, 'utf8');
const fixture = fs.readFileSync(openapiFixturePath, 'utf8').trim();

assert.match(source, /## OpenAPI fragment \(example\)/);
assert.match(source, /docs\/hme\/openapi\/depth-diagnostics\.responses\.yaml/);

const expectedSnapshot = `
paths:
  /api/depth/validate:
    post:
      responses:
        "200":
          description: Non-strict response (warnings allowed)
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok:
                    type: boolean
                    enum: [true]
                  warnings:
                    type: array
                    items:
                      type: object
                      properties:
                        type:
                          type: string
                          enum: [DEPTH_DIAGNOSTICS_WARNING]
                        reason:
                          type: string
                          nullable: true
                        code:
                          type: string
                          nullable: true
        "422":
          description: Strict validation failure
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: string
                    enum: [DEPTH_DIAGNOSTICS_INCOMPATIBLE]
                  reason:
                    type: string
                    nullable: true
                  code:
                    type: string
                    nullable: true
`.trim();

assert.equal(fixture, expectedSnapshot);

console.log('PASS export-manifest-openapi-snippet-integrity');
