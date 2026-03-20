import { docs } from '@/.source';
import { loader } from 'fumadocs-core/source';

const rawSource = docs.toFumadocsSource();
// fumadocs-mdx v11 returns files as a lazy function, unwrap for fumadocs-core v15
const files = typeof rawSource.files === 'function' ? (rawSource.files as any)() : rawSource.files;

export const source = loader({
  baseUrl: '/docs',
  source: { files },
});
