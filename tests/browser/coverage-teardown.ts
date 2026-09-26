import { report } from './coverage.ts';
export default async function teardown() {
  const result = await report().generate();
  if (!result?.files.some(file => /(?:^|\/)src\/main\.ts$/.test(file.sourcePath)))
    throw new Error('E2E coverage report must include src/main.ts');
}
