/**
 * Validates real HTTP responses against openapi.yaml (ADR 0001), so the spec and the
 * implementation cannot drift apart unnoticed.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import type { LightMyRequestResponse } from 'fastify';
import { expect } from 'vitest';
import { parse } from 'yaml';

interface MediaType {
  schema?: unknown;
}
interface ResponseObject {
  $ref?: string;
  content?: Record<string, MediaType>;
  headers?: Record<string, unknown>;
}
interface Operation {
  responses: Record<string, ResponseObject>;
}
export interface OpenApiDocument {
  servers: { url: string }[];
  paths: Record<string, Record<string, Operation>>;
  components: { responses: Record<string, ResponseObject> };
}

const specPath = fileURLToPath(import.meta.resolve('@vinylshelf/contract/openapi.yaml'));
export const spec = parse(readFileSync(specPath, 'utf8')) as OpenApiDocument;

const SPEC_ID = 'openapi.json';
// The OpenAPI document is not itself a JSON Schema, so it is registered without
// meta-validation; its schema objects are referenced by JSON pointer.
const ajv = new Ajv2020({ strict: false, allErrors: true, validateSchema: false });
// ajv-formats is CommonJS: under NodeNext the default import is module.exports, and
// the plugin function is its `default` property.
addFormatsModule.default(ajv);
ajv.addSchema(spec, SPEC_ID);

const pointer = (...segments: string[]) =>
  segments.map((s) => s.replaceAll('~', '~0').replaceAll('/', '~1')).join('/');

export type HttpMethod = 'get' | 'post' | 'put' | 'delete';

/**
 * Asserts that a response is one the spec documents for this operation: the status is
 * listed, and the body validates against that response's schema for its content type.
 */
export function expectToMatchContract(
  method: HttpMethod,
  pathTemplate: string,
  res: LightMyRequestResponse,
): void {
  const operation = spec.paths[pathTemplate]?.[method];
  expect(operation, `${method.toUpperCase()} ${pathTemplate} is not in openapi.yaml`).toBeDefined();

  const status = String(res.statusCode);
  let response = operation?.responses[status];
  expect(
    response,
    `${status} is not documented for ${method.toUpperCase()} ${pathTemplate}`,
  ).toBeDefined();

  let schemaPath = `#/${pointer('paths', pathTemplate, method, 'responses', status)}`;
  if (response?.$ref) {
    const name = response.$ref.replace('#/components/responses/', '');
    response = spec.components.responses[name];
    schemaPath = `#/${pointer('components', 'responses', name)}`;
  }

  const contentType = (res.headers['content-type'] ?? '').split(';')[0] ?? '';
  if (!response?.content) {
    expect(res.body, `${status} should have no body`).toBe('');
    return;
  }
  expect(
    Object.keys(response.content),
    `content type ${contentType} not documented for ${status}`,
  ).toContain(contentType);

  const validate = ajv.compile({
    $ref: `${SPEC_ID}${schemaPath}/${pointer('content', contentType, 'schema')}`,
  });
  const valid = validate(res.json());
  expect(valid, ajv.errorsText(validate.errors, { dataVar: 'response' })).toBe(true);
}
